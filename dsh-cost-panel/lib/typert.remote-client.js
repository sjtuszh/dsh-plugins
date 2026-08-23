// ============================================================================
// 双轨计费面板 — Typert Remote 描述符(静态版,参考)
// ----------------------------------------------------------------------------
// 实际挂载由 dsh-cost-panel-mount 包内联同一份描述符完成(避免跨包 require)。
// 客户端不校验 schema,codec 用恒等桩 { parse: v => v }(MEMORY §5.1),
// 服务端以 typert.host.js 的真 zod schema 校验。
// ============================================================================

const stubSchema = { parse: (v) => v };

export const TYPERT_REMOTE = {
  package: 'dsh-cost-panel',
  descriptors: [
    {
      id: 'dsh-cost-panel#costglobal/snapshot',
      service: 'costglobal',
      namespace: 'costglobal',
      method: 'snapshot',
      invocation: { kind: 'direct' },
      parameters: [],
      result: { mode: 'strict', typeSymbol: 'dsh-cost-panel/types#CostGlobalSnapshot', schema: stubSchema },
      sourceLocation: { file: 'dsh-cost-panel/lib/host.js', line: 1, column: 1 },
    },
  ],
};

export default TYPERT_REMOTE;
