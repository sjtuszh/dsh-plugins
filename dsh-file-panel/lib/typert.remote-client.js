// ============================================================================
// 文件树浏览面板 — Typert Remote 描述符(静态版)
// ----------------------------------------------------------------------------
// 仅供文档/复用参考:实际挂载由 dsh-file-panel-mount 包内联同一份描述符完成
// (避免跨包 require 的模块图复杂度)。
// 客户端不校验 schema,codec 用恒等桩 { parse: v => v }(MEMORY §5.1),
// 服务端以 typert.host.js 的真 zod v4 schema 校验。
// ============================================================================

const stubSchema = { parse: (v) => v };

export const TYPERT_REMOTE = {
  package: 'dsh-file-panel',
  descriptors: [
    {
      id: 'dsh-file-panel#filetree/list',
      service: 'filetree',
      namespace: 'filetree',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-file-panel/types#FileTreeListRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-file-panel/types#FileTreeListResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-file-panel/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-file-panel#filetree/reveal',
      service: 'filetree',
      namespace: 'filetree',
      method: 'reveal',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-file-panel/types#FileTreeRevealRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-file-panel/types#FileTreeRevealResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-file-panel/lib/host.js', line: 1, column: 1 },
    },
  ],
};

export default TYPERT_REMOTE;
