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
// 职责:持久化用户分组 + 每账户会话顺序到工作区根的
// `.dsh-session-organizer.json`(load/save 两个 Typert 端点)。
// fs 惰性获取(§5.3:服务无条件提供,方法内再 ctx.get('fs')).
// ============================================================================

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

const FILE_NAME = '.dsh-session-organizer.json';

class SessionOrganizerService extends TypertRemoteService {
  async load() {
    const fs = this.ctx.get('fs');
    const sandboxPolicy = this.ctx.get('sandboxPolicy');
    if (fs === undefined) return { ok: false, error: '文件系统服务不可用' };
    try {
      const root = (sandboxPolicy && sandboxPolicy.workspaceRoot) || '';
      if (root === '') return { ok: true, groups: [], order: {} };
      const target = await fs.resolve(FILE_NAME, { cwd: root });
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
    const sandboxPolicy = this.ctx.get('sandboxPolicy');
    if (fs === undefined) return { ok: false, error: '文件系统服务不可用' };
    const state = request && request.state;
    if (!state || typeof state !== 'object') return { ok: false, error: 'bad args' };
    try {
      const root = (sandboxPolicy && sandboxPolicy.workspaceRoot) || '';
      if (root === '') return { ok: false, error: 'no workspace root' };
      const target = await fs.resolve(FILE_NAME, { cwd: root });
      await fs.writeText(target, JSON.stringify(state, null, 2));
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
