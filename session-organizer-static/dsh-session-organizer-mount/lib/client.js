// ============================================================================
// 会话侧边栏组织器 — Typert remote 挂载 bundle(静态版,双条目方案 A)
// ----------------------------------------------------------------------------
// 只做一件事:ctx.remote.$mount(TYPERT_REMOTE),把 remote.organizer 服务挂到
// 客户端,供 dsh-session-organizer 的 UI bundle 消费(inject ["slots","remote",
// "remote.organizer"])。拆成独立包的根因(MEMORY §4.3):若 UI 包自己 $mount 又
// inject 自己的 remote,会"等一个只有自己激活后才存在的东西"→ 死锁。
// 描述符与 dsh-session-organizer/lib/typert.remote-client.js 内容一致(内联避免
// 跨包 require)。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-session-organizer-mount",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var stubSchema = { parse: function (v) { return v; } };

    var TYPERT_REMOTE = {
      package: "dsh-session-organizer",
      descriptors: [
        {
          id: "dsh-session-organizer#organizer/load",
          service: "organizer",
          namespace: "organizer",
          method: "load",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerLoadRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerLoadResult", schema: stubSchema },
          sourceLocation: { file: "dsh-session-organizer/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-session-organizer#organizer/save",
          service: "organizer",
          namespace: "organizer",
          method: "save",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerSaveRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerSaveResult", schema: stubSchema },
          sourceLocation: { file: "dsh-session-organizer/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-session-organizer#organizer/delete",
          service: "organizer",
          namespace: "organizer",
          method: "delete",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerDeleteRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerDeleteResult", schema: stubSchema },
          sourceLocation: { file: "dsh-session-organizer/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-session-organizer#organizer/listDeleted",
          service: "organizer",
          namespace: "organizer",
          method: "listDeleted",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerListDeletedRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerListDeletedResult", schema: stubSchema },
          sourceLocation: { file: "dsh-session-organizer/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-session-organizer#organizer/restoreArchived",
          service: "organizer",
          namespace: "organizer",
          method: "restoreArchived",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerRestoreRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerRestoreResult", schema: stubSchema },
          sourceLocation: { file: "dsh-session-organizer/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-session-organizer#organizer/restoreDeleted",
          service: "organizer",
          namespace: "organizer",
          method: "restoreDeleted",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerRestoreRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-session-organizer/types#OrganizerRestoreResult", schema: stubSchema },
          sourceLocation: { file: "dsh-session-organizer/lib/host.js", line: 1, column: 1 },
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
