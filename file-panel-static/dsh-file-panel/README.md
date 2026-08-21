# dsh-file-panel

DeepSeek Harness Web GUI 的**文件树浏览面板**（单包，自挂载 Typert remote）。

- 页面**右侧中间**浮动 📁 小按钮 → 点击滑出右侧文件栏（`shell.overlay` 根级浮动层）；打开时按钮贴面板左缘
- 文件栏以**当前会话 cwd** 为根，目录懒加载、可展开/折叠；每次点击按钮刷新 + 打开时每 30s 自动刷新
- 行内 **⋯** 菜单：**复制文件地址** / **打开文件浏览器查看**（文件→打开其父目录，文件夹→打开自身）
- 数据通道：Typert remote（`ctx.get("remote.filetree").*`），Host 服务经 `TypertRemoteService` 注册并绑定

## 安装

```powershell
dsh plugin --profile web add dsh-file-panel
```

> 若 pnpm 提示 minimumReleaseAge，用 `add dsh-file-panel@<version>` 钉版本。

## 目录

```
lib/host.js             # FileTreeService extends TypertRemoteService（注册 + typertRemote 绑定）
lib/typert.host.js      # TYPERT 清单（zod v4 真 schema）
lib/typert.remote-client.js  # TYPERT_REMOTE 描述符（恒等桩，client.js 内联同款，供参考）
lib/client.js           # UI bundle：apply 内自 ctx.remote.$mount + whenRemoteReady 门控
cordis.patch.yml        # 组合插入行（dsh plugin add 自动应用）
```

## 回滚

```powershell
dsh plugin --profile web remove dsh-file-panel
```

## License

MIT
