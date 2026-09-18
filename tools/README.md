# tools/ — 插件维护工具

DSH 每次大版本升级都会让第三方插件成批损坏（模块改名、服务消失、客户端 bundle 图变化）。这里固化了那次复盘后的**标准维护动作**，四个脚本只用 Node 内置模块，不需要装依赖。

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

## 为什么冒烟测试里要有 inject 守卫

`dsh-file-actions` 曾因客户端 `inject` 漏了 `'remote'`（而 `apply()` 里读了 `ctx.remote`）导致 **`dsh web` 直接起不来**，报 `cannot get property "remote" without inject`。

根因不只是那行代码，还有**测试假阳性**：当时的桩 ctx 是普通对象，随便读什么属性都返回，所以漏声明测不出来。现在桩 ctx 用 `Proxy` 复刻 Cordis 的 inject 门禁（读未声明服务即抛同样的错），并附一条**回归证明**——故意把 `'remote'` 从声明里删掉，测试必须失败才算通过。

```powershell
node tools/smoke-file-actions.mjs `
  dsh-file-actions\lib\client.js `
  dsh-computer-use\node_modules
```

改任何客户端 bundle 之前先跑它，能在重启之前拦住这一类崩溃。相关框架坑见 `../MEMORY.md` §4.2。
