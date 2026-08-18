// ============================================================================
// 会话侧边栏组织器 — Typert Remote 描述符(静态版)
// ----------------------------------------------------------------------------
// 仅供文档/复用参考:实际挂载由 dsh-organizer-sidebar/lib/client.js 内联同一份
// 描述符完成(async apply 先 $mount 再注册 UI,单包方案)。
// 客户端不校验 schema,codec 用恒等桩 { parse: v => v }(MEMORY §5.1),
// 服务端以 typert.host.js 的真 zod v4 schema 校验。
// ============================================================================

const stubSchema = { parse: (v) => v };

export const TYPERT_REMOTE = {
  package: 'dsh-organizer-sidebar',
  descriptors: [
    {
      id: 'dsh-organizer-sidebar#organizer/load',
      service: 'organizer',
      namespace: 'organizer',
      method: 'load',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerLoadRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerLoadResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/save',
      service: 'organizer',
      namespace: 'organizer',
      method: 'save',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerSaveRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerSaveResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/delete',
      service: 'organizer',
      namespace: 'organizer',
      method: 'delete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/deleteArchived',
      service: 'organizer',
      namespace: 'organizer',
      method: 'deleteArchived',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteArchivedRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteArchivedResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/listDeleted',
      service: 'organizer',
      namespace: 'organizer',
      method: 'listDeleted',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerListDeletedRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerListDeletedResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/restoreArchived',
      service: 'organizer',
      namespace: 'organizer',
      method: 'restoreArchived',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/restoreDeleted',
      service: 'organizer',
      namespace: 'organizer',
      method: 'restoreDeleted',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreRequest', schema: stubSchema },
        },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreResult', schema: stubSchema },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
  ],
};

export default TYPERT_REMOTE;
