// ============================================================================
// DeepSeek 双轨计费面板 — Host 半边（静态版）
// ----------------------------------------------------------------------------
// 通过 sessionProjections 注册 'costSnapshot' 投影:
//   - apply 折叠 assistant/message 事件的 usage,累计三层聚合(会话/轮次/历史);
//   - view 输出 totals / lastTurn / lastCall / history / scheme / prices;
//   - 投影检查点自动持久化,重启后从会话日志整体重放(历史/总账全量恢复,
//     无需独立账本文件)。
// 客户端经槽位 props 的 useProjection('costSnapshot') 读取,无 RPC、无轮询。
//
// 已知差异(相对动态版):投影 apply 是纯函数、看不到 session header,
// 分叉会话按全量计费(不再按 seedLength 归零),客户端不显示分叉徽章。
// ============================================================================

const CREDIT_TO_RMB = 0.4;
const NEW_PRICING_MS = Date.UTC(2026, 7, 17, 0, 0, 0) - 8 * 3600e3;

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

const SCHEME_LABELS = { old: '旧价(8/17前)', off: '空闲价', peak: '高峰价' };
const TIER_LABELS = { flash: 'Flash 档（deepseek-*）', pro: 'Pro 档（deepseek-*-pro）' };

function isPeak(now) {
  const bj = new Date(now + 8 * 3600e3);
  const h = bj.getUTCHours();
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}
function schemeOf(now) { return now >= NEW_PRICING_MS ? (isPeak(now) ? 'peak' : 'off') : 'old'; }
function schemeInfo(now) { return { newPricing: now >= NEW_PRICING_MS, peak: isPeak(now), label: schemeOf(now) }; }
function isLegacy(model) { return /deepseek/i.test(String(model || '')); }
function unitOf(model, now) {
  const m = String(model || '').toLowerCase();
  if (isLegacy(model)) {
    const tier = m.includes('pro') ? 'pro' : 'flash';
    const scheme = schemeOf(now);
    const r = LEGACY_RATES[tier][scheme];
    return { billing: 'legacy', hit: r.hit, miss: r.miss, out: r.out, label: model, scheme };
  }
  const r = RELAY_RATES[m] || RELAY_RATES[DEFAULT_RELAY];
  return { billing: 'relay', input: r.input, output: r.output, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, label: RELAY_RATES[m] ? model : DEFAULT_RELAY, scheme: null };
}

function initState() {
  return {
    calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheTokens: 0,
    relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0,
    lastCall: null, lastTurnKey: null, turns: {}, history: [], byDay: {},
  };
}

function fold(state, event) {
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
  const time = typeof event.time === 'number' ? event.time : Date.now();
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

  state.calls += 1;
  state.inputTokens += input;
  state.outputTokens += output;
  state.cacheReadTokens += cacheRead;
  state.cacheWriteTokens += cacheWrite;
  state.cacheTokens += cacheRead + cacheWrite;
  state.relayCostCredit += relayCostCredit;
  state.relayCostRmb += relayCostRmb;
  state.legacyCostRmb += legacyCostRmb;
  state.totalCostRmb += totalCostRmb;
  state.lastCall = entry;
  state.history.unshift(entry);
  if (state.history.length > 100) state.history.length = 100;

  const turnKey = data.turn;
  if (turnKey !== undefined && turnKey !== null) {
    let t = state.turns[turnKey];
    if (!t) {
      t = { turn: turnKey, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheTokens: 0, relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0, calls: 0, models: {} };
      state.turns[turnKey] = t;
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
    state.lastTurnKey = turnKey;
  }

  // 用量统计:按北京时间按 天/小时/模型 累计花费(人民币)
  const mkey = model || 'unknown';
  const bj = new Date(time + 8 * 3600e3);
  const dateKey = bj.toISOString().slice(0, 10);
  const hourKey = String(bj.getUTCHours()).padStart(2, '0');
  let day = state.byDay[dateKey];
  if (!day) { day = { total: 0, calls: 0, byHour: {}, byModel: {} }; state.byDay[dateKey] = day; }
  day.total += totalCostRmb;
  day.calls += 1;
  let hour = day.byHour[hourKey];
  if (!hour) { hour = {}; day.byHour[hourKey] = hour; }
  hour[mkey] = (hour[mkey] || 0) + totalCostRmb;
  let dm = day.byModel[mkey];
  if (!dm) { dm = { cost: 0, calls: 0 }; day.byModel[mkey] = dm; }
  dm.cost += totalCostRmb;
  dm.calls += 1;
}

export default {
  name: 'dsh-cost-panel',
  inject: ['sessionProjections'],
  apply(ctx) {
    ctx.sessionProjections.register({
      key: 'costSnapshot',
      schema: { parse: (v) => v },
      stateVersion: 2,
      init: initState,
      apply(state, event) {
        fold(state, event);
        return state;
      },
      view(state) {
        const now = Date.now();
        const ltk = state.lastTurnKey;
        const turn = ltk !== null && ltk !== undefined ? state.turns[ltk] || null : null;

        // 用量统计:今日按小时,本月按天;均为人民币
        const bj = new Date(now + 8 * 3600e3);
        const todayKey = bj.toISOString().slice(0, 10);
        const monthPrefix = todayKey.slice(0, 7);
        const td = state.byDay[todayKey];
        const statsToday = td ? {
          total: td.total, calls: td.calls, byHour: td.byHour, byModel: td.byModel,
        } : { total: 0, calls: 0, byHour: {}, byModel: {} };
        const statsMonth = { total: 0, calls: 0, byDay: {}, byModel: {} };
        for (const key of Object.keys(state.byDay)) {
          if (!key.startsWith(monthPrefix)) continue;
          const dom = String(Number(key.slice(8, 10)));
          const day = state.byDay[key];
          statsMonth.total += day.total;
          statsMonth.calls += day.calls;
          let db = statsMonth.byDay[dom];
          if (!db) { db = {}; statsMonth.byDay[dom] = db; }
          for (const hourKey2 of Object.keys(day.byHour)) {
            const hm = day.byHour[hourKey2];
            for (const mk of Object.keys(hm)) db[mk] = (db[mk] || 0) + hm[mk];
          }
          for (const mk of Object.keys(day.byModel)) {
            let mm = statsMonth.byModel[mk];
            if (!mm) { mm = { cost: 0, calls: 0 }; statsMonth.byModel[mk] = mm; }
            mm.cost += day.byModel[mk].cost;
            mm.calls += day.byModel[mk].calls;
          }
        }

        return {
          totals: {
            calls: state.calls, inputTokens: state.inputTokens, outputTokens: state.outputTokens,
            cacheTokens: state.cacheTokens, relayCostCredit: state.relayCostCredit, relayCostRmb: state.relayCostRmb,
            legacyCostRmb: state.legacyCostRmb, totalCostRmb: state.totalCostRmb,
          },
          lastTurn: turn ? {
            turn: turn.turn, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens,
            cacheTokens: turn.cacheTokens, relayCostCredit: turn.relayCostCredit, relayCostRmb: turn.relayCostRmb,
            legacyCostRmb: turn.legacyCostRmb, totalCostRmb: turn.totalCostRmb, calls: turn.calls,
          } : null,
          lastCall: state.lastCall,
          history: state.history,
          scheme: schemeInfo(now),
          statsToday,
          statsMonth,
          statsLabel: { today: todayKey, month: monthPrefix },
          prices: {
            creditToRmb: CREDIT_TO_RMB,
            defaultRelay: DEFAULT_RELAY,
            peakHours: '北京时间 09:00–12:00、14:00–18:00',
            scheme: schemeInfo(now),
            relay: Object.keys(RELAY_RATES).map((model) => ({ model, ...RELAY_RATES[model] })),
            legacy: Object.keys(LEGACY_RATES).map((tier) => ({
              tier,
              label: TIER_LABELS[tier] || tier,
              schemes: Object.keys(LEGACY_RATES[tier]).map((key) => ({
                key,
                label: SCHEME_LABELS[key] || key,
                ...LEGACY_RATES[tier][key],
              })),
            })),
          },
        };
      },
    });
  },
};
