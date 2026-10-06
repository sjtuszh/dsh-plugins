# tools/ — 插件维护与本地接入工具

DSH 每次大版本升级都会让第三方插件成批损坏（模块改名、服务消失、客户端 bundle 图变化）。这里固化了那次复盘后的**标准维护动作**，所有脚本只用 Node 内置模块，不需要装依赖。

## 升级后的标准三步

1. **体检** —— 扫已装插件，看 `dsh.client.inject` 里有没有已消失的模块 id、`bundle.patch` 是否还在、`lib` 里是否残留已移除的 API 名：

   ```powershell
   node tools/inventory-installed.mjs "$env:USERPROFILE\.dsh\profiles\web\node_modules"
   ```

2. **修** —— 只改 `"inject": [...]` 数组内部（删掉不存在的模块 id、以及误填进模块位的服务名如 `slots`），保留缩进；改完用 `JSON.parse` 校验，不合法就**不落盘**：

   ```powershell
   node tools/fix-client-inject.mjs <每个待修的 package.json>
   ```

3. **重启验证** —— 客户端模块图与 bundle 都是 `dsh web` **启动时缓存**的，改完不重启不生效；重启后刷新页面。

## 脚本一览

| 脚本 | 用途 |
|---|---|
| `inventory-installed.mjs <node_modules>` | 已装插件体检表：版本、`client.inject`、遗留 `dshClient` 块、`bundle.patch` 存在性、lib 里 require 了什么、是否残留已消失 API |
| `inventory-repo.mjs <repoRoot> <profileRoot>` | 仓库盘点表：目录 / npm 包名 / 版本 / profile 依赖 / 是否进 bundle 层 / 是否已安装 / git 跟踪文件数 |
| `fix-client-inject.mjs <package.json...>` | 批量修 `inject` 数组（带 JSON 校验，失败即跳过该文件） |
| `smoke-file-actions.mjs <bundle.js> <含 react 的 node_modules>` | `dsh-file-actions` 的离线冒烟测试：真 React 服务端渲染 + 桩 ctx，34 项断言 |
| `web-cookie.mjs [--authority …] [--days 30]` | 用持久化密钥为本机 dsh web 铸一个有效的会话 cookie（可被 import） |
| `dsh-embed-proxy.mjs` / `dsh-embed-proxy.cmd` | 回环注入代理：让 iframe 里的浏览器（VS Code 内置浏览器 / LAN 切换器）能打开 GUI |

## 为什么冒烟测试里要有 inject 守卫

`dsh-file-actions` 曾因客户端 `inject` 漏了 `'remote'`（而 `apply()` 里读了 `ctx.remote`）导致 **`dsh web` 直接起不来**，报 `cannot get property "remote" without inject`。

根因不只是那行代码，还有**测试假阳性**：当时的桩 ctx 是普通对象，随便读什么属性都返回，所以漏声明测不出来。现在桩 ctx 用 `Proxy` 复刻 Cordis 的 inject 门禁（读未声明服务即抛同样的错），并附一条**回归证明**——故意把 `'remote'` 从声明里删掉，测试必须失败才算通过。

```powershell
# 需要任意一个含 react + react-dom 的 node_modules；没有就临时装一个：
npm i --prefix "$env:TEMP\dsh-smoke" react react-dom
node tools/smoke-file-actions.mjs `
  dsh-file-actions\lib\client.js `
  "$env:TEMP\dsh-smoke\node_modules"
```

改任何客户端 bundle 之前先跑它，能在重启之前拦住这一类崩溃。相关框架坑见 `../MEMORY.md` §4.2。

## 认证：为什么 iframe 里打不开 GUI，以及怎么绕过

DSH 0.1.5 起 Web GUI 要浏览器会话认证（`@deepseek-ai/dsh-client-connection`）：

- 每次 `dsh web` 启动生成一个随机 **launch token**（只在内存里），打印成 `http://127.0.0.1:3080/?token=…`
- 用该 URL 访问**根路径**会种下 cookie 并 303 跳到干净的 `/`；cookie 用**持久化在 `.credentials.yaml` 的密钥**签名，默认 30 天，**重启进程后仍有效**
- cookie 是 `host-only / Path=/ / HttpOnly / SameSite=Strict`，并且**绑定 authority**（给 `127.0.0.1:3080` 铸的对 `localhost:3080` 无效）
- `/api` 的信任围栏还会**直接拒绝 `Sec-Fetch-Site: cross-site`**，并要求 `Origin` 的 host 等于 `Host`

**因此 VS Code 内置浏览器（页面嵌在 iframe 里 = 第三方上下文）拿不到也发不出这个 cookie**：token 交换能成功，重定向后的请求照样 401。实测对照：

| 请求 | 结果 |
|---|---|
| 直连 `:3080/api` + cookie（同源） | 404（认证与围栏都过，只是裸 GET 不存在） |
| 直连 `:3080/api` + cookie + `Sec-Fetch-Site: cross-site` | **403**（围栏拦跨站） |
| 经代理 `:3081/`（浏览器**不带** cookie） | **200**（代理注入凭据） |
| 经代理 `:3081/api` + 跨站头 + 代理 Origin | 404（代理规范化头后放行） |

### 用法

```powershell
# 1) 启动回环注入代理（或直接双击 dsh-embed-proxy.cmd）
node tools/dsh-embed-proxy.cmd            # 等价于 node dsh-embed-proxy.mjs

# 2) 在 VS Code 内置浏览器里打开（不要带 ?token=…）
#    http://127.0.0.1:3081
```

想随开机自启：给 `dsh-embed-proxy.cmd` 建快捷方式丢进 `shell:startup`。

系统默认浏览器仍然正常：`dsh web` 会把带 token 的 URL 交给它。若你把控制台藏了（例如用 `dsh-tray` 之类的启动器），登录 URL 也在它的日志里，可用 `../dsh-tray/dsh-login-url.ps1` 取回并复制到剪贴板。

### 安全边界（重要）

- 代理**绕过认证**：任何能访问 `127.0.0.1:3081` 的本机进程都等于已登录。因此它**只监听回环地址**，代码里写死 `127.0.0.1`，不要改成 `0.0.0.0`。
- 之所以不把注入逻辑放进 `dsh-lan` 的网关：那个网关绑 `0.0.0.0:4080`，在里面注入 cookie 等于**把免认证入口开到整个局域网**。LAN 场景应当反过来——让网关透传/校验收到的凭据，而不是替客户端出示。
- 想少折腾一次也可以把 cookie 寿命调长：认证行 `id: connection` 支持 `cookieMaxAgeDays`（默认 30）。这是主动降低安全姿态。
