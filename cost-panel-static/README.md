# 计费面板 · 静态版（profile 挂载）

与 `cost-panel/`（动态版）功能等价，但以**静态插件**挂载：随 `dsh web` 启动自动加载，
进程重启、浏览器刷新都不需要任何操作，无需批准。

## 架构差异（相对动态版）

| 维度 | 动态版 `cost-panel/` | 静态版 `cost-panel-static/` |
|---|---|---|
| 数据通道 | Host `harness.handle` RPC + 客户端 1.5s 轮询 | **`sessionProjections` 投影**：Host 折叠事件，客户端 `useProjection('costSnapshot')` 订阅推送（无 RPC、无轮询） |
| 持久化 | 自管账本 `~/.dsh/dsh-cost-ledger.json` | 投影检查点（`$DSH_HOME/storages/session_projcache.json`），重启后从会话日志整体重放 |
| 分叉归零 | 按 `seedLength` 归零 + 分叉徽章 | 投影 apply 看不到 header，**按全量计费、不显示分叉徽章**（已知差异） |
| 安装 | cordis_define + 批准 | 复制包 + patch 行 + 重启 |

## 安装 / 更新

1. 把本目录（含 `package.json`、`lib/`）复制到 `$DSH_HOME/profiles/web/node_modules/dsh-cost-panel/`
   （`$DSH_HOME` 默认 `~/.dsh`）。
2. `profiles/web/cordis.patch.yml` 确保有：

   ```yaml
   - insert:
       - id: cost-panel
         name: dsh-cost-panel
   ```

3. 重启 `dsh web`。`client.js` 改动刷新浏览器即可（rev 按文件哈希）；`host.js`/patch 改动必须重启。

## 回滚（回到动态版）

1. 删除 `profiles/web/cordis.patch.yml` 中的 `cost-panel` insert 块（或恢复 `cordis.patch.yml.bak-dynamic`）。
2. 删除 `profiles/web/node_modules/dsh-cost-panel/`。
3. 重启 `dsh web`，再用 `cost-panel/` 的源码走动态版（cordis_define + run）流程。

## 预检（不必重启即可跑）

```powershell
node --check lib/host.js ; node --check lib/client.js
dsh --profile web --dump-config   # 确认组合树含 cost-panel 行
```
