// ============================================================================
// DeepSeek 双轨计费面板 — Client 半边
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.client 传入(函数体,返回 Cordis Plugin)。
//
// 职责:
//  1. 在 conversation.session.header.actions 槽位注册费用胶囊(顶部小胶囊);
//  2. 每 1.5s 轮询 host.call('cost:snapshot') 刷新总费用,新调用时弹出
//     +¥xx 浮动气泡;
//  3. 悬停 → 摘要卡片(总额、token 三桶环形图、本轮费用、会话类型徽章、
//     计价方案徽章);
//  4. 点击「查看历史调用」→ host.call('cost:history') 渲染明细弹层。
//
// 只依赖两个 Host RPC:cost:snapshot / cost:history。
// 注意:组件函数定义在 apply 内部以闭包捕获 ctx(模块顶层没有 ctx)。
// ============================================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    styles.insert(`
.dsc-wrap{position:relative;display:inline-flex;align-items:center;height:28px}
.dsc-chip{box-sizing:border-box;display:inline-flex;align-items:center;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:default;transition:border-color .12s,background .12s}
.dsc-chip:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.dsc-bubbles{position:absolute;left:calc(100% + 6px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:flex-start;gap:3px;pointer-events:none;z-index:1100}
.dsc-bubble{box-sizing:border-box;background:rgba(59,130,246,.78);background:color-mix(in srgb,#3b82f6 78%,transparent);-webkit-backdrop-filter:blur(10px) saturate(1.4);backdrop-filter:blur(10px) saturate(1.4);border:1px solid rgba(255,255,255,.30);border-radius:999px;padding:0 7px;font-size:10px;font-weight:600;line-height:16px;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25);box-shadow:0 2px 6px rgba(37,99,235,.25);animation:dscBubbleIn .18s ease-out}
.dsc-bubble.leave{opacity:0;transition:opacity .4s}
@keyframes dscBubbleIn{from{opacity:0;transform:translateX(6px)}to{opacity:1;transform:translateX(0)}}
.dsc-card{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:1200;box-sizing:border-box;width:288px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.22);padding:10px 12px;color:var(--dsw-alias-label-primary);font-family:Inter,var(--dsw-font-family)}
.dsc-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:6px}
.dsc-titleGroup{display:flex;align-items:center;gap:6px;min-width:0}
.dsc-fork{font-size:9px;line-height:1;padding:2px 6px;border-radius:6px;font-weight:600;white-space:nowrap}
.dsc-fork.forked{background:rgba(250,204,21,.25);color:#b45309;border:1px solid rgba(250,204,21,.5)}
.dsc-fork.original{background:rgba(34,197,94,.20);color:#15803d;border:1px solid rgba(34,197,94,.45)}
.dsc-total{font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.2}
.dsc-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.dsc-badge{font-size:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 7px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsc-badge.relay{color:#2563eb;border-color:rgba(37,99,235,.45);background:rgba(37,99,235,.10)}
.dsc-body{display:flex;gap:10px;align-items:center;margin-top:8px}
.dsc-pie{flex:none}
.dsc-legend{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;font-size:11px}
.dsc-row{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}
.dsc-dot{width:8px;height:8px;border-radius:2px;flex:none}
.dsc-num{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.dsc-last{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:8px;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsc-btn{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:5px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer;text-align:center;transition:background .12s,border-color .12s}
.dsc-btn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.dsc-modal{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);pointer-events:auto}
.dsc-panel{box-sizing:border-box;width:min(520px,calc(100vw - 40px));max-height:min(72vh,640px);overflow-y:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.3);padding:14px 16px;color:var(--dsw-alias-label-primary);font-family:Inter,var(--dsw-font-family)}
.dsc-panelHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.dsc-panelTitle{font-size:13px;font-weight:600}
.dsc-close{width:24px;height:24px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1}
.dsc-close:hover{background:var(--dsw-alias-bg-layer-1)}
.dsc-empty{font-size:11px;color:var(--dsw-alias-label-secondary);padding:12px 0;text-align:center}
.dsc-call{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;margin-bottom:8px}
.dsc-callHead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsc-callTime{font-variant-numeric:tabular-nums;white-space:nowrap}
.dsc-callModel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-callBody{display:flex;gap:10px;align-items:center;margin-top:8px}
.dsc-callDetail{flex:1;min-width:0;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsc-callCost{color:var(--dsw-alias-label-primary);font-weight:600}
.dsc-callRate{font-size:10px;color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));margin-top:4px}
.dsc-tabs{display:flex;align-items:center;gap:4px;min-width:0}
.dsc-tab{box-sizing:border-box;height:24px;padding:0 10px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer;line-height:22px;white-space:nowrap}
.dsc-tab:hover{background:var(--dsw-alias-bg-layer-1)}
.dsc-tab.active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.dsc-priceNote{font-size:10px;color:var(--dsw-alias-label-tertiary);margin-top:8px;line-height:16px}
.dsc-priceSecTitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:12px 0 4px}
.dsc-priceTable{width:100%;border-collapse:collapse;font-size:10px;font-variant-numeric:tabular-nums}
.dsc-priceTable th,.dsc-priceTable td{text-align:right;padding:3px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.dsc-priceTable th:first-child,.dsc-priceTable td:first-child{text-align:left}
.dsc-priceTable th{color:var(--dsw-alias-label-caption);font-weight:500}
.dsc-priceTable td{color:var(--dsw-alias-label-secondary)}
.dsc-priceTable td.model{color:var(--dsw-alias-label-primary);font-family:var(--dsh-font-mono,monospace)}
`);

    const fmtYuan = (v) => {
      if (!v) return '¥0';
      if (v >= 1) return '¥' + v.toFixed(2);
      if (v >= 0.01) return '¥' + v.toFixed(3);
      return '¥' + v.toFixed(5);
    };
    const fmtTok = (v) => {
      if (!v) return '0';
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
      return String(v);
    };
    const fmtRate = (v) => (v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));
    const fmtTime = (ms) => {
      const d = new Date(ms);
      const pad = (n) => String(n).padStart(2, '0');
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    };
    const schemeLabel = (label) => ({ old: '旧价(8/17前)', peak: '高峰价', off: '空闲价' }[label] || label || '');

    function Donut({ input, output, cache, size }) {
      const total = input + output + cache;
      const px = size || 56;
      if (total <= 0) return React.createElement('div', { className: 'dsc-pie', style: { width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--dsw-alias-label-secondary)' } }, '—');
      const R = 15.9155;
      const C = 2 * Math.PI * R;
      const arcs = [
        { v: input, color: '#3b82f6' },
        { v: output, color: '#22c55e' },
        { v: cache, color: '#a78bfa' },
      ].filter((a) => a.v > 0);
      let offset = 0;
      const circles = [];
      for (const a of arcs) {
        const len = (a.v / total) * C;
        circles.push(React.createElement('circle', { key: a.color, cx: 21, cy: 21, r: R, fill: 'transparent', stroke: a.color, strokeWidth: 6, strokeDasharray: len + ' ' + (C - len), strokeDashoffset: -offset }));
        offset += len;
      }
      return React.createElement('svg', { viewBox: '0 0 42 42', className: 'dsc-pie', style: { width: px, height: px } },
        React.createElement('circle', { cx: 21, cy: 21, r: R, fill: 'transparent', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 6 }),
        React.createElement('g', { transform: 'rotate(-90 21 21)' }, circles));
    }

    function CostChip({ sessionId }) {
      const [snap, setSnap] = React.useState(null);
      const [bubbles, setBubbles] = React.useState([]);
      const [open, setOpen] = React.useState(false);
      const [showHistory, setShowHistory] = React.useState(false);
      const [history, setHistory] = React.useState([]);
      const [tab, setTab] = React.useState('calls');
      const [prices, setPrices] = React.useState(null);
      const seenSeq = React.useRef(0);
      // 卡片延迟关闭:鼠标移出 0.5s 后才关闭;期间移回则取消。
      const closeTimer = React.useRef(null);
      const scheduleClose = () => {
        if (showHistory) return;
        if (closeTimer.current !== null) return;
        closeTimer.current = ctx.timeout(() => {
          closeTimer.current = null;
          setOpen(false);
        }, 500);
      };
      const cancelClose = () => {
        if (closeTimer.current !== null) {
          closeTimer.current();
          closeTimer.current = null;
        }
      };

      React.useEffect(() => {
        let alive = true;
        const tick = async () => {
          let res;
          try {
            res = await host.call('cost:snapshot', { sessionId });
          } catch (e) {
            return;
          }
          if (!alive) return;
          setSnap(res);
          const lc = res && res.lastCall;
          if (lc && lc.seq > seenSeq.current) {
            seenSeq.current = lc.seq;
            const id = Date.now() + Math.random();
            setBubbles((b) => [...b, { id, cost: lc.totalCostRmb }].slice(-4));
            ctx.timeout(() => {
              setBubbles((b) => b.map((x) => (x.id === id ? { ...x, leave: true } : x)));
              ctx.timeout(() => setBubbles((b) => b.filter((x) => x.id !== id)), 450);
            }, 3600);
          }
        };
        tick();
        const dispose = ctx.interval(tick, 1500);
        return () => {
          alive = false;
          dispose();
          cancelClose();
        };
      }, [sessionId]);

      const openHistory = async () => {
        setShowHistory(true);
        try {
          const res = await host.call('cost:history', { sessionId });
          setHistory(res && Array.isArray(res.calls) ? res.calls : []);
        } catch (e) {
          setHistory([]);
        }
        try {
          const res = await host.call('cost:prices');
          setPrices(res);
        } catch (e) {
          setPrices(null);
        }
      };

      const renderPrices = () => {
        if (!prices) return React.createElement('div', { className: 'dsc-empty' }, '定价表加载失败');
        const rmb = (v) => fmtRate(v * (prices.creditToRmb || 0.4));
        const relayRows = (prices.relay || []).map((r) => React.createElement('tr', { key: r.model },
          React.createElement('td', { className: 'model' }, r.model),
          React.createElement('td', null, '¥' + rmb(r.input)),
          React.createElement('td', null, '¥' + rmb(r.output)),
          React.createElement('td', null, '¥' + rmb(r.cacheRead)),
          React.createElement('td', null, '¥' + rmb(r.cacheWrite)),
        ));
        const legacySecs = (prices.legacy || []).map((sec) => React.createElement('div', { key: sec.tier, className: 'dsc-priceSec' },
          React.createElement('div', { className: 'dsc-priceSecTitle' }, sec.label || sec.tier),
          React.createElement('table', { className: 'dsc-priceTable' },
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, '方案'),
              React.createElement('th', null, '缓存命中 ¥/M'),
              React.createElement('th', null, '输入未命中 ¥/M'),
              React.createElement('th', null, '输出 ¥/M'),
            )),
            React.createElement('tbody', null, (sec.schemes || []).map((s) => React.createElement('tr', { key: s.key },
              React.createElement('td', null, s.label),
              React.createElement('td', null, '¥' + fmtRate(s.hit)),
              React.createElement('td', null, '¥' + fmtRate(s.miss)),
              React.createElement('td', null, '¥' + fmtRate(s.out)),
            ))),
          ),
        ));
        const schemeTag = prices.scheme ? schemeLabel(prices.scheme.label) : '';
        return React.createElement('div', null,
          React.createElement('div', { className: 'dsc-priceNote' }, 'Relay/GPT 模型按美元额度计费,已按 1$ = ¥' + (prices.creditToRmb || 0.4) + ' 折算为人民币;DeepSeek 官方模型直接人民币计费。当前计价方案:' + (schemeTag || '—') + ' (' + (prices.peakHours || '') + ')'),
          React.createElement('div', { className: 'dsc-priceSecTitle' }, 'Relay / GPT 模型（¥/1M tokens）'),
          React.createElement('table', { className: 'dsc-priceTable' },
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, '模型'),
              React.createElement('th', null, '输入'),
              React.createElement('th', null, '输出'),
              React.createElement('th', null, '缓存读'),
              React.createElement('th', null, '缓存写'),
            )),
            React.createElement('tbody', null, relayRows),
          ),
          legacySecs,
        );
      };

      const t = (snap && snap.totals) || { calls: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0 };
      const turn = (snap && snap.lastTurn) || null;
      const scheme = snap && snap.scheme;
      const forked = !!(snap && snap.forked);
      const last = snap && snap.lastCall;
      const badgeText = last
        ? (last.billing === 'relay' ? 'Relay 折算' : schemeLabel(last.scheme))
        : (scheme ? schemeLabel(scheme.label) : '');
      const buckets = {
        input: turn ? turn.inputTokens : 0,
        output: turn ? turn.outputTokens : 0,
        cache: turn ? turn.cacheTokens : 0,
      };
      const legend = [
        { label: '输入(未命中)', color: '#3b82f6', v: buckets.input },
        { label: '输出', color: '#22c55e', v: buckets.output },
        { label: '缓存', color: '#a78bfa', v: buckets.cache },
      ];
      // 所有价格统一人民币显示:Relay 额度按 1$ = ¥0.4 折算。
      const creditLine = t.relayCostRmb > 0 ? 'Relay 折算 ' + fmtYuan(t.relayCostRmb) : '';

      return React.createElement('div', { className: 'dsc-wrap', onMouseEnter: () => { cancelClose(); setOpen(true); }, onMouseLeave: scheduleClose },
        React.createElement('div', { className: 'dsc-chip', title: 'DeepSeek 计费 · 悬停查看详情' },
          React.createElement('span', null, fmtYuan(t.totalCostRmb)),
        ),
        bubbles.length > 0 && React.createElement('div', { className: 'dsc-bubbles' },
          bubbles.map((b) => React.createElement('div', { key: b.id, className: 'dsc-bubble' + (b.leave ? ' leave' : '') }, fmtYuan(b.cost))),
        ),
        open && React.createElement('div', { className: 'dsc-card' },
          React.createElement('div', { className: 'dsc-head' },
            React.createElement('div', { className: 'dsc-titleGroup' },
              React.createElement('span', null, '本对话费用'),
              React.createElement('span', { className: 'dsc-fork ' + (forked ? 'forked' : 'original') }, forked ? '分叉会话' : '原会话'),
            ),
            React.createElement('span', { className: 'dsc-badge' + (last && last.billing === 'relay' ? ' relay' : '') }, badgeText),
          ),
          React.createElement('div', { className: 'dsc-total' }, fmtYuan(t.totalCostRmb)),
          React.createElement('div', { className: 'dsc-sub' }, '输入 ' + fmtTok(t.inputTokens) + ' · 输出 ' + fmtTok(t.outputTokens) + ' · 缓存 ' + fmtTok(t.cacheTokens) + (creditLine ? ' · ' + creditLine : '')),
          React.createElement('div', { className: 'dsc-body' },
            React.createElement(Donut, { input: buckets.input, output: buckets.output, cache: buckets.cache }),
            React.createElement('div', { className: 'dsc-legend' },
              legend.map((row) => React.createElement('div', { key: row.label, className: 'dsc-row' },
                React.createElement('span', { className: 'dsc-dot', style: { background: row.color } }),
                React.createElement('span', null, row.label),
                React.createElement('span', { className: 'dsc-num' }, fmtTok(row.v)),
              )),
            ),
          ),
          React.createElement('div', { className: 'dsc-last' }, turn ? '本轮费用 ' + fmtYuan(turn.totalCostRmb) + ' · ' + turn.calls + ' 次调用' : '暂无调用记录'),
          React.createElement('button', { className: 'dsc-btn', onClick: openHistory }, '查看历史调用'),
        ),
        showHistory && React.createElement('div', { className: 'dsc-modal', onClick: () => setShowHistory(false) },
          React.createElement('div', { className: 'dsc-panel', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsc-panelHead' },
              React.createElement('div', { className: 'dsc-tabs' },
                React.createElement('button', { className: 'dsc-tab' + (tab === 'calls' ? ' active' : ''), onClick: () => setTab('calls') }, '历史调用' + (tab === 'calls' ? ' (' + history.length + ')' : '')),
                React.createElement('button', { className: 'dsc-tab' + (tab === 'prices' ? ' active' : ''), onClick: () => setTab('prices') }, '定价表'),
              ),
              React.createElement('button', { className: 'dsc-close', onClick: () => setShowHistory(false) }, '✕'),
            ),
            tab === 'calls'
              ? (history.length === 0
                ? React.createElement('div', { className: 'dsc-empty' }, '暂无历史调用(插件安装前的调用不计入明细,但已计入总账)')
                : history.map((c) => {
                // 单价与费用统一为人民币:relay 单价 × creditToRmb(1$ = ¥0.4) 折算。
                const rmb = c.billing === 'relay' ? (c.unit.creditToRmb || 0.4) : 1;
                const rate = (v) => fmtRate(v * rmb);
                const parts = [];
                if (c.inputTokens > 0) parts.push('未命中 ' + fmtTok(c.inputTokens) + ' × ¥' + rate(c.unit.input) + '/M');
                if (c.cacheTokens > 0) parts.push('缓存 ' + fmtTok(c.cacheTokens) + ' × ¥' + rate(c.unit.cacheRead) + '/M');
                if (c.outputTokens > 0) parts.push('输出 ' + fmtTok(c.outputTokens) + ' × ¥' + rate(c.unit.output) + '/M');
                const costLine = fmtYuan(c.totalCostRmb);
                return React.createElement('div', { key: c.seq, className: 'dsc-call' },
                  React.createElement('div', { className: 'dsc-callHead' },
                    React.createElement('span', { className: 'dsc-callTime' }, fmtTime(c.time)),
                    React.createElement('span', { className: 'dsc-callModel' }, c.model || 'unknown'),
                  ),
                  React.createElement('div', { className: 'dsc-callBody' },
                    React.createElement(Donut, { input: c.inputTokens, output: c.outputTokens, cache: c.cacheTokens, size: 40 }),
                    React.createElement('div', { className: 'dsc-callDetail' },
                      React.createElement('div', null, '费用 = ' + parts.join(' + ')),
                      React.createElement('div', { className: 'dsc-callCost' }, '= ' + costLine),
                    ),
                  ),
                  React.createElement('div', { className: 'dsc-callRate' }, '缓存命中率 ' + (c.cacheHitRate !== null && c.cacheHitRate !== undefined ? c.cacheHitRate.toFixed(1) + '%' : '—')),
                );
              }))
              : renderPrices(),
          ),
        ),
      );
    }

    slots.inject('conversation.session.header.actions', () => slots.register(
      { name: 'conversation.session.header.actions', id: 'dshcost', order: 30 },
      (props) => React.createElement(CostChip, { sessionId: props.sessionId }),
    ));
  },
};
