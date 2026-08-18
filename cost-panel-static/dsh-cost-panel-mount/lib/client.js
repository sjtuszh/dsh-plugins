// ============================================================================
// 双轨计费面板 — Typert remote 挂载 bundle(静态版,双条目方案 A)
// ----------------------------------------------------------------------------
// 只做一件事:ctx.remote.$mount(TYPERT_REMOTE),把 remote.costglobal 服务挂到
// 客户端,供 dsh-cost-panel 的 UI bundle 消费(inject ["remote","remote.costglobal"])。
// 拆成独立包的根因(MEMORY §4.3):若 UI 包自己 $mount 又 inject 自己的 remote,
// 会"等一个只有自己激活后才存在的东西"→ 死锁。
// 描述符与 dsh-cost-panel/lib/typert.remote-client.js 内容一致(内联避免跨包 require)。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-cost-panel-mount",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var stubSchema = { parse: function (v) { return v; } };

    var TYPERT_REMOTE = {
      package: "dsh-cost-panel",
      descriptors: [
        {
          id: "dsh-cost-panel#costglobal/snapshot",
          service: "costglobal",
          namespace: "costglobal",
          method: "snapshot",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "strict", typeSymbol: "dsh-cost-panel/types#CostGlobalSnapshot", schema: stubSchema },
          sourceLocation: { file: "dsh-cost-panel/lib/host.js", line: 1, column: 1 },
        },
      ],
    };

    var inject = ["remote"];

    function apply(ctx) {
      return ctx.remote.$mount(TYPERT_REMOTE);
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
