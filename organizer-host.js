// dsh-session-organizer dynamic plugin — HOST half.
// Durable state (user groups + per-account session order) lives in a small
// JSON file under the workspace root, read/written through the abstract fs
// service. Everything degrades gracefully when fs/sandboxPolicy are absent.

return {
  apply(ctx) {
    const fs = ctx.get('fs');
    const sandboxPolicy = ctx.get('sandboxPolicy');
    const fileName = '.dsh-session-organizer.json';

    const resolveTarget = async () => {
      const root = (sandboxPolicy && sandboxPolicy.workspaceRoot) || '';
      if (root === '') throw new Error('no workspace root');
      return fs.resolve(fileName, { cwd: root });
    };

    harness.handle('org-load', async () => {
      try {
        if (fs === undefined) return { ok: false, error: 'fs unavailable' };
        const target = await resolveTarget();
        const text = await fs.readText(target);
        const state = JSON.parse(text);
        if (!state || typeof state !== 'object' || !Array.isArray(state.groups)) return { ok: false, error: 'bad state' };
        return { ok: true, groups: state.groups, order: state.order || {} };
      } catch (e) {
        // file absent on first run — treat as empty state, not an error
        return { ok: true, groups: [], order: {} };
      }
    });

    harness.handle('org-save', async (args) => {
      try {
        if (fs === undefined) return { ok: false, error: 'fs unavailable' };
        const state = args && args.state;
        if (!state || typeof state !== 'object') return { ok: false, error: 'bad args' };
        const target = await resolveTarget();
        await fs.writeText(target, JSON.stringify(state, null, 2));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    });
  },
};
