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
    hiddenWorkspaces: z.array(z.string()).optional(),
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
    hiddenWorkspaces: z.array(z.string()).optional(),
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

// 拉起子智能体:父会话 id + 子代理名称 + 模式(new=全新 / inherit=继承父上下文) + 可选任务。
const organizerSpawnSubagentRequest$schema = z.object({
  parentSessionId: z.string(),
  name: z.string(),
  mode: z.string().optional(),
  task: z.string().optional(),
});

const organizerSpawnSubagentResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    childId: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

// 结束子智能体:子代理 id + 其父会话 id。
const organizerEndSubagentRequest$schema = z.object({
  childSessionId: z.string(),
  parentSessionId: z.string(),
});

const organizerEndSubagentResult$schema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

// 分叉复制子智能体:源子代理 id + 当前显示名称;返回唯一递增名称。
const organizerForkSubagentRequest$schema = z.object({
  sourceChildId: z.string(),
  sourceName: z.string(),
});

const organizerForkSubagentResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    childId: z.string(),
    name: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

// 重命名子代理:会话 id + 新名称(改 durable session title)。
const organizerRenameSubagentRequest$schema = z.object({
  sessionId: z.string(),
  name: z.string(),
});

const organizerRenameSubagentResult$schema = z.union([
  z.object({
    ok: z.literal(true),
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
    {
      id: 'dsh-organizer-sidebar#organizer/spawnSubagent',
      service: 'organizer',
      namespace: 'organizer',
      method: 'spawnSubagent',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerSpawnSubagentRequest',
            schema: organizerSpawnSubagentRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerSpawnSubagentResult',
        schema: organizerSpawnSubagentResult$schema,
      },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/endSubagent',
      service: 'organizer',
      namespace: 'organizer',
      method: 'endSubagent',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerEndSubagentRequest',
            schema: organizerEndSubagentRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerEndSubagentResult',
        schema: organizerEndSubagentResult$schema,
      },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/forkSubagent',
      service: 'organizer',
      namespace: 'organizer',
      method: 'forkSubagent',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerForkSubagentRequest',
            schema: organizerForkSubagentRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerForkSubagentResult',
        schema: organizerForkSubagentResult$schema,
      },
      sourceLocation: { file: 'dsh-organizer-sidebar/lib/host.js', line: 1, column: 1 },
    },
    {
      id: 'dsh-organizer-sidebar#organizer/renameSubagent',
      service: 'organizer',
      namespace: 'organizer',
      method: 'renameSubagent',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRenameSubagentRequest',
            schema: organizerRenameSubagentRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-organizer-sidebar/types#OrganizerRenameSubagentResult',
        schema: organizerRenameSubagentResult$schema,
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
          {
            kind: 'method',
            name: 'spawnSubagent',
            signature: 'async spawnSubagent(request: OrganizerSpawnSubagentRequest): Promise<OrganizerSpawnSubagentResult>',
            summary: '拉起子智能体:以父会话启动一个 continuable 子代理(名称=label)。',
            jsDoc: '/**\n * 拉起子智能体。\n * @param request - 父会话 id 与子代理名称。\n * @returns 子代理 childId 或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'endSubagent',
            signature: 'async endSubagent(request: OrganizerEndSubagentRequest): Promise<OrganizerEndSubagentResult>',
            summary: '结束子智能体:interrupt + drain 释放 + 归档会话。',
            jsDoc: '/**\n * 结束子智能体。\n * @param request - 子代理 id 与其父会话 id。\n * @returns 成功或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'forkSubagent',
            signature: 'async forkSubagent(request: OrganizerForkSubagentRequest): Promise<OrganizerForkSubagentResult>',
            summary: '分叉复制子智能体:继承源子代理上下文,名称递增去重。',
            jsDoc: '/**\n * 分叉复制子智能体。\n * @param request - 源子代理 id 与显示名。\n * @returns 新子代理 id 与唯一递增名称。\n */',
          },
          {
            kind: 'method',
            name: 'renameSubagent',
            signature: 'async renameSubagent(request: OrganizerRenameSubagentRequest): Promise<OrganizerRenameSubagentResult>',
            summary: '重命名子代理:改 durable session title。',
            jsDoc: '/**\n * 重命名子代理。\n * @param request - 子代理会话 id 与新名称。\n * @returns 成功或错误信息。\n */',
          },
        ],
        types: [
          {
            name: 'OrganizerGroup',
            declaration: 'export interface OrganizerGroup {\n    readonly id: string;\n    readonly name: string;\n    readonly workspaceId: string;\n    readonly sessionIds: readonly string[];\n    readonly expanded?: boolean;\n}',
          },
          {
            name: 'OrganizerState',
            declaration: 'export interface OrganizerState {\n    readonly groups: readonly OrganizerGroup[];\n    readonly order?: Record<string, readonly string[]>;\n    readonly hiddenWorkspaces?: readonly string[];\n}',
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
          {
            name: 'OrganizerSpawnSubagentRequest',
            declaration: 'export interface OrganizerSpawnSubagentRequest {\n    readonly parentSessionId: string;\n    readonly name: string;\n    readonly mode?: "new" | "inherit";\n    readonly task?: string;\n}',
          },
          {
            name: 'OrganizerSpawnSubagentResult',
            declaration: 'export type OrganizerSpawnSubagentResult = { ok: true; childId: string } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerEndSubagentRequest',
            declaration: 'export interface OrganizerEndSubagentRequest {\n    readonly childSessionId: string;\n    readonly parentSessionId: string;\n}',
          },
          {
            name: 'OrganizerEndSubagentResult',
            declaration: 'export type OrganizerEndSubagentResult = { ok: true } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerForkSubagentRequest',
            declaration: 'export interface OrganizerForkSubagentRequest {\n    readonly sourceChildId: string;\n    readonly sourceName: string;\n}',
          },
          {
            name: 'OrganizerForkSubagentResult',
            declaration: 'export type OrganizerForkSubagentResult = { ok: true; childId: string; name: string } | { ok: false; error: string };',
          },
          {
            name: 'OrganizerRenameSubagentRequest',
            declaration: 'export interface OrganizerRenameSubagentRequest {\n    readonly sessionId: string;\n    readonly name: string;\n}',
          },
          {
            name: 'OrganizerRenameSubagentResult',
            declaration: 'export type OrganizerRenameSubagentResult = { ok: true } | { ok: false; error: string };',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
};
