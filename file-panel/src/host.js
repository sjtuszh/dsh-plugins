// ============================================================================
// 文件树浏览面板 — Host 半边(动态版 v3)
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.host 传入(函数体,返回 Cordis Plugin)。
//
// 职责:
//  1. filetree:list   — 列目录(fs.resolve/stat/listDir/processPath,条目自带 type);
//  2. filetree:reveal — 在系统文件管理器中打开/定位。
//
// v3 reveal 方案(关键):命令写入临时 .cmd 文件(fs.writeText 不经 argv 序列化),
// 再 cmd /c 执行 —— 绕开 Node spawn 把参数内嵌引号转义为 \" 的问题
// (subprocess 未开 windowsVerbatimArguments;dsh-pwsh-local 把命令作为单个
// -Command argv 元素传、同样被转义),explorer /select,"path" 由此正确定位。
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
      const fs = ctx.get('fs');
      const subprocess = ctx.get('subprocess');
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
    });
  },
};
