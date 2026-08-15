// ============================================================================
// DeepSeek 双轨计费面板 — Host 半边
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.host 传入(函数体,返回 Cordis Plugin)。
//
// 职责:
//  1. 监听 session/event,折叠 assistant/message 事件中的 usage 数据;
//  2. 双轨计价:
//     - Relay/GPT 模型(gpt-*):按美元额度计价,1 额度$ = ¥0.4 折算人民币;
//     - DeepSeek 官方模型(deepseek-*):直接人民币计价,2026-08-17 之后按
//       北京时间高峰(09:00-12:00, 14:00-18:00)/空闲价切换,此前为旧价;
//  3. 三层聚合:session totals / per-turn totals / call history(最近 100 条);
//  4. 账本持久化:激活时恢复、运行中每 5s 增量 flush、停止时强制保存、
//     损坏时从空内存重建;
//  5. 暴露 cost:snapshot 与 cost:history 两个 Package-private RPC。
//
// 依赖服务:session/event 事件、sessions、fs、timer(经 ctx.get / inject)。
// ============================================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const CREDIT_TO_RMB = 0.4;
    const NEW_PRICING_MS = Date.UTC(2026, 7, 17, 0, 0, 0) - 8 * 3600e3;
    const LEDGER_PATH = 'C:\\Users\\22320\\.dsh\\dsh-cost-ledger.json';

    const RELAY_RATES = {
      'gpt-5.6-sol': { input: 5, output: 40, cacheRead: 0.5, cacheWrite: 5 },
      'gpt-5.6-terra': { input: 2.5, output: 20, cacheRead: 0.25, cacheWrite: 3.125 },
      'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 5 },
      'gpt-5.4-mini': { input: 0.75, output: 4.5, cacheRead: 0, cacheWrite: 0.75 },
      'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 2.5 },
    };
    const DEFAULT_RELAY = 'gpt-5.4';

    const LEGACY_RATES = {
      flash: {
        old: { hit: 0.02, miss: 1.0, out: 2.0 },
        off: { hit: 0.05, miss: 1.5, out: 4.5 },
        peak: { hit: 0.10, miss: 3.0, out: 9.0 },
      },
      pro: {
        old: { hit: 0.025, miss: 3.0, out: 6.0 },
        off: { hit: 0.15, miss: 4.5, out: 13.5 },
        peak: { hit: 0.30, miss: 9.0, out: 27.0 },
      },
    };

    const isPeak = (now) => {
      const bj = new Date(now + 8 * 3600e3);
      const h = bj.getUTCHours();
      return (h >= 9 && h < 12) || (h >= 14 && h < 18);
    };
    const schemeOf = (now) => (now >= NEW_PRICING_MS ? (isPeak(now) ? 'peak' : 'off') : 'old');
    const schemeInfo = (now) => ({ newPricing: now >= NEW_PRICING_MS, peak: isPeak(now), label: schemeOf(now) });

    const isLegacy = (model) => /deepseek/i.test(String(model || ''));

    const unitOf = (model, now) => {
      const m = String(model || '').toLowerCase();
      if (isLegacy(model)) {
        const tier = m.includes('pro') ? 'pro' : 'flash';
        const scheme = schemeOf(now);
        const r = LEGACY_RATES[tier][scheme];
        return { billing: 'legacy', hit: r.hit, miss: r.miss, out: r.out, label: model, scheme };
      }
      const r = RELAY_RATES[m] || RELAY_RATES[DEFAULT_RELAY];
      return { billing: 'relay', input: r.input, output: r.output, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, label: RELAY_RATES[m] ? model : DEFAULT_RELAY, scheme: null };
    };

    const perSession = new Map();
    let dirty = false;

    const totalFor = (sessionId) => {
      let s = perSession.get(sessionId);
      if (!s) {
        s = {
          baseline: 0, foldedSeq: 0,
          relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0,
          calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheTokens: 0,
          lastCall: null, lastTurnKey: null, turns: new Map(), history: [],
        };
        perSession.set(sessionId, s);
      }
      return s;
    };

    const foldEvent = (sessionId, event, now) => {
      const s = totalFor(sessionId);
      if (typeof event.seq !== 'number' || event.seq < s.foldedSeq) return;
      s.foldedSeq = event.seq + 1;
      if (event.type !== 'assistant/message') return;
      const data = event.data;
      if (!data || !data.usage) return;
      const src = data.message && data.message.source;
      const model = (src && src.model) || '';
      const usage = data.usage;
      const input = usage.inputTokens || 0;
      const output = usage.outputTokens || 0;
      const cacheRead = usage.cacheReadTokens || 0;
      const cacheWrite = usage.cacheWriteTokens || 0;
      const time = typeof event.time === 'number' ? event.time : now;
      const u = unitOf(model, time);

      let inputCost = 0, cacheReadCost = 0, cacheWriteCost = 0, outputCost = 0;
      let relayCostCredit = 0, legacyCostRmb = 0;
      if (u.billing === 'relay') {
        inputCost = input * u.input / 1e6;
        cacheReadCost = cacheRead * u.cacheRead / 1e6;
        cacheWriteCost = cacheWrite * u.cacheWrite / 1e6;
        outputCost = output * u.output / 1e6;
        relayCostCredit = inputCost + cacheReadCost + cacheWriteCost + outputCost;
      } else {
        inputCost = input * u.miss / 1e6;
        cacheReadCost = cacheRead * u.hit / 1e6;
        cacheWriteCost = cacheWrite * u.hit / 1e6;
        outputCost = output * u.out / 1e6;
        legacyCostRmb = inputCost + cacheReadCost + cacheWriteCost + outputCost;
      }
      const relayCostRmb = relayCostCredit * CREDIT_TO_RMB;
      const totalCostRmb = relayCostRmb + legacyCostRmb;
      const billed = input + cacheRead + cacheWrite;
      const cacheHitRate = billed > 0 ? (cacheRead / billed) * 100 : null;

      const entry = {
        seq: event.seq, time, turn: data.turn, step: data.step,
        model, rateLabel: u.label, billing: u.billing, scheme: u.scheme,
        inputTokens: input, outputTokens: output,
        cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
        cacheTokens: cacheRead + cacheWrite,
        inputCost, cacheReadCost, cacheWriteCost,
        cacheCost: cacheReadCost + cacheWriteCost, outputCost,
        relayCostCredit, relayCostRmb, legacyCostRmb, totalCostRmb,
        cacheHitRate,
        unit: {
          input: u.billing === 'relay' ? u.input : u.miss,
          output: u.billing === 'relay' ? u.output : u.out,
          cacheRead: u.billing === 'relay' ? u.cacheRead : u.hit,
          cacheWrite: u.billing === 'relay' ? u.cacheWrite : u.hit,
          multiplier: 1, creditToRmb: CREDIT_TO_RMB,
          label: u.label, billing: u.billing,
          currency: u.billing === 'relay' ? 'CREDIT' : 'CNY',
          scheme: u.scheme,
        },
      };

      s.calls += 1;
      s.inputTokens += input;
      s.outputTokens += output;
      s.cacheReadTokens += cacheRead;
      s.cacheWriteTokens += cacheWrite;
      s.cacheTokens += cacheRead + cacheWrite;
      s.relayCostCredit += relayCostCredit;
      s.relayCostRmb += relayCostRmb;
      s.legacyCostRmb += legacyCostRmb;
      s.totalCostRmb += totalCostRmb;
      s.lastCall = entry;
      s.history.unshift(entry);
      if (s.history.length > 100) s.history.length = 100;

      const turnKey = data.turn;
      if (turnKey !== undefined && turnKey !== null) {
        let t = s.turns.get(turnKey);
        if (!t) {
          t = { turn: turnKey, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheTokens: 0, relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0, calls: 0, models: {} };
          s.turns.set(turnKey, t);
        }
        t.inputTokens += input;
        t.outputTokens += output;
        t.cacheReadTokens += cacheRead;
        t.cacheWriteTokens += cacheWrite;
        t.cacheTokens += cacheRead + cacheWrite;
        t.relayCostCredit += relayCostCredit;
        t.relayCostRmb += relayCostRmb;
        t.legacyCostRmb += legacyCostRmb;
        t.totalCostRmb += totalCostRmb;
        t.calls += 1;
        t.models[model] = (t.models[model] || 0) + 1;
        s.lastTurnKey = turnKey;
      }
      dirty = true;
    };

    const replay = (sessionId) => {
      const sessions = ctx.get('sessions');
      if (sessions === undefined) return;
      const session = sessions.get(sessionId);
      if (session === undefined) return;
      const s = totalFor(sessionId);
      if (!s.baseline) {
        const header = session.header;
        const seed = header && typeof header.seedLength === 'number' && header.seedLength > 0 ? header.seedLength : 0;
        s.baseline = seed;
        if (s.foldedSeq < seed) s.foldedSeq = seed;
      }
      const events = session.events;
      const now = Date.now();
      for (let i = 0; i < events.length; i++) foldEvent(sessionId, events[i], now);
    };

    const loadLedger = async () => {
      const fs = ctx.get('fs');
      if (fs === undefined) return;
      try {
        const target = await fs.resolve(LEDGER_PATH);
        const info = await fs.stat(target);
        if (!info) return;
        const text = await fs.readText(target);
        const parsed = JSON.parse(text);
        if (parsed && parsed.sessions && typeof parsed.sessions === 'object') {
          for (const [id, raw] of Object.entries(parsed.sessions)) {
            if (!raw || typeof raw !== 'object') continue;
            const s = totalFor(id);
            s.baseline = typeof raw.baseline === 'number' ? raw.baseline : 0;
            s.foldedSeq = typeof raw.foldedSeq === 'number' ? raw.foldedSeq : 0;
            s.relayCostCredit = raw.relayCostCredit || 0;
            s.relayCostRmb = raw.relayCostRmb || 0;
            s.legacyCostRmb = raw.legacyCostRmb || 0;
            s.totalCostRmb = raw.totalCostRmb || 0;
            s.calls = raw.calls || 0;
            s.inputTokens = raw.inputTokens || 0;
            s.outputTokens = raw.outputTokens || 0;
            s.cacheReadTokens = raw.cacheReadTokens || 0;
            s.cacheWriteTokens = raw.cacheWriteTokens || 0;
            s.cacheTokens = raw.cacheTokens || 0;
            s.lastCall = raw.lastCall || null;
            s.lastTurnKey = raw.lastTurnKey || null;
            if (Array.isArray(raw.turns)) s.turns = new Map(raw.turns);
            if (Array.isArray(raw.history)) s.history = raw.history;
          }
        }
      } catch (e) {
        // ledger 损坏 → 从空内存重建
      }
    };

    const saveLedger = async () => {
      if (!dirty) return;
      const fs = ctx.get('fs');
      if (fs === undefined) return;
      try {
        const target = await fs.resolve(LEDGER_PATH);
        const out = { version: 1, sessions: {}, history: [] };
        for (const [id, s] of perSession) {
          out.sessions[id] = {
            baseline: s.baseline, foldedSeq: s.foldedSeq,
            relayCostCredit: s.relayCostCredit, relayCostRmb: s.relayCostRmb,
            legacyCostRmb: s.legacyCostRmb, totalCostRmb: s.totalCostRmb,
            calls: s.calls, inputTokens: s.inputTokens, outputTokens: s.outputTokens,
            cacheReadTokens: s.cacheReadTokens, cacheWriteTokens: s.cacheWriteTokens,
            cacheTokens: s.cacheTokens,
            lastCall: s.lastCall, lastTurnKey: s.lastTurnKey,
            turns: Array.from(s.turns.entries()), history: s.history,
          };
        }
        await fs.writeText(target, JSON.stringify(out, null, 2));
        dirty = false;
      } catch (e) { /* ignore */ }
    };

    loadLedger();
    ctx.interval(() => { saveLedger(); }, 5000);
    ctx.on('dispose', () => { saveLedger(); });

    ctx.on('session/event', (session, event) => {
      foldEvent(session.id, event, Date.now());
    });
    ctx.on('session/disposed', (session) => {
      perSession.delete(session.id);
    });

    harness.handle('cost:snapshot', async (args) => {
      const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : undefined;
      const now = Date.now();
      const empty = { calls: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0 };
      if (sessionId === undefined) {
        return { totals: empty, lastCall: null, lastTurn: null, forked: false, scheme: schemeInfo(now), ts: now };
      }
      replay(sessionId);
      const s = perSession.get(sessionId);
      const totals = s
        ? { calls: s.calls, inputTokens: s.inputTokens, outputTokens: s.outputTokens, cacheTokens: s.cacheTokens, relayCostCredit: s.relayCostCredit, relayCostRmb: s.relayCostRmb, legacyCostRmb: s.legacyCostRmb, totalCostRmb: s.totalCostRmb }
        : empty;
      let lastTurn = null;
      if (s && s.lastTurnKey !== null && s.lastTurnKey !== undefined) {
        const t = s.turns.get(s.lastTurnKey);
        if (t !== undefined) {
          lastTurn = { turn: t.turn, inputTokens: t.inputTokens, outputTokens: t.outputTokens, cacheTokens: t.cacheTokens, relayCostCredit: t.relayCostCredit, relayCostRmb: t.relayCostRmb, legacyCostRmb: t.legacyCostRmb, totalCostRmb: t.totalCostRmb, calls: t.calls };
        }
      }
      return {
        totals,
        lastCall: s ? s.lastCall : null,
        lastTurn,
        forked: s ? s.baseline > 0 : false,
        scheme: schemeInfo(now),
        ts: now,
      };
    });

    harness.handle('cost:history', async (args) => {
      const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : undefined;
      if (sessionId === undefined) return { calls: [] };
      replay(sessionId);
      const s = perSession.get(sessionId);
      return { calls: s ? s.history : [] };
    });
  },
};
