// ============================================================================
// 会话侧边栏组织器 — Typert Remote 描述符(静态版)
// ----------------------------------------------------------------------------
// 仅供文档/复用参考:实际挂载由 dsh-session-organizer-mount 包内联同一份描述符
// 完成(避免跨包 require 的模块图复杂度)。
// 客户端不校验 schema,codec 用恒等桩 { parse: v => v }(MEMORY §5.1),
// 服务端以 typert.host.js 的真 zod v4 schema 校验。
// ============================================================================

const stubSchema = { parse: (v) => v };

export const TYPERT_REMOTE = {
  package: 'dsh-session-organizer',
  descriptors: [
    {
      id: 'dsh-session-organizer#organizer/load',
      service: 'organizer',
      namespace: 'organizer',
      method: 'load',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerLoadRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerLoadResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-session-organizer#organizer/save',
      service: 'organizer',
      namespace: 'organizer',
      method: 'save',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerSaveRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerSaveResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-session-organizer#organizer/delete',
      service: 'organizer',
      namespace: 'organizer',
      method: 'delete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerDeleteRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerDeleteResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-session-organizer#organizer/deleteArchived',
      service: 'organizer',
      namespace: 'organizer',
      method: 'deleteArchived',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerDeleteArchivedRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerDeleteArchivedResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-session-organizer#organizer/listDeleted',
      service: 'organizer',
      namespace: 'organizer',
      method: 'listDeleted',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerListDeletedRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerListDeletedResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-session-organizer#organizer/restoreArchived',
      service: 'organizer',
      namespace: 'organizer',
      method: 'restoreArchived',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerRestoreRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerRestoreResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-session-organizer#organizer/restoreDeleted',
      service: 'organizer',
      namespace: 'organizer',
      method: 'restoreDeleted',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerRestoreRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-session-organizer/types#OrganizerRestoreResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-session-organizer/lib/host.js', line: 1, column: 1 },
    },
  ],
};

export default TYPERT_REMOTE;
