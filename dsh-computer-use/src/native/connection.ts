/**
 * PipeConnection: the production wire connection for the native helper. Spawns
 * the helper binary and drives it with framed bytes over stdin/stdout.
 *
 * Host-side only (uses `node:child_process`). This is the one piece NOT covered
 * by keyless tests — it needs a real native binary — so it stays thin: spawn,
 * pump stdout chunks to the transport, forward `send` to stdin, close on exit.
 * @module dsh-computer-use/native/connection
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Connection } from './transport.ts'

/**
 * A helper process connected over piped stdio. stdout bytes are delivered raw
 * (the transport owns framing/decoding); `send` writes framed bytes to stdin.
 */
export class PipeConnection implements Connection {
  private child: ChildProcessWithoutNullStreams | undefined
  private frameHandler: ((data: Uint8Array) => void) | undefined
  private closeHandler: (() => void) | undefined
  private started = false

  constructor(
    private readonly command: string,
    private readonly args: readonly string[] = [],
  ) {}

  /** Spawn the helper process (idempotent). */
  start(): void {
    if (this.started) return
    this.started = true
    this.child = spawn(this.command, [...this.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child.stdout.on('data', (chunk: Buffer) => this.frameHandler?.(new Uint8Array(chunk)))
    this.child.stderr.on('data', () => { /* helper diagnostics; not model-visible */ })
    this.child.on('exit', () => this.closeHandler?.())
    this.child.on('error', () => this.closeHandler?.())
  }

  send(data: Uint8Array): void {
    this.child?.stdin.write(Buffer.from(data))
  }

  onFrame(handler: (data: Uint8Array) => void): void {
    this.frameHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  async close(): Promise<void> {
    if (this.child !== undefined) {
      this.child.stdin.end()
      this.child.kill()
      this.child = undefined
    }
    this.closeHandler?.()
  }
}
