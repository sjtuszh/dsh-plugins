// ============================================================================
// 侧栏会话管理器 — 实验区影子浏览器(Host 半边,动态版 v2)
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.host 传入(函数体,返回 Cordis Plugin)。
//
// v2 变更:sessman:rename 支持冷会话 —— 从持久化物化(load → prepare
// (seedSource:'persistence') → enter 装 append 钩子 → rename → detach),
// 与官方 host-apiproxy 的 "session.rename 冷会话先恢复" 语义等价但更轻
// (不拉起完整 Agent)。持久化层全局订阅 session/event,detach 不影响冲刷。
// ============================================================================

return {
  apply(ctx) {
    harness.handle('sessman:rename', async (args) => {
      const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : '';
      const title = args && typeof args.title === 'string' ? args.title : '';
      if (!sessionId || !title.trim()) return { ok: false, error: '参数不完整' };
      const sessions = ctx.get('sessions');
      const sessionTitle = ctx.get('sessionTitle');
      if (sessions === undefined || sessionTitle === undefined) return { ok: false, error: '服务不可用' };
      let session = sessions.get(sessionId);
      let detach = null;
      if (session === undefined) {
        const persistence = ctx.get('sessionPersistence');
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
    });
  },
};
