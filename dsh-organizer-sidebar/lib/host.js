// ============================================================================
// 会话侧边栏组织器 — Host 半边(静态版)
// ----------------------------------------------------------------------------
// 关键(踩坑实录, MEMORY §11.4):Typert 网关调用时校验服务对象身上的
// `typertRemote` 绑定(`validateBinding` 源码确认)——普通 `ctx.provide({...})`
// 会报 "Service organizer has no visible typertRemote binding"。
// 必须用 `TypertRemoteService`(Cordis Service 子类):构造即
// `ctx.reflect.provide(key, this)` 注册服务 + 打上 {service, serviceKey, namespace}
// 绑定,随 fiber 卸载自动注销。@Remote 装饰器仅 SRC 模式需要,strict 清单不需要。
//
// 职责:持久化用户分组 + 每账户会话顺序 + 已删除会话记录。
// 数据固定落在 DSH_HOME/session-organizer/ 下(不随进程 cwd 漂移——之前用
// sandboxPolicy.workspaceRoot = process.cwd(),dsh 从不同目录启动就"丢分组")。
// fs 惰性获取(§5.3:服务无条件提供,方法内再 ctx.get('fs')).
// ============================================================================

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILE_NAME = '.dsh-session-organizer.json';
const DELETED_FILE_NAME = '.dsh-session-organizer-deleted.json';
// DSH_HOME:环境变量优先,回退到 $HOME/.dsh(官方 dsh-credentials-local 同款)。
// 不硬编码用户路径,保证 npm 包在任意机器可移植。
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
// PowerShell 脚本目录 + 状态数据目录:纯 ASCII/BOM 控制见各方法注释。
const SCRIPT_DIR = DSH_HOME;
const DELETE_SCRIPT = join(SCRIPT_DIR, 'dsh-delete-session.ps1');
const RESTORE_SCRIPT = join(SCRIPT_DIR, 'dsh-restore-session.ps1');
const STATE_DIR = join(SCRIPT_DIR, 'session-organizer');

class SessionOrganizerService extends TypertRemoteService {
  // ---- 内部工具 ----
  // 读已删除会话记录文件(不存在返回空数组)
  async _readDeleted() {
    const fs = this.ctx.get('fs');
    if (fs === undefined) return [];
    try {
      const target = await fs.resolve(DELETED_FILE_NAME, { cwd: STATE_DIR });
      const text = await fs.readText(target);
      const state = JSON.parse(text);
      if (!state || !Array.isArray(state.items)) return [];
      return state.items.filter((it) => it && typeof it.sessionId === 'string');
    } catch (e) {
      return [];
    }
  }

  async _writeDeleted(items) {
    const fs = this.ctx.get('fs');
    if (fs === undefined) return;
    try {
      const target = await fs.resolve(DELETED_FILE_NAME, { cwd: STATE_DIR });
      await fs.writeText(target, JSON.stringify({ items }, null, 2));
    } catch (e) { /* best effort */ }
  }

  // 执行一个 .ps1 脚本并等待结束
  async _runPs1(scriptPath) {
    const subprocess = this.ctx.get('subprocess');
    if (subprocess === undefined) throw new Error('subprocess 服务不可用');
    const pwsh = await subprocess.resolveExecutable('powershell.exe');
    const handle = subprocess.spawn({
      argv: [pwsh, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      cwd: SCRIPT_DIR,
      stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
      graceMs: 20000,
    });
    if (handle && typeof handle.done === 'object' && typeof handle.done.then === 'function') {
      await handle.done;
    }
  }

  async load() {
    const fs = this.ctx.get('fs');
    if (fs === undefined) return { ok: false, error: '文件系统服务不可用' };
    try {
      const target = await fs.resolve(FILE_NAME, { cwd: STATE_DIR });
      const text = await fs.readText(target);
      const state = JSON.parse(text);
      if (!state || typeof state !== 'object' || !Array.isArray(state.groups)) {
        return { ok: true, groups: [], order: {} };
      }
      return {
        ok: true,
        groups: state.groups,
        order: state.order || {},
        hiddenWorkspaces: Array.isArray(state.hiddenWorkspaces) ? state.hiddenWorkspaces : [],
      };
    } catch (e) {
      // file absent on first run — treat as empty state, not an error
      return { ok: true, groups: [], order: {} };
    }
  }

  async save(request) {
    const fs = this.ctx.get('fs');
    if (fs === undefined) return { ok: false, error: '文件系统服务不可用' };
    const state = request && request.state;
    if (!state || typeof state !== 'object') return { ok: false, error: 'bad args' };
    try {
      const target = await fs.resolve(FILE_NAME, { cwd: STATE_DIR });
      await fs.writeText(target, JSON.stringify(state, null, 2));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }

  // 内部删除单个会话目录(回收站):返回 { ok, error?, dir? }
  // 拒绝删除 live 会话;脚本内容纯 ASCII 防 PS 5.1 乱码。
  async _deleteSessionDir(sessionId, title) {
    const sessions = this.ctx.get('sessions');
    if (sessions !== undefined && sessions.get(sessionId) !== undefined) {
      return { ok: false, error: '会话正在运行,请先归档' };
    }
    const persistence = this.ctx.get('sessionPersistence');
    const fs = this.ctx.get('fs');
    if (persistence === undefined || fs === undefined) return { ok: false, error: '系统服务不可用' };
    try {
      const headers = await persistence.list();
      const header = headers.find((h) => h.id === sessionId);
      if (header === undefined) return { ok: false, error: '会话不存在' };
      const loc = persistence.locate(header);
      if (!loc || typeof loc.path !== 'string') return { ok: false, error: '无法定位会话文件' };
      const target = await fs.resolve(loc.path);
      const filePath = fs.processPath(target);
      const sep = filePath.indexOf('\\') !== -1 ? '\\' : '/';
      const dir = filePath.slice(0, filePath.lastIndexOf(sep));
      const script =
        'Add-Type -AssemblyName Microsoft.VisualBasic\r\n' +
        "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('" + dir + "', 'OnlyErrorDialogs', 'SendToRecycleBin')\r\n";
      await fs.writeText(await fs.resolve(DELETE_SCRIPT), script);
      await this._runPs1(DELETE_SCRIPT);
      const items = await this._readDeleted();
      items.unshift({
        sessionId,
        title: (typeof title === 'string' && title !== '') ? title : sessionId,
        dir,
        deletedAt: Date.now(),
      });
      await this._writeDeleted(items);
      return { ok: true, dir };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }

  // 删除会话:把持久化目录(sessions/<projectKey>/<sessionId>/)连同日志与附件
  // 移入 Windows 回收站(SendToRecycleBin,可还原,不物理删除),并记录到
  // DELETED_FILE_NAME 供「已删除」tab 展示与还原。sqlite 搜索索引会自动对账
  // (persistentDeletes → _deleteSession),workspace 注册表会在下次 reconcile
  // 过滤掉 header 缺失的会话,无需额外清理。
  // 拒绝删除 live 会话(内存中已挂载),避免破坏运行状态。
  async delete(request) {
    const sessionId = request && request.sessionId;
    if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, error: '缺少 sessionId' };
    return this._deleteSessionDir(sessionId, request && request.title);
  }

  // 批量删除已归档会话:每个会话回收站删除(复用 _deleteSessionDir)+ 从
  // archivedSessionIds 移除标记,一步完成避免两步间窗口闪烁。返回逐条结果。
  // 对"目录已不存在"的归档会话(如数据已被清理但标记残留)宽容处理:只移除
  // 标记,视为成功——归档删除的语义是"从归档消失",数据是否还在不影响。
  async deleteArchived(request) {
    const ids = request && request.ids;
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: '缺少 ids' };
    const registry = this.ctx.get('workspaceRegistry');
    const results = [];
    for (const sessionId of ids) {
      if (typeof sessionId !== 'string' || sessionId === '') {
        results.push({ sessionId, ok: false, error: '非法 sessionId' });
        continue;
      }
      const r = await this._deleteSessionDir(sessionId, (request && request.titles && request.titles[sessionId]) || sessionId);
      // 目录不存在(locate 失败或会话不在持久化列表)不算失败:数据已清理,
      // 只需移除归档标记。仅 live 会话/系统错误视为真失败。
      const treatAsCleaned = !r.ok && (
        r.error === '会话不存在' || r.error === '无法定位会话文件'
      );
      if (r.ok || treatAsCleaned) {
        // 移除归档标记
        if (registry !== undefined) {
          try {
            await registry.enqueueOperation(async () => {
              const state = registry.requireState();
              if (state.archivedSessionIds.includes(sessionId)) {
                await registry.setState({
                  ...state,
                  archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId),
                });
              }
            });
          } catch (e) { /* 标记移除失败不阻断删除结果 */ }
        }
        results.push({ sessionId, ok: true, cleaned: r.ok ? undefined : true });
      } else {
        results.push({ sessionId, ok: false, error: r.error });
      }
    }
    const failed = results.filter((x) => !x.ok);
    return failed.length > 0 ? { ok: false, partial: true, results } : { ok: true, results };
  }

  // 列出已删除会话(供「已删除」tab):[{sessionId,title,deletedAt}]
  async listDeleted() {
    const items = await this._readDeleted();
    return { ok: true, items: items.map((it) => ({ sessionId: it.sessionId, title: it.title, deletedAt: it.deletedAt })) };
  }

  // 还原已归档会话:把 sessionId 从 workspace 注册表的 archivedSessionIds 移除,
  // 归档会话的 workspace 记账槽位仍在,还原后回到原位置(官方 archiveSession 语义)。
  async restoreArchived(request) {
    const sessionId = request && request.sessionId;
    if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, error: '缺少 sessionId' };
    const registry = this.ctx.get('workspaceRegistry');
    if (registry === undefined) return { ok: false, error: 'workspace 服务不可用' };
    try {
      await registry.enqueueOperation(async () => {
        const state = registry.requireState();
        if (!state.archivedSessionIds.includes(sessionId)) return;
        await registry.setState({
          ...state,
          archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId),
        });
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }

  // 把 sessionId 加回 workspace 注册表的 archivedSessionIds(已删除会话还原后
  // 回到「已归档」状态——因为删除都是从已归档 tab 发起的)。
  async _readdArchived(sessionId) {
    const registry = this.ctx.get('workspaceRegistry');
    if (registry === undefined) return;
    try {
      await registry.enqueueOperation(async () => {
        const state = registry.requireState();
        if (!state.archivedSessionIds.includes(sessionId)) {
          await registry.setState({
            ...state,
            archivedSessionIds: [...state.archivedSessionIds, sessionId],
          });
        }
      });
    } catch (e) { /* best effort */ }
  }

  // 从回收站还原已删除会话:Shell COM 枚举回收站,按「原位置」匹配 dir,
  // 对匹配项执行「还原」动词(DoIt),把目录移回原位;成功后清除删除记录,
  // 并把会话加回 archivedSessionIds(回到已归档 tab)。
  // 脚本含中文动词「还原」,以 UTF-8 BOM 写文件(PS 5.1 需 BOM 才正确解码 UTF-8)。
  async restoreDeleted(request) {
    const sessionId = request && request.sessionId;
    if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, error: '缺少 sessionId' };
    const fs = this.ctx.get('fs');
    if (fs === undefined) return { ok: false, error: '文件系统服务不可用' };
    try {
      const items = await this._readDeleted();
      const it = items.find((x) => x.sessionId === sessionId);
      if (it === undefined) return { ok: false, error: '未找到删除记录' };
      // 目录已被还原(如用户手动从回收站还原)时直接清除记录即可
      const target = await fs.resolve(it.dir);
      const stat = await fs.stat(target);
      if (stat !== undefined) {
        await this._writeDeleted(items.filter((x) => x.sessionId !== sessionId));
        await this._readdArchived(sessionId);
        return { ok: true, already: true };
      }
      // Shell COM 的「原位置」列(GetDetailsOf(item,1))只显示父目录(两层路径时),
      // 所以按「父目录 + 名称」双匹配:it.dir 拆出父目录与末段(会话目录名=sessionId)。
      const sep = it.dir.indexOf('\\') !== -1 ? '\\' : '/';
      const lastSep = it.dir.lastIndexOf(sep);
      const parentDir = lastSep > 0 ? it.dir.slice(0, lastSep) : it.dir;
      const namePart = lastSep > 0 ? it.dir.slice(lastSep + 1) : '';
      const script =
        '\uFEFF' +
        '$shell = New-Object -ComObject Shell.Application\r\n' +
        '$bin = $shell.Namespace(10)\r\n' +
        "$parent = '" + parentDir + "'\r\n" +
        "$namePart = '" + namePart + "'\r\n" +
        'foreach ($item in $bin.Items()) {\r\n' +
        '  $orig = $bin.GetDetailsOf($item, 1)\r\n' +
        "  if ($orig -eq $parent -and $item.Name -eq $namePart) {\r\n" +
        '    $verb = $item.Verbs() | Where-Object { $_.Name -match ' + '"' + '还原' + '"' + ' } | Select-Object -First 1\r\n' +
        '    if ($verb) { $verb.DoIt() }\r\n' +
        '    break\r\n' +
        '  }\r\n' +
        '}\r\n';
      await fs.writeText(await fs.resolve(RESTORE_SCRIPT), script);
      await this._runPs1(RESTORE_SCRIPT);
      // 校验是否已还原
      const after = await fs.stat(target);
      if (after === undefined) return { ok: false, error: '回收站中未找到该会话或还原失败' };
      await this._writeDeleted(items.filter((x) => x.sessionId !== sessionId));
      await this._readdArchived(sessionId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }

  // 拉起子智能体:以 parentSessionId 为父,启动一个 continuable 子代理(名称=label)。
  // 父会话必须是 live(agents.get 拿到 Agent 才能作 parent)。
  // mode: 'new' = 全新(用 inheritsParentContext=false 的 provider,s'不继承'父上下文);
  //       'inherit' = 继承(用 inheritsParentContext=true 的 provider,子代理继承父会话已完成轮次)。
  // provider 从可用列表里挑支持 continuable(prepareContinuable)且匹配继承性的。
  async spawnSubagent(request) {
    const parentSessionId = request && request.parentSessionId;
    const name = request && request.name;
    const wantInherit = request && request.mode === 'inherit';
    const task = request && request.task;
    if (typeof parentSessionId !== 'string' || parentSessionId === '') return { ok: false, error: '缺少 parentSessionId' };
    if (typeof name !== 'string' || name.trim() === '') return { ok: false, error: '缺少子智能体名称' };
    const agents = this.ctx.get('agents');
    if (agents === undefined) return { ok: false, error: 'agents 服务不可用' };
    const parent = agents.get(parentSessionId);
    if (parent === undefined) return { ok: false, error: '父会话未在运行，无法拉起子智能体' };
    const subagents = this.ctx.get('subagents');
    if (subagents === undefined) return { ok: false, error: 'subagents 服务不可用' };
    try {
      const names = subagents.list();
      let provider = null;
      for (const n of names) {
        const p = subagents.getProvider(n);
        if (p && typeof p.prepareContinuable === 'function' && !!p.inheritsParentContext === wantInherit) { provider = n; break; }
      }
      if (provider === null) return { ok: false, error: wantInherit ? '没有可用的继承型子代理 provider' : '没有可用的 continuable 子代理 provider' };
      const label = name.trim();
      // 任务优先;未填任务则用缺省"确认就绪"(继承模式提示已带父上下文)。
      const taskText = (typeof task === 'string' && task.trim() !== '') ? task.trim()
        : (wantInherit
          ? '你是一个子智能体，名称「' + label + '」，已继承父会话的上下文。请回复一句话确认就绪，然后等待父会话发送任务。'
          : '你是一个子智能体，名称「' + label + '」。请回复一句话确认就绪，然后等待父会话发送任务。');
      const prompt = [{ type: 'text', text: taskText }];
      const ctrl = new AbortController();
      const start = await subagents.startContinuable({
        provider,
        label,
        request: { prompt, parent },
        signal: ctrl.signal,
      });
      return { ok: true, childId: start && start.childId };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }

  // 结束子智能体:对目标子代理发出 interrupt(取消其当前 Activation)。
  // authority 用 user + 父会话地址(子代理行的父即所在会话)。
  async endSubagent(request) {
    const childId = request && request.childSessionId;
    const parentId = request && request.parentSessionId;
    if (typeof childId !== 'string' || childId === '') return { ok: false, error: '缺少 childSessionId' };
    if (typeof parentId !== 'string' || parentId === '') return { ok: false, error: '缺少 parentSessionId' };
    const subagents = this.ctx.get('subagents');
    if (subagents === undefined) return { ok: false, error: 'subagents 服务不可用' };
    try {
      subagents.interrupt(childId, { kind: 'user', parentSessionId: parentId });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }
}

export default {
  name: 'dsh-organizer-sidebar',
  apply(ctx) {
    new SessionOrganizerService(ctx, 'organizer');
  },
};
