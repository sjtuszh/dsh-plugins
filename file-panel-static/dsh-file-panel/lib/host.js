// ============================================================================
// 文件树浏览面板 — Host 半边(静态版)
// ----------------------------------------------------------------------------
// 无条件提供 'filetree' Cordis 服务(MEMORY §5.3:服务必须无条件提供,不能因
// 依赖服务暂缺而早退),方法内部惰性取 fs / subprocess。
// Typert 网关经 dsh-file-panel/lib/typert.host.js 的清单把
// `filetree/list`、`filetree/reveal` 端点映射到本服务的方法。
// ============================================================================

export default {
  name: 'dsh-file-panel',
  apply(ctx) {
    const nativeOf = (p) => {
      if (p.indexOf('\\') !== -1) return p;
      if (!/^[a-zA-Z]:\//.test(p)) return p;
      return p.split('/').join('\\');
    };

    ctx.provide('filetree', {
      async list(request) {
        const path = request && typeof request.path === 'string' ? request.path : '';
        if (!path) return { ok: false, error: '缺少路径' };
        const fs = ctx.get('fs');
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
      },

      async reveal(request) {
        const path = request && typeof request.path === 'string' ? request.path : '';
        const kind = request && request.kind === 'dir' ? 'dir' : 'file';
        if (!path) return { ok: false, error: '缺少路径' };
        const subprocess = ctx.get('subprocess');
        if (subprocess === undefined) return { ok: false, error: '子进程服务不可用' };
        try {
          const exe = await subprocess.resolveExecutable('explorer.exe');
          const sep = path.indexOf('\\') !== -1 ? '\\' : '/';
          const idx = path.lastIndexOf(sep);
          const parent = idx > 0 ? path.slice(0, idx) : (path.indexOf('\\') !== -1 ? 'C:\\' : '/');
          const arg = kind === 'dir' ? '"' + path + '"' : '/select,"' + path + '"';
          subprocess.spawn({
            argv: [exe, arg],
            cwd: parent,
            stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
            graceMs: 5000,
          });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
        }
      },
    });
  },
};
