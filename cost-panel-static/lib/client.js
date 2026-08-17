// ============================================================================
// DeepSeek 双轨计费面板 — Client 半边（静态版 bundle）
// ----------------------------------------------------------------------------
// 通过槽位 props 的 useProjection('costSnapshot') 读取 Host 投影:
// 事件折叠后投影自动推送,胶囊/摘要卡片/历史/定价表全部来自投影视图,
// 无 RPC、无轮询、无需 timer。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-cost-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var CSS = `
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
.dsc-statsHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.dsc-statsTitle{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsc-statsPieWrap{display:flex;align-items:center;gap:12px;margin-top:6px}
.dsc-statsLegend{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;font-size:11px}
.dsc-statsRow{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}
.dsc-statsModel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-statsNum{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.dsc-panelTitle{font-size:13px;font-weight:600}
.dsc-btnRow{display:flex;gap:6px;margin-top:8px}
.dsc-btnRow .dsc-btn{margin-top:0}
`;

    var CSS_ID = "dsh-cost-panel/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-cost-panel";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function fmtYuan(v) {
      if (!v) return '¥0';
      if (v >= 1) return '¥' + v.toFixed(2);
      if (v >= 0.01) return '¥' + v.toFixed(3);
      return '¥' + v.toFixed(5);
    }
    function fmtTok(v) {
      if (!v) return '0';
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
      return String(v);
    }
    function fmtRate(v) { return v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3); }
    function fmtTime(ms) {
      var d = new Date(ms);
      function pad(n) { return String(n).padStart(2, '0'); }
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    function schemeLabel(label) {
      return ({ old: '旧价(8/17前)', peak: '高峰价', off: '空闲价' }[label] || label || '');
    }

    // 模型配色:DeepSeek 官方模型用蓝色,Relay/GPT 用其他色系
    var MODEL_COLORS = {
      'deepseek-v4-flash': '#3b82f6',
      'deepseek-v4-pro': '#1d4ed8',
      'gpt-5.6-sol': '#7c3aed',
      'gpt-5.6-terra': '#0891b2',
      'gpt-5.5': '#059669',
      'gpt-5.4-mini': '#d97706',
      'gpt-5.4': '#dc2626',
    };
    var PALETTE = ['#3b82f6', '#22c55e', '#a78bfa', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#8b5cf6'];
    function colorOf(model) {
      if (MODEL_COLORS[model]) return MODEL_COLORS[model];
      var h = 0;
      for (var i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0;
      return PALETTE[h % PALETTE.length];
    }

    function Donut(props) {
      var input = props.input, output = props.output, cache = props.cache, size = props.size;
      var total = input + output + cache;
      var px = size || 56;
      if (total <= 0) return react.createElement('div', { className: 'dsc-pie', style: { width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--dsw-alias-label-secondary)' } }, '—');
      var R = 15.9155;
      var C = 2 * Math.PI * R;
      var arcs = [
        { v: input, color: '#3b82f6' },
        { v: output, color: '#22c55e' },
        { v: cache, color: '#a78bfa' },
      ].filter(function (a) { return a.v > 0; });
      var offset = 0;
      var circles = [];
      for (var i = 0; i < arcs.length; i++) {
        var a = arcs[i];
        var len = (a.v / total) * C;
        circles.push(react.createElement('circle', { key: a.color, cx: 21, cy: 21, r: R, fill: 'transparent', stroke: a.color, strokeWidth: 6, strokeDasharray: len + ' ' + (C - len), strokeDashoffset: -offset }));
        offset += len;
      }
      return react.createElement('svg', { viewBox: '0 0 42 42', className: 'dsc-pie', style: { width: px, height: px } },
        react.createElement('circle', { cx: 21, cy: 21, r: R, fill: 'transparent', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 6 }),
        react.createElement('g', { transform: 'rotate(-90 21 21)' }, circles));
    }

    // 柱状图:mode='hours' 按小时(今日),mode='days' 按天(本月);堆叠,每模型一色,单位人民币
    function BarChart(props) {
      var mode = props.mode;
      var data = props.data || {};
      // 悬停提示状态(hook 必须在任何早退之前调用)
      var hoverState = react.useState(null);
      var hover = hoverState[0], setHover = hoverState[1];
      var W = 460, H = 150, ML = 36, MR = 8, MT = 10, MB = 18;
      var slots = [];
      if (mode === 'hours') {
        for (var h = 0; h < 24; h++) {
          var hk = String(h).padStart(2, '0');
          slots.push({ key: hk, label: h + ':00', buckets: (data.byHour && data.byHour[hk]) || {} });
        }
      } else {
        var now = new Date();
        var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (var d = 1; d <= dim; d++) {
          var dk = String(d);
          slots.push({ key: dk, label: String(d), buckets: (data.byDay && data.byDay[dk]) || {} });
        }
      }
      var max = 0;
      for (var i = 0; i < slots.length; i++) {
        var sum = 0;
        for (var mk in slots[i].buckets) sum += slots[i].buckets[mk];
        if (sum > max) max = sum;
      }
      if (max <= 0) return react.createElement('div', { className: 'dsc-empty' }, mode === 'hours' ? '今日暂无调用' : '本月暂无调用');
      var bw = (W - ML - MR) / slots.length;
      var bars = slots.map(function (s, idx) {
        var x = ML + idx * bw;
        var acc = 0;
        var rects = Object.keys(s.buckets).filter(function (m) { return m; }).map(function (m) {
          var v = s.buckets[m];
          var bh = (v / max) * (H - MT - MB);
          var r = react.createElement('rect', { key: m, x: x + 1, y: H - MB - acc - bh, width: Math.max(bw - 2, 1), height: Math.max(bh, 0), fill: colorOf(m) });
          acc += bh;
          return r;
        });
        var showTick = mode === 'hours' ? (idx % 4 === 0) : (slots.length > 16 ? idx % 2 === 0 : true);
        return react.createElement('g', { key: s.key,
          onMouseEnter: function () { setHover({ key: s.key, label: s.label, buckets: s.buckets, idx: idx }); },
          onMouseLeave: function () { setHover(null); } },
          rects,
          showTick ? react.createElement('text', { x: x + bw / 2, y: H - 4, fontSize: 8, fill: 'var(--dsw-alias-label-tertiary)', textAnchor: 'middle' }, s.label) : null);
      });
      // 悬停提示:显示该柱合计与各模型费用(人民币)
      var tip = null;
      if (hover) {
        var hb = hover.buckets || {};
        var htotal = 0;
        var hmodels = Object.keys(hb).filter(function (m) { return m; }).map(function (m) { htotal += hb[m]; return { m: m, v: hb[m] }; }).sort(function (a, b) { return b.v - a.v; });
        var shownModels = Math.min(hmodels.length, 6);
        var tipH = 22 + shownModels * 14 + 4 + (hmodels.length > 6 ? 12 : 0);
        var barCX = ML + (hover.idx + 0.5) * bw;
        var tipX = Math.max(ML, Math.min(W - 158 - MR, barCX - 79));
        var lines = [];
        lines.push(react.createElement('text', { key: 't', x: tipX + 8, y: MT + 13, fontSize: 10, fontWeight: 600, fill: 'var(--dsw-alias-label-primary)' }, hover.label + ' · 合计 ' + fmtYuan(htotal)));
        for (var mi = 0; mi < shownModels; mi++) {
          var hm = hmodels[mi];
          var yy = MT + 27 + mi * 14;
          lines.push(react.createElement('text', { key: 'n' + mi, x: tipX + 8, y: yy, fontSize: 9, fill: colorOf(hm.m) }, hm.m));
          lines.push(react.createElement('text', { key: 'v' + mi, x: tipX + 146, y: yy, fontSize: 9, fill: 'var(--dsw-alias-label-secondary)', textAnchor: 'end' }, fmtYuan(hm.v)));
        }
        if (hmodels.length > 6) lines.push(react.createElement('text', { key: 'more', x: tipX + 8, y: MT + 27 + shownModels * 14, fontSize: 9, fill: 'var(--dsw-alias-label-tertiary)' }, '等 ' + hmodels.length + ' 个模型'));
        tip = react.createElement('g', null,
          react.createElement('rect', { x: tipX, y: MT, width: 158, height: tipH, rx: 6, fill: 'var(--dsw-alias-bg-overlay)', stroke: 'var(--dsw-alias-border-l1)', opacity: 0.96 }),
          lines);
      }
      return react.createElement('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: { display: 'block', marginTop: 4 } },
        react.createElement('line', { x1: ML, y1: H - MB, x2: W - MR, y2: H - MB, stroke: 'var(--dsw-alias-border-l1)' }),
        react.createElement('text', { x: W - MR, y: MT + 6, fontSize: 9, fill: 'var(--dsw-alias-label-tertiary)', textAnchor: 'end' }, '¥' + fmtRate(max)),
        bars,
        tip);
    }

    // 饼图:各模型花费占比(人民币)
    function ModelPie(props) {
      var byModel = props.byModel || {};
      var total = props.total || 0;
      var keys = Object.keys(byModel).filter(function (m) { return m && byModel[m].cost > 0; });
      if (keys.length === 0 || total <= 0) return react.createElement('div', { className: 'dsc-empty' }, '暂无数据');
      var R = 15.9155;
      var C = 2 * Math.PI * R;
      var offset = 0;
      var segs = keys.map(function (m) {
        var len = (byModel[m].cost / total) * C;
        var seg = react.createElement('circle', { key: m, cx: 21, cy: 21, r: R, fill: 'transparent', stroke: colorOf(m), strokeWidth: 6, strokeDasharray: len + ' ' + (C - len), strokeDashoffset: -offset });
        offset += len;
        return seg;
      });
      var legend = keys.map(function (m) {
        var pct = (byModel[m].cost / total) * 100;
        return react.createElement('div', { key: m, className: 'dsc-statsRow' },
          react.createElement('span', { className: 'dsc-dot', style: { background: colorOf(m) } }),
          react.createElement('span', { className: 'dsc-statsModel' }, m),
          react.createElement('span', { className: 'dsc-statsNum' }, fmtYuan(byModel[m].cost) + ' · ' + pct.toFixed(1) + '%'));
      });
      return react.createElement('div', { className: 'dsc-statsPieWrap' },
        react.createElement('svg', { viewBox: '0 0 42 42', style: { width: 116, height: 116, flex: 'none' } },
          react.createElement('circle', { cx: 21, cy: 21, r: R, fill: 'transparent', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 6 }),
          react.createElement('g', { transform: 'rotate(-90 21 21)' }, segs)),
        react.createElement('div', { className: 'dsc-statsLegend' }, legend));
    }

    function CostChip(props) {
      var proj = props.useProjection('costSnapshot');
      var t = (proj && proj.totals) || { calls: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, relayCostCredit: 0, relayCostRmb: 0, legacyCostRmb: 0, totalCostRmb: 0 };
      var turn = (proj && proj.lastTurn) || null;
      var scheme = proj && proj.scheme;
      var last = proj && proj.lastCall;
      var prices = proj && proj.prices;
      // 分叉会话:从分叉点(seedLength)起算,显示金额 = 总费用 - 分叉前费用
      var fi = (proj && proj.global && proj.global.forks && proj.global.forks[props.sessionId]) || null;
      var forked = !!(fi && fi.forked);
      var seedLength = fi ? fi.seedLength : null;
      var preFork = fi ? {
        cost: fi.preForkCost || 0, calls: fi.preForkCalls || 0,
        inputTokens: fi.preForkInput || 0, outputTokens: fi.preForkOutput || 0, cacheTokens: fi.preForkCache || 0,
        relayCostRmb: fi.preForkRelay || 0, legacyCostRmb: fi.preForkLegacy || 0,
      } : null;
      var shown = preFork ? {
        calls: t.calls - preFork.calls,
        inputTokens: t.inputTokens - preFork.inputTokens,
        outputTokens: t.outputTokens - preFork.outputTokens,
        cacheTokens: t.cacheTokens - preFork.cacheTokens,
        relayCostRmb: t.relayCostRmb - preFork.relayCostRmb,
        legacyCostRmb: t.legacyCostRmb - preFork.legacyCostRmb,
        totalCostRmb: t.totalCostRmb - preFork.cost,
      } : t;
      var history = ((proj && proj.history) || []).filter(function (c) {
        return !forked || seedLength === null || c.seq > seedLength;
      });

      var openState = react.useState(false);
      var open = openState[0], setOpen = openState[1];
      var historyState = react.useState(false);
      var showHistory = historyState[0], setShowHistory = historyState[1];
      var statsState = react.useState(false);
      var showStats = statsState[0], setShowStats = statsState[1];
      var tabState = react.useState('calls');
      var tab = tabState[0], setTab = tabState[1];
      var periodState = react.useState('today');
      var period = periodState[0], setPeriod = periodState[1];
      var bubblesState = react.useState([]);
      var bubbles = bubblesState[0], setBubbles = bubblesState[1];
      var lastSeq = react.useRef(0);
      // 卡片延迟关闭:鼠标移出 0.5s 后才关闭;期间移回则取消。
      var closeTimer = react.useRef(null);

      var scheduleClose = function () {
        if (showHistory) return;
        if (closeTimer.current !== null) return;
        closeTimer.current = setTimeout(function () {
          closeTimer.current = null;
          setOpen(false);
        }, 500);
      };
      var cancelClose = function () {
        if (closeTimer.current !== null) {
          clearTimeout(closeTimer.current);
          closeTimer.current = null;
        }
      };

      // 新调用浮动气泡:投影视图变化时按 seq 去重
      react.useEffect(function () {
        var lc = proj && proj.lastCall;
        if (lc && lc.seq > lastSeq.current) {
          lastSeq.current = lc.seq;
          var id = Date.now() + Math.random();
          setBubbles(function (b) { return b.concat([{ id: id, cost: lc.totalCostRmb }]).slice(-4); });
          var t1 = setTimeout(function () {
            setBubbles(function (b) { return b.map(function (x) { return x.id === id ? Object.assign({}, x, { leave: true }) : x; }); });
          }, 3600);
          var t2 = setTimeout(function () {
            setBubbles(function (b) { return b.filter(function (x) { return x.id !== id; }); });
          }, 4050);
          return function () { clearTimeout(t1); clearTimeout(t2); };
        }
      }, [proj]);

      // 卸载时清理挂起的关闭计时器
      react.useEffect(function () {
        return function () { cancelClose(); };
      }, []);

      var badgeText = last
        ? (last.billing === 'relay' ? 'Relay 折算' : schemeLabel(last.scheme))
        : (scheme ? schemeLabel(scheme.label) : '');
      var buckets = {
        input: turn ? turn.inputTokens : 0,
        output: turn ? turn.outputTokens : 0,
        cache: turn ? turn.cacheTokens : 0,
      };
      var legend = [
        { label: '输入(未命中)', color: '#3b82f6', v: buckets.input },
        { label: '输出', color: '#22c55e', v: buckets.output },
        { label: '缓存', color: '#a78bfa', v: buckets.cache },
      ];
      // 所有价格统一人民币显示:Relay 额度按 1$ = ¥0.4 折算。
      var creditLine = shown.relayCostRmb > 0 ? 'Relay 折算 ' + fmtYuan(shown.relayCostRmb) : '';

      var renderPrices = function () {
        if (!prices) return react.createElement('div', { className: 'dsc-empty' }, '定价表加载失败');
        var rmb = function (v) { return fmtRate(v * (prices.creditToRmb || 0.4)); };
        var relayRows = (prices.relay || []).map(function (r) {
          return react.createElement('tr', { key: r.model },
            react.createElement('td', { className: 'model' }, r.model),
            react.createElement('td', null, '¥' + rmb(r.input)),
            react.createElement('td', null, '¥' + rmb(r.output)),
            react.createElement('td', null, '¥' + rmb(r.cacheRead)),
            react.createElement('td', null, '¥' + rmb(r.cacheWrite)));
        });
        var legacySecs = (prices.legacy || []).map(function (sec) {
          return react.createElement('div', { key: sec.tier, className: 'dsc-priceSec' },
            react.createElement('div', { className: 'dsc-priceSecTitle' }, sec.label || sec.tier),
            react.createElement('table', { className: 'dsc-priceTable' },
              react.createElement('thead', null, react.createElement('tr', null,
                react.createElement('th', null, '方案'),
                react.createElement('th', null, '缓存命中 ¥/M'),
                react.createElement('th', null, '输入未命中 ¥/M'),
                react.createElement('th', null, '输出 ¥/M'))),
              react.createElement('tbody', null, (sec.schemes || []).map(function (s) {
                return react.createElement('tr', { key: s.key },
                  react.createElement('td', null, s.label),
                  react.createElement('td', null, '¥' + fmtRate(s.hit)),
                  react.createElement('td', null, '¥' + fmtRate(s.miss)),
                  react.createElement('td', null, '¥' + fmtRate(s.out)));
              }))));
        });
        var schemeTag = prices.scheme ? schemeLabel(prices.scheme.label) : '';
        return react.createElement('div', null,
          react.createElement('div', { className: 'dsc-priceNote' }, 'Relay/GPT 模型按美元额度计费,已按 1$ = ¥' + (prices.creditToRmb || 0.4) + ' 折算为人民币;DeepSeek 官方模型直接人民币计费。当前计价方案:' + (schemeTag || '—') + ' (' + (prices.peakHours || '') + ')'),
          react.createElement('div', { className: 'dsc-priceSecTitle' }, 'Relay / GPT 模型（¥/1M tokens）'),
          react.createElement('table', { className: 'dsc-priceTable' },
            react.createElement('thead', null, react.createElement('tr', null,
              react.createElement('th', null, '模型'),
              react.createElement('th', null, '输入'),
              react.createElement('th', null, '输出'),
              react.createElement('th', null, '缓存读'),
              react.createElement('th', null, '缓存写'))),
            react.createElement('tbody', null, relayRows)),
          legacySecs);
      };

      var renderGlobalStats = function () {
        if (!proj || !proj.global) return react.createElement('div', { className: 'dsc-empty' }, '统计加载中…(需重启 dsh web 后生效)');
        var g = proj.global;
        var bal = g.balance;
        var label = g.label || { today: '', month: '' };
        var data = period === 'today'
          ? (g.statsToday || { total: 0, calls: 0, byHour: {}, byModel: {} })
          : (g.statsMonth || { total: 0, calls: 0, byDay: {}, byModel: {} });
        var title = period === 'today' ? '今日 (' + label.today + ')' : '本月 (' + label.month + ')';
        var balanceText = bal && bal.total !== null && bal.total !== undefined
          ? fmtYuan(bal.total) + (bal.currency && bal.currency !== 'CNY' ? ' ' + bal.currency : '') + (bal.is_available === false ? ' (账户不可用)' : '')
          : '—';
        return react.createElement('div', null,
          react.createElement('div', { className: 'dsc-priceNote' }, 'DeepSeek API 余额: ' + balanceText + (bal && bal.ts ? ' · 更新于 ' + fmtTime(bal.ts) : '') + (bal && bal.error ? ' (获取失败)' : '')),
          react.createElement('div', { className: 'dsc-priceNote' }, '全部会话/工作区累计: ' + fmtYuan(g.totals.totalCostRmb) + ' · ' + g.totals.calls + ' 次调用(Relay 折算 ' + fmtYuan(g.totals.relayCostRmb) + ' + 官方 ' + fmtYuan(g.totals.legacyCostRmb) + ')'),
          react.createElement('div', { className: 'dsc-statsHead' },
            react.createElement('div', { className: 'dsc-tabs' },
              react.createElement('button', { className: 'dsc-tab' + (period === 'today' ? ' active' : ''), onClick: function () { setPeriod('today'); } }, '今日'),
              react.createElement('button', { className: 'dsc-tab' + (period === 'month' ? ' active' : ''), onClick: function () { setPeriod('month'); } }, '本月')),
            react.createElement('span', { className: 'dsc-statsTitle' }, title + ' · 总花费 ' + fmtYuan(data.total) + ' · ' + data.calls + ' 次调用')),
          react.createElement('div', { className: 'dsc-priceSecTitle' }, period === 'today' ? '按小时花费(堆叠按模型,人民币)' : '按天花费(堆叠按模型,人民币)'),
          react.createElement(BarChart, { mode: period === 'today' ? 'hours' : 'days', data: data }),
          react.createElement('div', { className: 'dsc-priceSecTitle' }, '各模型花费占比(人民币)'),
          react.createElement(ModelPie, { byModel: data.byModel, total: data.total }));
      };

      return react.createElement('div', { className: 'dsc-wrap', onMouseEnter: function () { cancelClose(); setOpen(true); }, onMouseLeave: scheduleClose },
        react.createElement('div', { className: 'dsc-chip', title: 'DeepSeek 计费 · 悬停查看详情' },
          react.createElement('span', null, fmtYuan(shown.totalCostRmb))),
        bubbles.length > 0 && react.createElement('div', { className: 'dsc-bubbles' },
          bubbles.map(function (b) { return react.createElement('div', { key: b.id, className: 'dsc-bubble' + (b.leave ? ' leave' : '') }, fmtYuan(b.cost)); })),
        open && react.createElement('div', { className: 'dsc-card' },
          react.createElement('div', { className: 'dsc-head' },
            react.createElement('div', { className: 'dsc-titleGroup' },
              react.createElement('span', null, '本对话费用'),
              react.createElement('span', { className: 'dsc-fork ' + (forked ? 'forked' : 'original') }, forked ? '分叉会话' : '原会话')),
            react.createElement('span', { className: 'dsc-badge' + (last && last.billing === 'relay' ? ' relay' : '') }, badgeText)),
          react.createElement('div', { className: 'dsc-total' }, fmtYuan(shown.totalCostRmb)),
          react.createElement('div', { className: 'dsc-sub' }, '输入 ' + fmtTok(shown.inputTokens) + ' · 输出 ' + fmtTok(shown.outputTokens) + ' · 缓存 ' + fmtTok(shown.cacheTokens) + (creditLine ? ' · ' + creditLine : '')),
          react.createElement('div', { className: 'dsc-body' },
            react.createElement(Donut, { input: buckets.input, output: buckets.output, cache: buckets.cache }),
            react.createElement('div', { className: 'dsc-legend' },
              legend.map(function (row) {
                return react.createElement('div', { key: row.label, className: 'dsc-row' },
                  react.createElement('span', { className: 'dsc-dot', style: { background: row.color } }),
                  react.createElement('span', null, row.label),
                  react.createElement('span', { className: 'dsc-num' }, fmtTok(row.v)));
              }))),
          react.createElement('div', { className: 'dsc-last' }, turn ? '本轮费用 ' + fmtYuan(turn.totalCostRmb) + ' · ' + turn.calls + ' 次调用' : '暂无调用记录'),
          react.createElement('div', { className: 'dsc-btnRow' },
            react.createElement('button', { className: 'dsc-btn', onClick: function () { setShowHistory(true); } }, '查看历史调用'),
            react.createElement('button', { className: 'dsc-btn', onClick: function () { setShowStats(true); } }, '总量统计'))),
        showHistory && react.createElement('div', { className: 'dsc-modal', onClick: function () { setShowHistory(false); } },
          react.createElement('div', { className: 'dsc-panel', onClick: function (e) { e.stopPropagation(); } },
            react.createElement('div', { className: 'dsc-panelHead' },
              react.createElement('div', { className: 'dsc-tabs' },
                react.createElement('button', { className: 'dsc-tab' + (tab === 'calls' ? ' active' : ''), onClick: function () { setTab('calls'); } }, '历史调用' + (tab === 'calls' ? ' (' + history.length + ')' : '')),
                react.createElement('button', { className: 'dsc-tab' + (tab === 'prices' ? ' active' : ''), onClick: function () { setTab('prices'); } }, '定价表')),
              react.createElement('button', { className: 'dsc-close', onClick: function () { setShowHistory(false); } }, '✕')),
            tab === 'calls'
              ? (history.length === 0
                ? react.createElement('div', { className: 'dsc-empty' }, '暂无调用记录')
                : history.map(function (c) {
                  // 单价与费用统一为人民币:relay 单价 × creditToRmb(1$ = ¥0.4) 折算。
                  var rmb = c.billing === 'relay' ? (c.unit.creditToRmb || 0.4) : 1;
                  var rate = function (v) { return fmtRate(v * rmb); };
                  var parts = [];
                  if (c.inputTokens > 0) parts.push('未命中 ' + fmtTok(c.inputTokens) + ' × ¥' + rate(c.unit.input) + '/M');
                  if (c.cacheTokens > 0) parts.push('缓存 ' + fmtTok(c.cacheTokens) + ' × ¥' + rate(c.unit.cacheRead) + '/M');
                  if (c.outputTokens > 0) parts.push('输出 ' + fmtTok(c.outputTokens) + ' × ¥' + rate(c.unit.output) + '/M');
                  return react.createElement('div', { key: c.seq, className: 'dsc-call' },
                    react.createElement('div', { className: 'dsc-callHead' },
                      react.createElement('span', { className: 'dsc-callTime' }, fmtTime(c.time)),
                      react.createElement('span', { className: 'dsc-callModel' }, c.model || 'unknown')),
                    react.createElement('div', { className: 'dsc-callBody' },
                      react.createElement(Donut, { input: c.inputTokens, output: c.outputTokens, cache: c.cacheTokens, size: 40 }),
                      react.createElement('div', { className: 'dsc-callDetail' },
                        react.createElement('div', null, '费用 = ' + parts.join(' + ')),
                        react.createElement('div', { className: 'dsc-callCost' }, '= ' + fmtYuan(c.totalCostRmb)))),
                    react.createElement('div', { className: 'dsc-callRate' }, '缓存命中率 ' + (c.cacheHitRate !== null && c.cacheHitRate !== undefined ? c.cacheHitRate.toFixed(1) + '%' : '—')));
                }))
              : renderPrices(),
          ),
        ),
        showStats && react.createElement('div', { className: 'dsc-modal', onClick: function () { setShowStats(false); } },
          react.createElement('div', { className: 'dsc-panel', onClick: function (e) { e.stopPropagation(); } },
            react.createElement('div', { className: 'dsc-panelHead' },
              react.createElement('span', { className: 'dsc-panelTitle' }, '总量统计 · 所有会话/工作区'),
              react.createElement('button', { className: 'dsc-close', onClick: function () { setShowStats(false); } }, '✕')),
            renderGlobalStats())),
      );
    }

    var inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("conversation.session.header.actions", function () {
        return ctx.slots.register(
          { name: "conversation.session.header.actions", id: "dshcost", order: 30 },
          function (props) {
            return react.createElement(CostChip, { sessionId: props.sessionId, useProjection: props.useProjection });
          });
      });
    }
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
