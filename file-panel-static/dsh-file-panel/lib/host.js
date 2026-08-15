// ============================================================================
// 文件树浏览面板 — Host 半边(静态版 v5)
// ----------------------------------------------------------------------------
// 关键(踩坑实录, MEMORY §11.4):Typert 网关调用时校验服务对象身上的
// `typertRemote` 绑定(`validateBinding` 源码确认)——普通 `ctx.provide({...})`
// 会报 "Service filetree has no visible typertRemote binding"。
// 必须用 `TypertRemoteService`(Cordis Service 子类):构造即
// `ctx.reflect.provide(key, this)` 注册服务 + 打上 {service, serviceKey, namespace}
// 绑定,随 fiber 卸载自动注销。@Remote 装饰器仅 SRC 模式需要,strict 清单不需要。
//
// reveal 仍走「临时 .cmd 文件 + cmd /c」方案绕开 Node argv 引号转义。
// ============================================================================

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

const nativeOf = (p) => {
  if (p.indexOf('\\') !== -1) return p;
  if (!/^[a-zA-Z]:\//.test(p)) return p;
  return p.split('/').join('\\');
};

class FileTreeService extends TypertRemoteService {
  async list(request) {
    const path = request && typeof request.path === 'string' ? request.path : '';
    if (!path) return { ok: false, error: '缺少路径' };
    const fs = this.ctx.get('fs');
    if (fs === undefined) return { ok: false, error: '文件系统服务不可用' };
    try {
      const target = await fs.resolve(path);
      const info = await fs.stat(target);
      if (!info) return { ok: false, error: '路径不存在' };
      if (info.type !== 'directory') return { ok: false, error: '不是目录' };
      const entries = await fs.listDir(target);
      const items = entries.map((e) => ({
        name: e.name,
        kind: e.type === 'directory' ? 'dir' : e.type === 'file' ? 'file' : 'other',
        path: nativeOf(fs.processPath(e.target)),
      }));
      items.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      return { ok: true, path: nativeOf(fs.processPath(target)), items };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }

  async reveal(request) {
    const path = request && typeof request.path === 'string' ? request.path : '';
    const kind = request && request.kind === 'dir' ? 'dir' : 'file';
    if (!path) return { ok: false, error: '缺少路径' };
    const fs = this.ctx.get('fs');
    const subprocess = this.ctx.get('subprocess');
    if (fs === undefined || subprocess === undefined) return { ok: false, error: '系统服务不可用' };
    try {
      const scriptPath = 'C:\\Users\\22320\\.dsh\\dsh-reveal.cmd';
      const line = kind === 'dir'
        ? 'explorer.exe "' + path + '"'
        : 'explorer.exe "/select,' + path + '"';
      const target = await fs.resolve(scriptPath);
      await fs.writeText(target, '@echo off\r\nchcp 65001 >nul\r\n' + line + '\r\n');
      const cmd = await subprocess.resolveExecutable('cmd.exe');
      subprocess.spawn({
        argv: [cmd, '/c', scriptPath],
        cwd: 'C:\\Users\\22320\\.dsh',
        stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
        graceMs: 5000,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    }
  }
}

export default {
  name: 'dsh-file-panel',
  apply(ctx) {
    new FileTreeService(ctx, 'filetree');
  },
};
