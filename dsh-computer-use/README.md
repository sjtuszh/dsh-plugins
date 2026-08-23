# dsh-computer-use

Model-agnostic Computer Use capability for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): an isolated browser, a Windows native helper, provider-neutral observation, a Chrome **Cookie Bridge** for importing your logged-in sessions, and a text planner (DeepSeek) plus a third-party vision model for perception.

## Platform & License

- **License**: [MIT](LICENSE) — open source, free to use, modify, and redistribute.
- **Platform**: the `windows` provider's native helper is **Windows-only**; the `playwright` browser provider and everything else are cross-platform.
- **macOS**: not currently developed — the author has no macOS environment. **Developers are welcome to contribute a macOS version.**

## Credits

**1st version** — created using **DeepSeek-V4-Pro-0813** with **DeepSeek Harness**.

Token usage: **223,443,625** tokens · **99% cache hit rate**.

## What it provides

- A capability seam `ctx.computerUse` (`start` / `listTargets` / `observe` / `act` / `stop`).
- Six model-facing tools: `computer_observe`, `computer_act`, `computer_stop`, `computer_take_over`, `computer_resume`, `computer_perceive`.
- Three providers behind one seam: `fake` (deterministic tests), `playwright` (isolated Chromium), `windows` (native helper).
- A perception layer: `accessibility` mode (no image) and `analyze` mode (screenshot → third-party vision model → structured result).
- Risk-classified, fail-closed approval + domain allowlist. No `computer/*` session audit events are written: the harness session reader does not recognize out-of-repo event types (and `session.append()` cannot mark them `ignorable`), and the model reads the browser state directly from the tool results.

## Required plugins (harness dependencies)

| Package | Why |
| --- | --- |
| `@deepseek-ai/dsh-llm-pi-ai` | Hosts the third-party **vision route** (declares `input:['text','image']`) |
| `@deepseek-ai/dsh-llm` | The `image` content block and `createUserMessage` |
| `@deepseek-ai/dsh-attachment` (+ `-local`) | Persists screenshots as content-addressed refs |
| `@deepseek-ai/dsh-credentials` (+ `-local`) | Resolves the vision API key per request |
| `@deepseek-ai/dsh-user-approval` | One-shot fail-closed action approval |
| `@deepseek-ai/dsh-tools` / `-session` / `-system-prompt` | Tool registry, session log, guidance |

`@deepseek-ai/dsh-llm-deepseek` is text-only and **cannot** be the vision model — it is the planner.

## Configuration

All options live on the `dsh-computer-use/plugin` row (`config:`), for example in your profile's `cordis.patch.yml`:

```yaml
- id: computer-use
  name: dsh-computer-use/plugin
  config:
    provider: playwright
    visionProvider: xiaomi
    visionModel: mimo-v2.5
```

> You can also flip the whole capability on/off **live from the DeepSeek Harness GUI** — the plugin registers a `computer-use` settings section (Settings → `computer-use`), so `enabled`, `provider`, and the browser/import options above are editable without editing YAML.

### Core

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master toggle — `false` turns the whole capability off |
| `provider` | `fake` | Backend: `fake` (tests) \| `playwright` (browser) \| `windows` (desktop) |
| `tools` | `true` | Register the model-facing tools |
| `confirmActions` | `true` | One-shot confirmation before risky `computer_act` calls |
| `visionProvider` / `visionModel` | — | llm-pi-ai route + model used by `computer_perceive analyze` |
| `visionMaxTokens` | `2000` | Vision output token cap |
| `allowedDomains` | `[]` | Hostnames the browser may act inside (empty = no restriction) |
| `windowsHelperCommand` | `''` | Native helper executable (defaults to the bundled `lib/native/win32-x64/dsh-computer-use-helper.exe`) |

### Browser (Playwright) session

| Option | Default | Meaning |
| --- | --- | --- |
| `browserHeadless` | `true` | Headless (default) or a visible window. `false` = 正常模式（弹窗） |
| `browserWindowState` | `normal` | Visible-window state: `normal` \| `maximized` \| `minimized`（先 launch、后应用状态） |
| `reuseBrowserProfile` | `false` | Use a persistent (dedicated) browser profile instead of an isolated context |
| `browserUserDataDir` | — | Persistent profile's "User Data" ROOT dir (non-default; e.g. `~/.dsh/browser-profiles/main`) |
| `browserProfileName` | `Default` | Profile directory name inside `browserUserDataDir` |
| `importCookies` | `false` | Import cookies so the isolated browser shares the user's logins |
| `importPasswords` | `false` | Import saved passwords for autofill |
| `importHistory` | `false` | Import browsing history as injected context |
| `cookiesFile` | — | Playwright storage-state JSON (`{ "cookies": [...] }`) loaded when `importCookies` |
| `passwordManagerCsv` | — | Password-manager CSV export (`name,url,username,password`) when `importPasswords` |

### Windows (desktop) provider

| Option | Default | Meaning |
| --- | --- | --- |
| `windowsWindowState` | `normal` | Target-window state: `normal` \| `maximized` \| `minimized`（minimized = 先激活后最小化） |

## Scripting: import cookies / passwords / history

The browser starts isolated (no cookies, no profile) by default. To give it your logged-in state:

**A. Cookie Bridge (recommended — works with Chrome 127+ App-Bound Encryption)**

Chrome 127+ encrypts cookies with App-Bound Encryption, so a separate process cannot read your existing profile's cookies. The Cookie Bridge sidesteps this by running **inside Chrome**: a small extension reads cookies via `chrome.cookies` (plaintext — Chrome decrypts them itself) and POSTs them to a local receiver.

```sh
# 1. Install the companion extension ONCE (see github.com/xiaoheizi1212/dsh-cookie-bridge):
#    chrome://extensions → Developer mode → "Load unpacked" → the extension folder.
# 2. Start the receiver:
pnpm exec tsx scripts/import-cookies-server.ts
# 3. Either click the extension icon and pick a domain, or drive it from the agent:
pnpm exec tsx scripts/request-cookies.ts all x.com,xiaohongshu.com
```

Then point the plugin at the saved `cookies.json`:

```yaml
- id: computer-use
  config:
    provider: playwright
    importCookies: true
    cookiesFile: "C:/path/to/dsh-computer-use/cookies.json"
```

> Cookie values only travel from Chrome to `127.0.0.1` (never to a remote host), and only the cookies for the domains you pick are exported. Multiple exports merge (deduped by domain|path|name).

**B. Dedicated browser profile (log in once manually)**

Use a plugin-owned, **non-default** profile. Chrome refuses remote debugging on its real `User Data` dir, and copying a profile does not carry App-Bound cookies, so the supported path is a fresh dedicated profile where you log in once:

```yaml
- id: computer-use
  config:
    provider: playwright
    reuseBrowserProfile: true
    browserUserDataDir: "C:/Users/you/.dsh/browser-profiles/main"
    browserProfileName: "Default"
    browserHeadless: false   # visible window so you can log in
```

> ⚠️ Reusing your *existing* Chrome profile is NOT supported: Chrome 127+ App-Bound Encryption + the "no remote debugging on the default data dir" restriction are designed to block it.

**Passwords / history (reserved)**

- **Passwords** — `importPasswords: true` expects a `passwordManagerCsv` export (`name,url,username,password`); reserved switch, wire your own autofill bridge first.
- **History** — `importHistory: true` is a reserved switch; inject the top visited origins as model context in your own adapter.

> Every import weakens isolation. Import only what the task needs, and never enable import while the `allowedDomains` list is empty.

## Vision model

Recommended default: **`qwen2.5-vl-72b-instruct`** over an OpenAI-compatible gateway (self-hosted vLLM, DashScope, OpenRouter). Alternatives: `gpt-4o-mini`, `glm-4v-flash`, `llava-v1.6-34b`, `internvl2-76b`, `mimo-v2.5`.

Configure the vision route in your profile's `settings.yaml` (or the base `llm-pi-ai` section):

```yaml
llm-pi-ai:
  providers:
    vision:
      apiKeyEnv: VISION_API_KEY
      api: openai-completions
      baseURL: https://your-vision-endpoint/v1
      defaultInput: [text, image]
      models:
        - id: qwen2.5-vl-72b-instruct
          contextWindow: 131072
          input: [text, image]
```

> pi-ai does **not** verify modality declarations: a model declared image-capable but that is not will fail mid-turn after the message is durable. Verify the chosen model actually accepts images before committing it.

## Install & load

```sh
dsh plugin --profile web add dsh-computer-use
npx playwright install chromium   # once, for the playwright provider
```

The bundle's `cordis.patch.yml` mounts `ctx.computerUse` (package root) and the tool/provider plugin (`dsh-computer-use/plugin`, provider `fake`). Override `provider` in your profile patch to select `playwright` or `windows`.

## Providers

- **`fake`** — deterministic in-memory provider for contract tests and keyless demos.
- **`playwright`** — isolated Chromium: observe (screenshot → `ctx.attachments` + accessibility tree with short-lived element ids) and act (`click-element` / `click-coordinate` / `type-text` / `press-key` / `scroll` / `drag` / `set-value` / `activate-target`). Headless by default; headed + window-state via `browserHeadless` / `browserWindowState`.
- **`windows`** — a thin adapter over the native-helper protocol (`src/native/*`); the self-contained helper (`dsh-computer-use-helper.exe`, UI Automation + Windows.Graphics.Capture + SendInput) is built by `pnpm build`. Target window state via `windowsWindowState`.

## Policy

- Actions are risk-classified deterministically by type, never by page content: `scroll` / `activate-target` → `read` (no confirmation); `type-text` / `set-value` / `drag` → `local`; `click-*` / `press-key` → `external` (one-shot confirmation). `destructive` / `financial` / `auth` are domain/policy determinations deferred to the Harness permission extension.
- `allowedDomains` restricts the Playwright provider to acting only inside the listed hostnames; an out-of-allowlist target fails with `TARGET_NOT_ALLOWED`.
- **Prompt-injection boundary**: the classifier and the allowlist never read page text, accessibility names, or screenshot content, so untrusted page content cannot grant permission.

## Development

```sh
pnpm install
pnpm build      # tsdown bundles src into lib/ + dotnet publish the native helper into lib/native/win32-x64
pnpm test       # keyless contract tests (fake/framing/transport/windows/perception) + Playwright (needs Chromium)
pnpm typecheck
```

Source uses explicit `.ts` import specifiers (harness convention); tsdown rewrites them to `.js`.

## Documentation

- [Protocol](docs/protocol.md) — the versioned native-helper wire protocol (framing, handshake, methods, screenshot channel).
- [Security](docs/security.md) — threat model and safety invariants.
- [Provider authoring](docs/provider-authoring.md) — how to add a provider to the `ctx.computerUse` seam.

## License

MIT
