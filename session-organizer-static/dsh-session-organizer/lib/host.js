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

const FILE_NAME = '.dsh-session-organizer.json';
const DELETED_FILE_NAME = '.dsh-session-organizer-deleted.json';
// 固定脚本路径:避免每处拼接;纯 ASCII/BOM 控制见各方法注释。
const SCRIPT_DIR = 'C:\\Users\\22320\\.dsh';
const DELETE_SCRIPT = SCRIPT_DIR + '\\dsh-delete-session.ps1';
const RESTORE_SCRIPT = SCRIPT_DIR + '\\dsh-restore-session.ps1';
const STATE_DIR = SCRIPT_DIR + '\\session-organizer';

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
      return { ok: true, groups: state.groups, order: state.order || {} };
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

  // 删除会话:把持久化目录(sessions/<projectKey>/<sessionId>/)连同日志与附件
  // 移入 Windows 回收站(SendToRecycleBin,可还原,不物理删除),并记录到
  // DELETED_FILE_NAME 供「已删除」tab 展示与还原。sqlite 搜索索引会自动对账
  // (persistentDeletes → _deleteSession),workspace 注册表会在下次 reconcile
  // 过滤掉 header 缺失的会话,无需额外清理。
  // 拒绝删除 live 会话(内存中已挂载),避免破坏运行状态。
  // 脚本内容纯 ASCII(路径由 encodeSegment/projectKey 编码,不含单引号与高位
  // 字符),避免 PowerShell 5.1 读 UTF-8 乱码(MEMORY §9);引号只出现在文件内容,
  // 不经 argv 序列化(MEMORY §11.4)。
  async delete(request) {
    const sessionId = request && request.sessionId;
    if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, error: '缺少 sessionId' };
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
      // 记录已删除元数据(标题由客户端提供,展示友好;缺省用 id 兜底)
      const items = await this._readDeleted();
      items.unshift({
        sessionId,
        title: (request && typeof request.title === 'string' && request.title !== '') ? request.title : sessionId,
        dir,
        deletedAt: Date.now(),
      });
      await this._writeDeleted(items);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
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

  // 从回收站还原已删除会话:Shell COM 枚举回收站,按「原位置」匹配 dir,
  // 对匹配项执行「还原」动词(DoIt),把目录移回原位;成功后清除删除记录。
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
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }
}

export default {
  name: 'dsh-session-organizer',
  apply(ctx) {
    new SessionOrganizerService(ctx, 'organizer');
  },
};
