/**
 * Windows Computer Use provider (Phase 5/6): a thin adapter over the native
 * helper protocol. It owns NO window/session state — the helper process does —
 * so it forwards `ctx.computerUse` calls as protocol requests and re-brands the
 * returned ids. Staleness, target identity, and policy are enforced inside the
 * helper (fail-closed); this provider only propagates the helper's errors.
 * @module dsh-computer-use/providers/windows
 */

import type {
  ActRequest,
  ComputerUseObservation,
  ComputerUseProvider,
  ComputerUseScreenshot,
  ComputerUseSession,
  ComputerUseTarget,
  ObserveRequest,
  StartRequest,
  StopRequest,
} from '../types.ts'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, relative } from 'node:path'
import { brand } from '../ids.ts'
import type {
  ComputerUseObservationId,
  ComputerUseScreenshotId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from '../ids.ts'
import { ComputerUseError } from '../errors.ts'
import { NativeHelperTransport, type Connection } from '../native/transport.ts'
import { PROTOCOL_VERSION } from '../native/protocol.ts'
import type { NativeEvent } from '../native/protocol.ts'

interface RawTarget {
  targetId: string
  kind: 'browser-page' | 'window'
  title: string
  url?: string
  process?: string
}

interface RawNativeScreenshot {
  screenshotId: string
  width: number
  height: number
  filePath: string
  sha256: string
  bytes: number
  mediaType: 'image/png'
}

interface RawStoredScreenshot {
  screenshotId: string
  width: number
  height: number
  attachmentId: string
  bytes: number
  mediaType: ComputerUseScreenshot['mediaType']
}

/** The helper returns plain ids and an out-of-band screenshot file. */
type RawObservation = Omit<ComputerUseObservation, 'sessionId' | 'targetId' | 'observationId' | 'screenshot'> & {
  sessionId: string
  targetId: string
  observationId: string
  screenshot?: RawNativeScreenshot | RawStoredScreenshot
}

export interface WindowsProviderOptions {
  /** Per-request helper timeout (ms). Defaults to 10000. */
  timeoutMs?: number
  /** Durable Harness image store used to ingest helper temp files. */
  attachments?: AttachmentStore
  /** Target-window state. `minimized` activates first, then minimizes. */
  windowState?: 'normal' | 'maximized' | 'minimized'
}

/**
 * The Windows provider. `connection` is the transport's wire channel; the real
 * deployment passes a {@link PipeConnection}, tests pass a mock.
 */
export class WindowsComputerUseProvider implements ComputerUseProvider {
  readonly id = 'windows'

  private readonly transport: NativeHelperTransport
  private readonly attachments: AttachmentStore | undefined
  private readonly windowState: 'normal' | 'maximized' | 'minimized'
  private seq = 0
  private disposed = false

  constructor(connection: Connection, options?: WindowsProviderOptions) {
    this.transport = new NativeHelperTransport(connection, options?.timeoutMs ?? 10_000)
    this.attachments = options?.attachments
    this.windowState = options?.windowState ?? 'normal'
    this.transport.onEvent(event => this.onHelperEvent(event))
  }

  available(): boolean {
    return !this.disposed
  }

  /** Close the helper connection. */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.transport.close()
  }

  async start(request: StartRequest, signal?: AbortSignal): Promise<ComputerUseSession> {
    const sessionId = request.sessionId ?? brand<ComputerUseSessionId>(`win-session-${++this.seq}`)
    await this.transport.request('handshake', {
      protocolVersion: PROTOCOL_VERSION,
      nonce: randomUUID(),
      windowState: this.windowState,
    }, signal)
    const targets = await this.listTargets(sessionId, signal)
    return { sessionId, providerId: this.id, targets }
  }

  async listTargets(sessionId: ComputerUseSessionId, signal?: AbortSignal): Promise<readonly ComputerUseTarget[]> {
    const result = await this.transport.request('listTargets', { sessionId }, signal) as { targets?: RawTarget[] } | undefined
    return (result?.targets ?? []).map(target => this.toTarget(target))
  }

  async observe(request: ObserveRequest, signal?: AbortSignal): Promise<ComputerUseObservation> {
    const result = await this.transport.request('observe', {
      sessionId: request.sessionId,
      targetId: request.targetId,
      include: request.include,
    }, signal) as { observation?: RawObservation } | undefined
    return await this.toObservation(result?.observation)
  }

  async act(request: ActRequest, signal?: AbortSignal): Promise<ComputerUseObservation> {
    const result = await this.transport.request('act', {
      sessionId: request.sessionId,
      targetId: request.targetId,
      observationId: request.observationId,
      action: request.action,
    }, signal) as { observation?: RawObservation } | undefined
    return await this.toObservation(result?.observation)
  }

  async stop(request: StopRequest): Promise<void> {
    await this.transport.request('stop', { sessionId: request.sessionId })
  }

  /** Helper-pushed events; Phase 6 invalidates cached state on these. */
  private onHelperEvent(_event: NativeEvent): void {
    // 'target-changed' | 'interrupted' | 'crashed' — handled by the provider
    // when it owns observation caching (Phase 6).
  }

  private toTarget(raw: RawTarget): ComputerUseTarget {
    return {
      targetId: brand<ComputerUseTargetId>(raw.targetId),
      kind: raw.kind,
      title: raw.title,
      url: raw.url,
      process: raw.process,
    }
  }

  private async toObservation(raw: RawObservation | undefined): Promise<ComputerUseObservation> {
    if (raw === undefined) {
      throw new ComputerUseError('native helper returned no observation', 'PROTOCOL_MISMATCH')
    }
    const screenshot = raw.screenshot === undefined
      ? undefined
      : await this.ingestScreenshot(raw.screenshot)
    return {
      ...raw,
      sessionId: brand<ComputerUseSessionId>(raw.sessionId),
      targetId: brand<ComputerUseTargetId>(raw.targetId),
      observationId: brand<ComputerUseObservationId>(raw.observationId),
      screenshot,
    }
  }

  private async ingestScreenshot(raw: RawNativeScreenshot | RawStoredScreenshot): Promise<NonNullable<ComputerUseObservation['screenshot']>> {
    if ('attachmentId' in raw) {
      // Used by protocol mocks and forward-compatible hosted helpers.
      return {
        ...raw,
        screenshotId: brand<ComputerUseScreenshotId>(raw.screenshotId),
      }
    }

    let path: string | undefined
    let canDelete = false
    try {
      path = await realpath(raw.filePath)
      const tempRoot = await realpath(tmpdir())
      const location = relative(tempRoot, path)
      if (location.startsWith('..') || isAbsolute(location) || !basename(path).startsWith('dsh-computer-use-')) {
        throw new ComputerUseError('native helper returned an invalid screenshot location', 'PROTOCOL_MISMATCH')
      }
      canDelete = true
      const bytes = await readFile(path)
      if (bytes.byteLength !== raw.bytes) {
        throw new ComputerUseError('native screenshot size does not match its manifest', 'PROVIDER_CRASHED')
      }
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (!/^[0-9a-f]{64}$/u.test(raw.sha256) || digest !== raw.sha256.toLowerCase()) {
        throw new ComputerUseError('native screenshot hash verification failed', 'PROVIDER_CRASHED')
      }
      if (this.attachments === undefined) {
        throw new ComputerUseError('windows provider requires ctx.attachments to ingest screenshots', 'PROVIDER_CONFIGURED_MISSING')
      }
      const ref = await this.attachments.saveImage({
        data: new Uint8Array(bytes),
        mediaType: raw.mediaType,
        name: `computer-use-${raw.screenshotId}.png`,
      })
      // saveImage NORMALIZES the raster (it may downscale/transcode to satisfy the
      // attachment admission budget), so the returned ref is the authoritative
      // stored dimensions/bytes. Comparing it against the raw native manifest
      // (ref.width/height/bytes !== raw.width/height/bytes) fails as soon as the
      // store re-encodes or resizes, which is expected, not a corruption.
      return {
        screenshotId: brand<ComputerUseScreenshotId>(raw.screenshotId),
        width: ref.width,
        height: ref.height,
        attachmentId: ref.attachmentId,
        mediaType: ref.mediaType,
        bytes: ref.bytes,
      }
    } catch (error) {
      if (error instanceof ComputerUseError) throw error
      throw new ComputerUseError('failed to ingest the native screenshot', 'PROVIDER_CRASHED')
    } finally {
      if (canDelete && path !== undefined) await unlink(path).catch(() => {})
    }
  }
}
