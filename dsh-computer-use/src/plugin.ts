/**
 * Consumer side of the Computer Use seam: registers a provider, the
 * model-facing tools, the risk-based approval gate, and the perception tool.
 * The Service Definition (`ctx.computerUse`) is provided by the package root
 * (see service.ts); this plugin injects it.
 *
 * Configuration is exposed as a `computer-use` settings namespace, so the
 * DeepSeek Harness settings GUI renders the toggles (enabled, headless, window
 * state, cookie/profile import, …). The provider re-registers on change.
 * @module dsh-computer-use/plugin
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { fileURLToPath } from 'node:url'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-attachment' // bring ctx.attachments into scope
import type {} from './service.ts' // bring ctx.computerUse into scope
import { FakeComputerUseProvider } from './providers/fake.ts'
import { PlaywrightComputerUseProvider } from './providers/playwright.ts'
import { WindowsComputerUseProvider } from './providers/windows.ts'
import { PipeConnection } from './native/connection.ts'
import { applyObserveTool, applyActTool, applyStopTool, applyTakeOverTool, applyResumeTool } from './tools.ts'
import { applyApprovalGate } from './policy.ts'
import { applyPerceiveTool } from './perception.ts'
import { registerWorkflow } from './workflow/tool.ts'
import type { WorkflowConfig } from './workflow/engine.ts'

/** The Host builtin for Package-private Client RPC + model-visible dynamic tools. */
declare const harness: {
  handle(method: string, handler: (args: unknown) => unknown | Promise<unknown>): () => void
  defineTool(definition: unknown): unknown
  registerTool(ctx: Context, tool: unknown): () => void
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-computer-use-plugin'

/**
 * Hard dependencies: the seam service, the tool registry, and the durable
 * attachment store. `attachments` is injected (not read via `ctx.get`) because
 * Cordis applies composition entries concurrently: at the moment this plugin's
 * `apply()` runs, the attachment backend may be registered but its fiber not
 * yet active, so a strict `ctx.get('attachments')` would read `undefined`.
 * Declaring it as an inject dependency makes Cordis wait until the backend is
 * fully active — exactly how the harness's own image-consuming plugins depend
 * on it.
 */
export const inject = ['computerUse', 'tools', 'attachments']

/** A visible-browser / target-window state. */
export type WindowState = 'normal' | 'maximized' | 'minimized'

/** Browser binary channel for the Playwright provider. */
export type Channel = 'chrome' | 'msedge' | 'chromium'

/** Settings namespace surfaced in the DSH settings GUI. */
export const COMPUTER_USE_SETTINGS_NAMESPACE = settingsNamespace('computer-use')

/** Plugin config. */
export interface Config {
  /** Master toggle — disable to turn the whole capability off. Defaults to true. */
  enabled?: boolean
  /** Which provider to register; `fake` (default), `playwright`, or `windows`. */
  provider?: string
  /** Register the model-facing tools. Defaults to true. */
  tools?: boolean
  /** Ask confirmation before risky `computer_act` calls. Defaults to true. */
  confirmActions?: boolean
  /** Vision route provider id (the llm-pi-ai route) for `analyze` perception. */
  visionProvider?: string
  /** Vision route model id (e.g. `mimo-v2.5`). */
  visionModel?: string
  /** Vision output token cap. Defaults to 2000. */
  visionMaxTokens?: number
  /** Hostnames the browser provider may act inside; empty = no restriction. */
  allowedDomains?: string[]
  /** Native helper executable for the `windows` provider. */
  windowsHelperCommand?: string

  // ── Browser (Playwright) session ──────────────────────────────────────────
  /** Run headless (default true) or as a visible window. */
  browserHeadless?: boolean
  /** Visible-browser window state (`normal` | `maximized` | `minimized`). */
  browserWindowState?: string
  /** Reuse a real Chrome/Edge profile (already logged in) instead of an isolated context. */
  reuseBrowserProfile?: boolean
  /** Chrome/Edge "User Data" root dir (contains Default, Profile 1, …). */
  browserUserDataDir?: string
  /** Profile directory name inside browserUserDataDir; defaults to "Default". */
  browserProfileName?: string
  /** Import cookies from a storage-state JSON (isolated context only). */
  importCookies?: boolean
  /** Playwright storage-state JSON (`{ cookies: [...] }`) loaded when importCookies. */
  cookiesFile?: string
  /** Reserved: import saved passwords for autofill. */
  importPasswords?: boolean
  /** Reserved: import browsing history as injected context. */
  importHistory?: boolean
  /** Password-manager CSV export (`name,url,username,password`) when importPasswords. */
  passwordManagerCsv?: string
  /** Browser binary channel for the Playwright provider (`chrome` | `msedge` | `chromium`). */
  channel?: Channel | ''

  // ── Windows (desktop) provider ────────────────────────────────────────────
  /** Target-window state. `minimized` launches the app first, then minimizes. */
  windowsWindowState?: string

  // ── Paper Acquisition Workflow ───────────────────────────────────────────
  /** Download directory the workflow watches for PDFs. */
  workflowDownloadDir?: string
  /** Execution backend for read-heavy steps (`playwright` | `windows`). */
  workflowReadProvider?: string
  /** Execution backend for gated / strict-review steps. */
  workflowActionProvider?: string
  /** Directory where workflow screenshots are materialized before vision. */
  workflowScreenshotDir?: string
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default('fake'),
  tools: z.boolean().default(true),
  confirmActions: z.boolean().default(true),
  visionProvider: z.string().default(''),
  visionModel: z.string().default(''),
  visionMaxTokens: z.number().step(1).min(1).default(2000),
  allowedDomains: z.array(z.string()).default([]),
  windowsHelperCommand: z.string().default(''),

  browserHeadless: z.boolean().default(true),
  browserWindowState: z.string().default('normal'),
  reuseBrowserProfile: z.boolean().default(false),
  browserUserDataDir: z.string().default(''),
  browserProfileName: z.string().default('Default'),
  importCookies: z.boolean().default(false),
  cookiesFile: z.string().default(''),
  importPasswords: z.boolean().default(false),
  importHistory: z.boolean().default(false),
  passwordManagerCsv: z.string().default(''),
  channel: z.union([
    z.const(''),
    z.const('chrome'),
    z.const('msedge'),
    z.const('chromium'),
  ]).default(''),

  windowsWindowState: z.string().default('normal'),

  workflowDownloadDir: z.string().default(''),
  workflowReadProvider: z.string().default(''),
  workflowActionProvider: z.string().default(''),
  workflowScreenshotDir: z.string().default(''),
})

/**
 * Resolve the merged (entry + settings) config into non-optional fields.
 * Running the merged value back through the schema guarantees every default is
 * materialized even before the settings scope attaches (when `current` is still
 * the raw composition entry, whose optional fields may be absent).
 */
function resolved(config: Config, current: () => Config): Required<Config> {
  return Config({ ...config, ...current() }) as Required<Config>
}

/** Register the provider, tools, approval gate, and perception tool. */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  const providerDisposers: Array<() => void> = []

  const registerProvider = (): void => {
    while (providerDisposers.length > 0) providerDisposers.pop()!()
    const c = resolved(config, current)
    if (c.enabled === false) return

    if (c.provider === 'fake') {
      providerDisposers.push(ctx.computerUse.registerProvider(new FakeComputerUseProvider()))
      return
    }
    if (c.provider === 'playwright') {
      const provider = new PlaywrightComputerUseProvider(ctx.attachments, {
        allowedDomains: c.allowedDomains,
        headless: c.browserHeadless,
        windowState: c.browserWindowState as WindowState,
        userDataDir: c.reuseBrowserProfile && c.browserUserDataDir.length > 0 ? c.browserUserDataDir : undefined,
        profileName: c.browserProfileName,
        importCookies: c.importCookies,
        cookiesFile: c.cookiesFile.length > 0 ? c.cookiesFile : undefined,
        importPasswords: c.importPasswords,
        importHistory: c.importHistory,
        passwordManagerCsv: c.passwordManagerCsv.length > 0 ? c.passwordManagerCsv : undefined,
        channel: c.channel.length > 0 ? c.channel as Channel : undefined,
      })
      providerDisposers.push(ctx.computerUse.registerProvider(provider))
      providerDisposers.push(() => { void provider.dispose() })
      return
    }
    if (c.provider === 'windows') {
      const command = c.windowsHelperCommand.length > 0
        ? c.windowsHelperCommand
        : fileURLToPath(new URL('./native/win32-x64/dsh-computer-use-helper.exe', import.meta.url))
      const connection = new PipeConnection(command, ['--stdio'])
      const provider = new WindowsComputerUseProvider(connection, {
        attachments: ctx.attachments,
        windowState: c.windowsWindowState as WindowState,
      })
      connection.start()
      providerDisposers.push(ctx.computerUse.registerProvider(provider))
      providerDisposers.push(() => { void provider.dispose() })
      return
    }
    throw new Error(`dsh-computer-use: unknown provider "${c.provider}" (use "fake", "playwright", or "windows")`)
  }

  // Expose the config in the settings GUI; re-register the provider on change.
  installSettingsSection(ctx, COMPUTER_USE_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => { current = source },
    onChange: registerProvider,
  })
  registerProvider()

  const c = resolved(config, current)
  if (c.enabled !== false && c.tools) {
    applyObserveTool(ctx)
    applyActTool(ctx)
    applyStopTool(ctx)
    applyTakeOverTool(ctx)
    applyResumeTool(ctx)
    applyPerceiveTool(ctx, {
      provider: c.visionProvider,
      model: c.visionModel,
      maxTokens: c.visionMaxTokens,
    })
    applyApprovalGate(ctx, { confirmActions: c.confirmActions })

    const workflowConfig: WorkflowConfig = {
      vision: {
        provider: c.visionProvider,
        model: c.visionModel,
        maxTokens: c.visionMaxTokens,
        screenshotDir: c.workflowScreenshotDir.length > 0 ? c.workflowScreenshotDir : undefined,
      },
      downloadDir: c.workflowDownloadDir.length > 0 ? c.workflowDownloadDir : undefined,
      readProvider: (c.workflowReadProvider === 'windows' ? 'windows' : 'playwright') as 'playwright' | 'windows',
      actionProvider: (c.workflowActionProvider === 'playwright' ? 'playwright' : 'windows') as 'playwright' | 'windows',
    }
    // `harness` is the Host builtin for Package-private Client RPC + dynamic tools.
    registerWorkflow(ctx, harness, workflowConfig)
  }
}
