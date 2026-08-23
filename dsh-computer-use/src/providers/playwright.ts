/**
 * Playwright provider: an isolated Chromium context that observes a page and
 * acts on it (Phase 2). Screenshots go to `ctx.attachments`; accessibility
 * exposes short-lived element ids mapped to provider-internal locators.
 *
 * Isolation follows the plan's MVP rules: a fresh context, no user cookies or
 * extensions, no system profile. Domain allowlist and download policy arrive
 * with Phase 4 policy.
 * @module dsh-computer-use/providers/playwright
 */

import { chromium } from 'playwright'
import type { Browser, BrowserContext, Locator, Page } from 'playwright'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { readFile } from 'node:fs/promises'
import type {
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
  StartRequest,
  StopRequest,
} from '../types.ts'
import { brand } from '../ids.ts'
import type {
  ComputerUseElementId,
  ComputerUseObservationId,
  ComputerUseScreenshotId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from '../ids.ts'
import { ComputerUseError } from '../errors.ts'

/** Observation short-lifetime (ms): actions after this window fail closed. */
const OBSERVATION_TTL_MS = 30_000

/** Interactive elements enumerated into the accessibility observation. */
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(', ')

/** Upper bound on enumerated elements per observation (context budget). */
const MAX_ELEMENTS = 200

/** Browser-session options for the Playwright provider. */
export interface PlaywrightProviderOptions {
  /** Hostnames the provider may act inside; empty = no restriction. */
  allowedDomains?: readonly string[]
  /** Run headless (default) or as a visible window. */
  headless?: boolean
  /** Visible-browser window state (`normal` | `maximized` | `minimized`). */
  windowState?: 'normal' | 'maximized' | 'minimized'
  /** Import cookies so the isolated browser shares the user's logins. */
  importCookies?: boolean
  /** Playwright storage-state JSON (`{ cookies: [...] }`) to load when importCookies. */
  cookiesFile?: string
  /** Reserved: import saved passwords (needs a password-manager CSV). */
  importPasswords?: boolean
  /** Reserved: import browsing history as injected context. */
  importHistory?: boolean
  /** Chrome/Edge "User Data" root dir (contains `Default`, `Profile 1`, …). */
  userDataDir?: string
  /** Profile directory name inside `userDataDir`; defaults to `Default`. */
  profileName?: string
  /** Browser channel to launch when reusing a profile; defaults to auto-detected from `userDataDir`. */
  channel?: 'chrome' | 'msedge' | 'chromium'
  /** Password-manager CSV export (`name,url,username,password`) when importPasswords. */
  passwordManagerCsv?: string
}

/**
 * Pick the Playwright browser channel whose binary matches a user-data dir.
 * Reusing a Chrome profile must launch the SYSTEM Chrome (`channel: 'chrome'`),
 * not Playwright's bundled Chromium: Chrome 127+ encrypts cookies with
 * App-Bound Encryption, so only the real Chrome binary can decrypt them. The
 * bundled Chromium opens the same profile with no usable cookies → not logged in.
 */
function profileChannel(userDataDir: string): 'chrome' | 'msedge' {
  return /[\\/]Edge[\\/]/i.test(userDataDir) ? 'msedge' : 'chrome'
}

interface PlaywrightSessionState {
  page: Page
  target: ComputerUseTarget
  observation: ComputerUseObservation | null
  /** Short-lived elementId → locator, rebuilt on every observation. */
  elementLocators: Map<string, Locator>
  include: { screenshot: boolean; accessibility: boolean }
}

/**
 * The isolated-browser provider. One shared Chromium instance holds one context
 * per session; each session owns a single page (one observable target). State
 * never leaks provider-internal page/locator handles into model-visible results.
 */
export class PlaywrightComputerUseProvider implements ComputerUseProvider {
  readonly id = 'playwright'

  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private disposed = false
  private seq = 0
  private readonly sessions = new Map<string, PlaywrightSessionState>()

  private readonly allowedDomains: readonly string[] | undefined
  private readonly headless: boolean
  private readonly windowState: 'normal' | 'maximized' | 'minimized'
  private readonly importCookies: boolean
  private readonly cookiesFile: string | undefined
  private readonly importPasswords: boolean
  private readonly importHistory: boolean
  private readonly userDataDir: string | undefined
  private readonly profileName: string
  private readonly channel: 'chrome' | 'msedge' | 'chromium' | undefined
  private readonly passwordManagerCsv: string | undefined

  constructor(private readonly attachments: AttachmentStore, options?: PlaywrightProviderOptions) {
    this.allowedDomains = options?.allowedDomains
    this.headless = options?.headless ?? true
    this.windowState = options?.windowState ?? 'normal'
    this.importCookies = options?.importCookies ?? false
    this.cookiesFile = options?.cookiesFile
    this.importPasswords = options?.importPasswords ?? false
    this.importHistory = options?.importHistory ?? false
    this.userDataDir = options?.userDataDir
    this.profileName = options?.profileName ?? 'Default'
    this.channel = options?.channel
    this.passwordManagerCsv = options?.passwordManagerCsv
  }

  available(): boolean {
    return !this.disposed
  }

  /** Close the browser and every session; call on plugin unload. */
  async dispose(): Promise<void> {
    this.disposed = true
    for (const state of this.sessions.values()) {
      await state.page.close().catch(() => {})
    }
    this.sessions.clear()
    await this.context?.close().catch(() => {})
    if (this.userDataDir === undefined) {
      // A persistent context closes its own browser on `context.close()`.
      await this.browser?.close().catch(() => {})
    }
    this.context = null
    this.browser = null
  }

  async start(request: StartRequest, signal?: AbortSignal): Promise<ComputerUseSession> {
    signal?.throwIfAborted()
    await this.ensureBrowser()
    const sessionId = request.sessionId ?? brand<ComputerUseSessionId>(`pw-session-${++this.seq}`)
    const page = await this.context!.newPage()
    if (this.headless === false && this.windowState !== 'normal') {
      await this.applyWindowState(page, this.windowState)
    }
    if (request.startUrl !== undefined) {
      await page.goto(request.startUrl, { waitUntil: 'domcontentloaded' })
    }
    const target: ComputerUseTarget = {
      targetId: brand<ComputerUseTargetId>(`pw-page-${++this.seq}`),
      kind: 'browser-page',
      title: await page.title(),
      url: page.url(),
    }
    this.sessions.set(sessionId, {
      page,
      target,
      observation: null,
      elementLocators: new Map(),
      include: { screenshot: true, accessibility: false },
    })
    return { sessionId, providerId: this.id, targets: [target] }
  }

  async listTargets(sessionId: ComputerUseSessionId): Promise<readonly ComputerUseTarget[]> {
    const state = this.sessions.get(sessionId)
    if (!state) throw new ComputerUseError('unknown playwright session', 'SESSION_NOT_FOUND')
    state.target = await this.refreshTarget(state.page, state.target.targetId)
    return [state.target]
  }

  async observe(request: ObserveRequest, signal?: AbortSignal): Promise<ComputerUseObservation> {
    const state = this.sessions.get(request.sessionId)
    if (!state) throw new ComputerUseError('unknown playwright session', 'SESSION_NOT_FOUND')
    if (state.target.targetId !== request.targetId) {
      throw new ComputerUseError('target does not belong to this session', 'TARGET_NOT_FOUND')
    }
    const observation = await this.capture(request.sessionId, state, request.include, signal)
    state.observation = observation
    state.include = request.include
    state.target = await this.refreshTarget(state.page, state.target.targetId)
    return observation
  }

  async act(request: ActRequest, signal?: AbortSignal): Promise<ComputerUseObservation> {
    const state = this.sessions.get(request.sessionId)
    if (!state) throw new ComputerUseError('unknown playwright session', 'SESSION_NOT_FOUND')
    if (state.observation === null || state.observation.observationId !== request.observationId) {
      throw new ComputerUseError('observation is stale; re-observe before acting', 'STALE_OBSERVATION')
    }
    if (state.observation.expiresAt !== undefined && Date.now() > new Date(state.observation.expiresAt).getTime()) {
      throw new ComputerUseError('observation expired; re-observe before acting', 'STALE_OBSERVATION')
    }
    this.assertDomainAllowed(state.page)
    await this.dispatch(state, request.action, signal)
    // One action, then an immediate fresh observation — ids die with the old one.
    const observation = await this.capture(request.sessionId, state, state.include, signal)
    state.observation = observation
    state.target = await this.refreshTarget(state.page, state.target.targetId)
    return observation
  }

  async stop(request: StopRequest): Promise<void> {
    const state = this.sessions.get(request.sessionId)
    if (!state) return
    this.sessions.delete(request.sessionId)
    await state.page.close().catch(() => {})
  }

  private async ensureBrowser(): Promise<void> {
    if (this.context !== null) return
    if (this.userDataDir !== undefined) {
      // Reuse a real Chrome/Edge profile (already logged in). The browser must
      // be closed, or the profile is locked. Launch the matching system browser
      // channel (not Playwright's bundled Chromium) so Chrome's App-Bound
      // Encryption cookie store decrypts and the profile is actually logged in.
      // `launchPersistentContext` takes the User Data ROOT; the specific profile
      // is selected with `--profile-directory` (the default profile needs none).
      const args = this.profileName !== 'Default' ? [`--profile-directory=${this.profileName}`] : []
      this.context = await chromium.launchPersistentContext(this.userDataDir, {
        channel: this.channel ?? profileChannel(this.userDataDir),
        headless: this.headless,
        args,
        serviceWorkers: 'block',
      })
      this.browser = this.context.browser() ?? null
    } else {
      // Isolated: no persistent user-data dir, no extensions, no system profile
      // (unless cookies/passwords/history import is explicitly configured).
      // Prefer the SYSTEM browser channel (latest Chrome/Edge 15x); fall back to
      // Playwright's bundled Chromium only when that channel's binary is absent.
      const channel = this.channel ?? 'chrome'
      try {
        this.browser = await chromium.launch({ channel, headless: this.headless })
      } catch (error) {
        if (channel === 'chromium') throw error
        this.browser = await chromium.launch({ headless: this.headless })
      }
      this.context = await this.browser.newContext({ serviceWorkers: 'block' })
      await this.importBrowserData()
    }
  }

  /** Import user-selected browser data into the fresh context. */
  private async importBrowserData(): Promise<void> {
    if (this.importCookies && this.cookiesFile !== undefined) {
      const storage = JSON.parse(await readFile(this.cookiesFile, 'utf8')) as { cookies?: unknown[] }
      if (Array.isArray(storage.cookies)) {
        await this.context!.addCookies(storage.cookies as Parameters<BrowserContext['addCookies']>[0])
      }
    }
    // importPasswords / importHistory are reserved config switches: they need a
    // password-manager CSV reader and a browser History DB reader respectively.
    // See README "Browser profile import" for the supported paths.
    void this.importPasswords
    void this.importHistory
    void this.userDataDir
    void this.passwordManagerCsv
  }

  /** Apply a visible-window state (headed mode only). Launch first, then size. */
  private async applyWindowState(page: Page, state: 'maximized' | 'minimized'): Promise<void> {
    try {
      const cdp = await this.context!.newCDPSession(page)
      const { windowId } = await cdp.send('Browser.getWindowForTarget') as { windowId: number }
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } })
    } catch {
      // Window state is best-effort in headed mode; never fail a session over it.
    }
  }

  private async refreshTarget(page: Page, targetId: ComputerUseTargetId): Promise<ComputerUseTarget> {
    return {
      targetId,
      kind: 'browser-page' as const,
      title: await page.title(),
      url: page.url(),
    }
  }

  private async capture(
    sessionId: ComputerUseSessionId,
    state: PlaywrightSessionState,
    include: { screenshot: boolean; accessibility: boolean },
    signal?: AbortSignal,
  ): Promise<ComputerUseObservation> {
    signal?.throwIfAborted()
    const sequence = ++this.seq
    const observationId = brand<ComputerUseObservationId>(`pw-obs-${sequence}`)

    let screenshot: ComputerUseScreenshot | undefined
    if (include.screenshot) {
      screenshot = await this.captureScreenshot(state.page, observationId)
    }

    let accessibility: ComputerUseAccessibility | undefined
    const elementLocators = new Map<string, Locator>()
    if (include.accessibility) {
      accessibility = await this.captureAccessibility(state.page, elementLocators)
    }
    state.elementLocators = elementLocators

    const viewport = state.page.viewportSize()
    return {
      sessionId,
      targetId: state.target.targetId,
      observationId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + OBSERVATION_TTL_MS).toISOString(),
      sequence,
      title: await state.page.title(),
      url: state.page.url(),
      viewport: viewport ? { width: viewport.width, height: viewport.height, dpr: 1 } : undefined,
      screenshot,
      accessibility,
    }
  }

  private async captureScreenshot(page: Page, observationId: string): Promise<ComputerUseScreenshot> {
    const buffer = await page.screenshot({ type: 'png' })
    const ref = await this.attachments.saveImage({
      data: new Uint8Array(buffer),
      mediaType: 'image/png',
      name: `computer-use-${observationId}.png`,
    })
    return {
      screenshotId: brand<ComputerUseScreenshotId>(`pw-shot-${++this.seq}`),
      width: ref.width,
      height: ref.height,
      attachmentId: ref.attachmentId,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
    }
  }

  private async captureAccessibility(page: Page, elementLocators: Map<string, Locator>): Promise<ComputerUseAccessibility> {
    let tree = ''
    try {
      tree = (await page.locator('body').ariaSnapshot()) ?? ''
    } catch {
      tree = (await page.locator('body').innerText().catch(() => '')) ?? ''
    }
    const documentText = (await page.locator('body').innerText().catch(() => '')) ?? ''
    const elements: ComputerUseElement[] = []
    const locators = await page.locator(INTERACTIVE_SELECTOR).all()
    for (const loc of locators.slice(0, MAX_ELEMENTS)) {
      const box = await loc.boundingBox().catch(() => null)
      if (box === null) continue
      const inner = (await loc.innerText().catch(() => '')).trim()
      const label = (await loc.getAttribute('aria-label').catch(() => null)) ?? undefined
      const name = inner.length > 0 ? inner : label
      const elementId = brand<ComputerUseElementId>(`pw-el-${++this.seq}`)
      elements.push({
        elementId,
        role: 'element',
        name,
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      })
      elementLocators.set(elementId, loc)
    }
    return { tree, documentText, elements }
  }

  private async dispatch(state: PlaywrightSessionState, action: ComputerUseAction, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const page = state.page
    switch (action.type) {
      case 'click-element': {
        const loc = state.elementLocators.get(action.elementId)
        if (loc === undefined) throw new ComputerUseError('element id is not in the current observation', 'ELEMENT_NOT_FOUND')
        await loc.click()
        return
      }
      case 'click-coordinate': {
        this.assertScreenshot(state, action.screenshotId)
        this.assertInViewport(state, action.x, action.y)
        await page.mouse.click(action.x, action.y, { button: action.button })
        return
      }
      case 'type-text': {
        await page.keyboard.type(action.text)
        return
      }
      case 'press-key': {
        await page.keyboard.press(action.keys.join('+'))
        return
      }
      case 'scroll': {
        await page.mouse.wheel(action.deltaX, action.deltaY)
        return
      }
      case 'drag': {
        this.assertScreenshot(state, action.screenshotId)
        await page.mouse.move(action.from.x, action.from.y)
        await page.mouse.down()
        await page.mouse.move(action.to.x, action.to.y)
        await page.mouse.up()
        return
      }
      case 'set-value': {
        const loc = state.elementLocators.get(action.elementId)
        if (loc === undefined) throw new ComputerUseError('element id is not in the current observation', 'ELEMENT_NOT_FOUND')
        await loc.fill(action.value)
        return
      }
      case 'activate-target': {
        await page.bringToFront()
        return
      }
    }
  }

  private assertDomainAllowed(page: Page): void {
    const domains = this.allowedDomains
    if (domains === undefined || domains.length === 0) return
    let host: string | undefined
    try {
      host = new URL(page.url()).hostname || undefined
    } catch {
      host = undefined
    }
    if (host === undefined || !domains.includes(host)) {
      throw new ComputerUseError(`domain "${host ?? 'unknown'}" is not in the allowlist`, 'TARGET_NOT_ALLOWED')
    }
  }

  private assertScreenshot(state: PlaywrightSessionState, screenshotId: ComputerUseScreenshotId): void {
    if (state.observation?.screenshot?.screenshotId !== screenshotId) {
      throw new ComputerUseError('screenshot id is stale; re-observe before acting', 'STALE_OBSERVATION')
    }
  }

  private assertInViewport(state: PlaywrightSessionState, x: number, y: number): void {
    const viewport = state.observation?.viewport
    if (viewport !== undefined && (x < 0 || y < 0 || x > viewport.width || y > viewport.height)) {
      throw new ComputerUseError('coordinate is outside the observed viewport', 'COORDINATE_OUT_OF_BOUNDS')
    }
  }
}
