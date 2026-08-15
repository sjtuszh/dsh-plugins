// ============================================================================
// 文件树浏览面板 — Host 半边(动态版)
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.host 传入(函数体,返回 Cordis Plugin)。
//
// 职责:
//  1. filetree:list   — 列目录(fs.resolve/stat/listDir/processPath,条目自带 type);
//  2. filetree:reveal — 在系统文件管理器中打开/定位(subprocess spawn explorer.exe,
//                       文件用 /select, 定位,目录直接打开)。
//
// 只依赖 fs / subprocess 两个可选服务,均判 undefined。
// ============================================================================

return {
  apply(ctx) {
    const nativeOf = (p) => {
      if (p.indexOf('\\') !== -1) return p;
      if (!/^[a-zA-Z]:\//.test(p)) return p;
      return p.split('/').join('\\');
    };

    harness.handle('filetree:list', async (args) => {
      const path = args && typeof args.path === 'string' ? args.path : '';
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
    });

    harness.handle('filetree:reveal', async (args) => {
      const path = args && typeof args.path === 'string' ? args.path : '';
      const kind = args && args.kind === 'dir' ? 'dir' : 'file';
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
    });
  },
};
