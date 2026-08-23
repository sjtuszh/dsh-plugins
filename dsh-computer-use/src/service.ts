/**
 * Service Definition for the Computer Use capability seam (`ctx.computerUse`).
 *
 * Holds the provider registry and executes against a selected provider with
 * the same explicit, order-independent selection rules as the web seam: a
 * configured id wins; otherwise exactly one usable provider auto-selects.
 * @module dsh-computer-use/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  ActRequest,
  ComputerUseObservation,
  ComputerUseProvider,
  ComputerUseSession,
  ComputerUseTarget,
  ObserveRequest,
  StartRequest,
  StopRequest,
} from './types.ts'
import { ComputerUseError } from './errors.ts'
import type { ComputerUseSessionId } from './ids.ts'

export {
  ComputerUseError,
} from './errors.ts'
export type {
  ActRequest,
  ComputerUseAccessibility,
  ComputerUseAction,
  ComputerUseElement,
  ComputerUseObservation,
  ComputerUseProvider,
  ComputerUseScreenshot,
  ComputerUseSession,
  ComputerUseTarget,
  ObserveRequest,
  PerceivedElement,
  PerceptionResult,
  Point,
  Rect,
  StartRequest,
  StopRequest,
} from './types.ts'
export type {
  ComputerUseElementId,
  ComputerUseObservationId,
  ComputerUseScreenshotId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from './ids.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    computerUse: ComputerUseRuntime
  }
}

/** Config for the seam: which provider wins. */
export interface ComputerUseRuntimeConfig {
  /** Explicit provider id (e.g. `fake`, `playwright`, `windows`). */
  provider?: string
}

/**
 * The Computer Use runtime. Registered as `ctx.computerUse` (one instance per
 * context). Providers call {@link registerProvider}; consumers (tools) call
 * {@link start} / {@link listTargets} / {@link observe} / {@link act} /
 * {@link stop}.
 */
export class ComputerUseRuntime extends Service {
  static Config: z<ComputerUseRuntimeConfig> = z.object({
    provider: z.string(),
  })

  private readonly providers = new Map<string, ComputerUseProvider>()
  private readonly providerId: string | undefined

  constructor(ctx: Context, config: ComputerUseRuntimeConfig = {}) {
    super(ctx, 'computerUse')
    this.providerId = config.provider ?? process.env.DSH_COMPUTER_USE_PROVIDER
  }

  /**
   * Register one provider. Throws {@link ComputerUseError} `DUPLICATE_PROVIDER`
   * on a duplicate id. Returns a disposer; disposed with the calling fiber.
   */
  registerProvider(provider: ComputerUseProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new ComputerUseError(`a computer-use provider with id "${provider.id}" is already registered`, 'DUPLICATE_PROVIDER')
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'computerUse.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; our disposer is synchronous.
    return () => void dispose()
  }

  start(request: StartRequest, signal?: AbortSignal): Promise<ComputerUseSession> {
    return this.resolve().start(request, signal)
  }

  listTargets(sessionId: ComputerUseSessionId, signal?: AbortSignal): Promise<readonly ComputerUseTarget[]> {
    return this.resolve().listTargets(sessionId, signal)
  }

  observe(request: ObserveRequest, signal?: AbortSignal): Promise<ComputerUseObservation> {
    return this.resolve().observe(request, signal)
  }

  act(request: ActRequest, signal?: AbortSignal): Promise<ComputerUseObservation> {
    return this.resolve().act(request, signal)
  }

  stop(request: StopRequest): Promise<void> {
    return this.resolve().stop(request)
  }

  private resolve(): ComputerUseProvider {
    if (this.providerId !== undefined) {
      const provider = this.providers.get(this.providerId)
      if (!provider) {
        throw new ComputerUseError(`configured computer-use provider "${this.providerId}" is not registered`, 'PROVIDER_CONFIGURED_MISSING')
      }
      if (!provider.available()) {
        throw new ComputerUseError(`configured computer-use provider "${this.providerId}" is registered but unavailable`, 'PROVIDER_CONFIGURED_UNAVAILABLE')
      }
      return provider
    }
    const usable = [...this.providers.values()].filter(provider => provider.available())
    const [single] = usable
    if (single === undefined) {
      throw new ComputerUseError('no usable computer-use provider is registered', 'PROVIDER_UNAVAILABLE')
    }
    if (usable.length > 1) {
      const ids = usable.map(provider => provider.id).join(', ')
      throw new ComputerUseError(`multiple usable computer-use providers are registered (${ids}); configure one explicitly`, 'PROVIDER_AMBIGUOUS')
    }
    return single
  }
}

export default ComputerUseRuntime
