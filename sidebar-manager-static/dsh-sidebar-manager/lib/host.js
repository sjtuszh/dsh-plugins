// ============================================================================
// 侧栏会话管理器 — Host 半边(静态版)
// ----------------------------------------------------------------------------
// 'sessman' 服务继承 TypertRemoteService(构造即注册 + typertRemote 绑定,
// 见 MEMORY §11.4b——普通 ctx.provide 会被网关拒收)。
// rename 支持冷会话:persistence.load → sessions.prepare(seedSource:'persistence')
// → enter(装 append 钩子,不 announce) → sessionTitle.rename → detach。
// 持久化层全局订阅 session/event,detach 不影响冲刷(已探针实证)。
// ============================================================================

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

class SidebarManagerService extends TypertRemoteService {
  async rename(request) {
    const sessionId = request && typeof request.sessionId === 'string' ? request.sessionId : '';
    const title = request && typeof request.title === 'string' ? request.title : '';
    if (!sessionId || !title.trim()) return { ok: false, error: '参数不完整' };
    const sessions = this.ctx.get('sessions');
    const sessionTitle = this.ctx.get('sessionTitle');
    if (sessions === undefined || sessionTitle === undefined) return { ok: false, error: '服务不可用' };
    let session = sessions.get(sessionId);
    let detach = null;
    if (session === undefined) {
      const persistence = this.ctx.get('sessionPersistence');
      if (persistence === undefined) return { ok: false, error: '持久化服务不可用' };
      try {
        const inspected = await persistence.load(sessionId);
        session = sessions.prepare(sessionId, {
          seedSource: 'persistence',
          seed: inspected.events,
          meta: inspected.meta,
        });
        detach = sessions.enter(session);
      } catch (e) {
        return { ok: false, error: '会话不存在或无法恢复' };
      }
    }
    try {
      const snap = await sessionTitle.rename(session, title.trim());
      return { ok: true, title: snap && snap.title ? snap.title : title.trim() };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : String(e) };
    } finally {
      if (detach !== null) {
        try { detach(); } catch (e) { /* ignore */ }
      }
    }
  }
}

export default {
  name: 'dsh-sidebar-manager',
  apply(ctx) {
    new SidebarManagerService(ctx, 'sessman');
  },
};
