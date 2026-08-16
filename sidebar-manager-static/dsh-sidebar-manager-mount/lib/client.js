// ============================================================================
// 侧栏会话管理器 — Typert remote 挂载 bundle(静态版,双条目方案 A)
// 只做 ctx.remote.$mount(TYPERT_REMOTE),挂出 remote.sessman 供 UI 包消费
// (防自依赖死锁, MEMORY §4.3/§5.2)。描述符与主包 typert.remote-client.js 一致。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-sidebar-manager-mount",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var stubSchema = { parse: function (v) { return v; } };

    var TYPERT_REMOTE = {
      package: "dsh-sidebar-manager",
      descriptors: [
        {
          id: "dsh-sidebar-manager#sessman/rename",
          service: "sessman",
          namespace: "sessman",
          method: "rename",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-sidebar-manager/types#SessmanRenameRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-sidebar-manager/types#SessmanRenameResult", schema: stubSchema },
          sourceLocation: { file: "dsh-sidebar-manager/lib/host.js", line: 1, column: 1 },
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
