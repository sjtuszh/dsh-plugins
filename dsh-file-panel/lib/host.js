// ============================================================================
// 文件树浏览面板 — Host 半边(静态版 v6, npm-ready)
// ----------------------------------------------------------------------------
// 关键(踩坑实录, MEMORY §11.4):Typert 网关调用时校验服务对象身上的
// `typertRemote` 绑定(`validateBinding` 源码确认)——普通 `ctx.provide({...})`
// 会报 "Service filetree has no visible typertRemote binding"。
// 必须用 `TypertRemoteService`(Cordis Service 子类):构造即
// `ctx.reflect.provide(key, this)` 注册服务 + 打上 {service, serviceKey, namespace}
// 绑定,随 fiber 卸载自动注销。@Remote 装饰器仅 SRC 模式需要,strict 清单不需要。
//
// reveal:直接打开目标目录(文件→父目录,文件夹→自身),命令写入临时 .cmd 文件
// (fs.writeText 不经 argv 序列化)再 cmd /c 执行;不用 explorer /select,
// (经 cmd 传递解析不可靠,实测开错目录)。
// 路径参数化:DSH_HOME 环境变量优先,缺省 ~/.dsh —— 发布到 npm 后其他机器可用。
// ============================================================================

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const REVEAL_SCRIPT = join(DSH_HOME, 'dsh-reveal.cmd');

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
      const sep = path.indexOf('\\') !== -1 ? '\\' : '/';
      const idx = path.lastIndexOf(sep);
      // 不用 /select,:直接打开目标目录——文件→父目录,文件夹→自身。
      const targetDir = kind === 'dir' ? path : (idx > 0 ? path.slice(0, idx) : path);
      const line = 'explorer.exe "' + targetDir + '"';
      const target = await fs.resolve(REVEAL_SCRIPT);
      await fs.writeText(target, '@echo off\r\nchcp 65001 >nul\r\n' + line + '\r\n');
      const cmd = await subprocess.resolveExecutable('cmd.exe');
      subprocess.spawn({
        argv: [cmd, '/c', REVEAL_SCRIPT],
        cwd: dirname(REVEAL_SCRIPT),
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
