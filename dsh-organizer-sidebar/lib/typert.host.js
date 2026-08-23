// ============================================================================
// 会话侧边栏组织器 — Typert Host 清单(静态版)
// ----------------------------------------------------------------------------
// 形状参照真实生成产物 @deepseek-ai/dsh-message-feedback/lib/typert.host.js:
//   - package 必须等于包名 dsh-organizer-sidebar;
//   - face: 'host';
//   - invocation codec 必须挂 zod v4 实例(校验要求 "_zod" + parse);
//   - schemas 数组可以为空(invocations 里已带 schema);
//   - model.services 的 members/types 仅作诊断元数据。
// typert-loader 会自动加载本包 exports["./typert"] 并注册到 ctx.typert,
// 网关把 organizer/load、organizer/save 端点映射到 ctx.get('organizer') 服务方法。
// ============================================================================

import { z } from 'zod';

// load 无实际入参,但网关 assertExactArguments 要求参数精确等于 wire 字段集,
// 官方生成产物全部带 request 参数,这里统一用空对象 schema(与 file-panel 同构)。
const organizerLoadRequest$schema = z.object({});

const organizerLoadResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    groups: z.array(z.any()),
    order: z.record(z.string(), z.any()).optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

const organizerSaveRequest$schema = z.object({
  state: z.object({
    groups: z.array(z.object({
      id: z.string(),
      name: z.string(),
      workspaceId: z.string(),
      sessionIds: z.array(z.string()),
      expanded: z.boolean().optional(),
    })),
    order: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

const organizerSaveResult$schema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

const organizerDeleteRequest$schema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
});

const organizerDeleteResult$schema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

const organizerDeleteArchivedRequest$schema = z.object({
  ids: z.array(z.string()),
  titles: z.record(z.string(), z.string()).optional(),
});

// results 条目统一:{sessionId, ok, error?, cleaned?}。ok:true 可带 cleaned
// (目录本就不存在只清标记);ok:false 带 error。成功/失败条目可能混合出现。
const organizerDeleteArchivedEntry$schema = z.object({
  sessionId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  cleaned: z.boolean().optional(),
});

const organizerDeleteArchivedResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    results: z.array(organizerDeleteArchivedEntry$schema),
  }),
  z.object({
    ok: z.literal(false),
    partial: z.boolean().optional(),
    error: z.string().optional(),
    results: z.array(organizerDeleteArchivedEntry$schema).optional(),
  }),
]);

const organizerListDeletedResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    items: z.array(z.object({
      sessionId: z.string(),
      title: z.string(),
      deletedAt: z.number(),
    })),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

const organizerRestoreRequest$schema = z.object({
  sessionId: z.string(),
});

const organizerRestoreResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    already: z.boolean().optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export const TYPERT = {
  package: 'dsh-organizer-sidebar',
  face: 'host',
  schemas: [],
  invocations: [
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerLoadRequest',
            schema: organizerLoadRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerLoadResult',
        schema: organizerLoadResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerSaveRequest',
            schema: organizerSaveRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerSaveResult',
        schema: organizerSaveResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteRequest',
            schema: organizerDeleteRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteResult',
        schema: organizerDeleteResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteArchivedRequest',
            schema: organizerDeleteArchivedRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerDeleteArchivedResult',
        schema: organizerDeleteArchivedResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerListDeletedRequest',
            schema: organizerLoadRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerListDeletedResult',
        schema: organizerListDeletedResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreRequest',
            schema: organizerRestoreRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreResult',
        schema: organizerRestoreResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreRequest',
            schema: organizerRestoreRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRestoreResult',
        schema: organizerRestoreResult$schema,
      },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
  ],
  model: {
    services: [
      {
        description: '会话侧边栏组织器 Host 服务:持久化用户分组与每账户会话顺序。',
        summary: '会话侧边栏组织器 Host 服务。',
        tags: [],
        jsDoc: '/**\n * 会话侧边栏组织器 Host 服务:持久化用户分组与每账户会话顺序。\n */',
        key: 'organizer',
        exportName: 'SessionOrganizerService',
        members: [
          {
            kind: 'method',
            name: 'load',
            signature: 'async load(request: OrganizerLoadRequest): Promise<OrganizerLoadResult>',
            summary: '读取持久化状态(分组 + 顺序),文件不存在时返回空状态。',
            jsDoc: '/**\n * 读取持久化状态。\n * @returns 分组与顺序,或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'save',
            signature: 'async save(request: OrganizerSaveRequest): Promise<OrganizerSaveResult>',
            summary: '写入持久化状态(分组 + 顺序)。',
            jsDoc: '/**\n * 写入持久化状态。\n * @param request - 待保存的 state。\n * @returns 成功或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'delete',
            signature: 'async delete(request: OrganizerDeleteRequest): Promise<OrganizerDeleteResult>',
            summary: '删除会话(持久化目录移入回收站,可还原)。',
            jsDoc: '/**\n * 删除会话。\n * @param request - 目标 sessionId 与展示标题。\n * @returns 成功或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'deleteArchived',
            signature: 'async deleteArchived(request: OrganizerDeleteArchivedRequest): Promise<OrganizerDeleteArchivedResult>',
            summary: '批量删除已归档会话(回收站删除 + 移除归档标记)。',
            jsDoc: '/**\n * 批量删除已归档会话。\n * @param request - 目标 sessionId 列表。\n * @returns 逐条结果;部分失败时 ok=false 且 partial=true。\n */',
          },
          {
            kind: 'method',
            name: 'listDeleted',
            signature: 'async listDeleted(request: OrganizerLoadRequest): Promise<OrganizerListDeletedResult>',
            summary: '列出已删除会话(供「已删除」tab)。',
            jsDoc: '/**\n * 列出已删除会话。\n * @returns 已删除会话列表。\n */',
          },
          {
            kind: 'method',
            name: 'restoreArchived',
            signature: 'async restoreArchived(request: OrganizerRestoreRequest): Promise<OrganizerRestoreResult>',
            summary: '还原已归档会话(从 archivedSessionIds 移除)。',
            jsDoc: '/**\n * 还原已归档会话。\n * @param request - 目标 sessionId。\n * @returns 成功或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'restoreDeleted',
            signature: 'async restoreDeleted(request: OrganizerRestoreRequest): Promise<OrganizerRestoreResult>',
            summary: '从回收站还原已删除会话。',
            jsDoc: '/**\n * 从回收站还原已删除会话。\n * @param request - 目标 sessionId。\n * @returns 成功或错误信息。\n */',
          },
        ],
        types: [
          {
            name: 'OrganizerGroup',
            declaration: 'export interface OrganizerGroup {\n    readonly id: string;\n    readonly name: string;\n    readonly workspaceId: string;\n    readonly sessionIds: readonly string[];\n    readonly expanded?: boolean;\n}',
          },
          {
            name: 'OrganizerState',
            declaration: 'export interface OrganizerState {\n    readonly groups: readonly OrganizerGroup[];\n    readonly order?: Record<string, readonly string[]>;\n}',
          },
          {
            name: 'OrganizerLoadRequest',
            declaration: 'export interface OrganizerLoadRequest {\n    readonly [key: string]: unknown;\n}',
          },
          {
            name: 'OrganizerLoadResult',
            declaration: 'export type OrganizerLoadResult = { ok: true; groups: OrganizerGroup[]; order?: Record<string, string[]> } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerSaveRequest',
            declaration: 'export interface OrganizerSaveRequest {\n    readonly state: OrganizerState;\n}',
          },
          {
            name: 'OrganizerSaveResult',
            declaration: 'export type OrganizerSaveResult = { ok: true } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerDeleteRequest',
            declaration: 'export interface OrganizerDeleteRequest {\n    readonly sessionId: string;\n}',
          },
          {
            name: 'OrganizerDeleteResult',
            declaration: 'export type OrganizerDeleteResult = { ok: true } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerDeleteArchivedRequest',
            declaration: 'export interface OrganizerDeleteArchivedRequest {\n    readonly ids: readonly string[];\n    readonly titles?: Record<string, string>;\n}',
          },
          {
            name: 'OrganizerDeleteArchivedResult',
            declaration: 'export type OrganizerDeleteArchivedResult =\n    | { ok: true; results: { sessionId: string; ok: boolean; error?: string; cleaned?: boolean }[] }\n    | { ok: false; partial?: boolean; error?: string; results?: { sessionId: string; ok: boolean; error?: string; cleaned?: boolean }[] };',
          },
          {
            name: 'OrganizerDeletedItem',
            declaration: 'export interface OrganizerDeletedItem {\n    readonly sessionId: string;\n    readonly title: string;\n    readonly deletedAt: number;\n}',
          },
          {
            name: 'OrganizerListDeletedRequest',
            declaration: 'export interface OrganizerListDeletedRequest {\n    readonly [key: string]: unknown;\n}',
          },
          {
            name: 'OrganizerListDeletedResult',
            declaration: 'export type OrganizerListDeletedResult = { ok: true; items: OrganizerDeletedItem[] } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerRestoreRequest',
            declaration: 'export interface OrganizerRestoreRequest {\n    readonly sessionId: string;\n}',
          },
          {
            name: 'OrganizerRestoreResult',
            declaration: 'export type OrganizerRestoreResult = { ok: true; already?: boolean } | { ok: false; error: string };',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
};
