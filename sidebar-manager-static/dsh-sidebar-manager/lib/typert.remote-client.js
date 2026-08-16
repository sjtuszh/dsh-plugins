// ============================================================================
// 侧栏会话管理器 — Typert Remote 描述符(静态版)
// 仅文档参考;实际挂载由 dsh-sidebar-manager-mount 包内联同一描述符。
// 客户端不校验 schema,codec 用恒等桩(MEMORY §5.1)。
// ============================================================================

const stubSchema = { parse: (v) => v };

export const TYPERT_REMOTE = {
  package: 'dsh-sidebar-manager',
  descriptors: [
    {
      id: 'dsh-sidebar-manager#sessman/rename',
      service: 'sessman',
      namespace: 'sessman',
      method: 'rename',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-sidebar-manager/types#SessmanRenameRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-sidebar-manager/types#SessmanRenameResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-sidebar-manager/lib/host.js', line: 1, column: 1 },
    },
  ],
};

export default TYPERT_REMOTE;
