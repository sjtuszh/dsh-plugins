// ============================================================================
// 文件树浏览面板 — Typert Host 清单(静态版)
// ----------------------------------------------------------------------------
// 形状参照真实生成产物 @deepseek-ai/dsh-message-feedback/lib/typert.host.js:
//   - package 必须等于包名 dsh-file-panel;
//   - face: 'host';
//   - invocation codec 必须挂 zod v4 实例(校验要求 "_zod" + parse);
//   - schemas 数组可以为空(invocations 里已带 schema);
//   - model.services 的 members/types 仅作诊断元数据。
// typert-loader 会自动加载本包 exports["./typert"] 并注册到 ctx.typert,
// 网关把 filetree/list、filetree/reveal 端点映射到 ctx.get('filetree') 服务方法。
// ============================================================================

import { z } from 'zod';

const filetreeListRequest$schema = z.object({
  path: z.string(),
});

const filetreeListResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    path: z.string(),
    items: z.array(z.object({
      name: z.string(),
      kind: z.string(),
      path: z.string(),
    })),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

const filetreeRevealRequest$schema = z.object({
  path: z.string(),
  kind: z.string().optional(),
});

const filetreeRevealResult$schema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export const TYPERT = {
  package: 'dsh-file-panel',
  face: 'host',
  schemas: [],
  invocations: [
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-file-panel/types#FileTreeListRequest',
            schema: filetreeListRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-file-panel/types#FileTreeListResult',
        schema: filetreeListResult$schema,
      },
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-file-panel/types#FileTreeRevealRequest',
            schema: filetreeRevealRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-file-panel/types#FileTreeRevealResult',
        schema: filetreeRevealResult$schema,
      },
      sourceLocation: { file: 'dsh-file-panel/lib/host.js', line: 1, column: 1 },
    },
  ],
  model: {
    services: [
      {
        description: '文件树浏览面板 Host 服务:列目录 + 在系统文件管理器中打开/定位。',
        summary: '文件树浏览面板 Host 服务。',
        tags: [],
        jsDoc: '/**\n * 文件树浏览面板 Host 服务:列目录 + 在系统文件管理器中打开/定位。\n */',
        key: 'filetree',
        exportName: 'FileTreeService',
        members: [
          {
            kind: 'method',
            name: 'list',
            signature: 'async list(request: FileTreeListRequest): Promise<FileTreeListResult>',
            summary: '列出一个目录的条目(目录在前、名称排序)。',
            jsDoc: '/**\n * 列出一个目录的条目。\n * @param request - 目标目录路径。\n * @returns 条目列表或错误信息。\n */',
          },
          {
            kind: 'method',
            name: 'reveal',
            signature: 'async reveal(request: FileTreeRevealRequest): Promise<FileTreeRevealResult>',
            summary: '在系统文件管理器中打开/定位路径。',
            jsDoc: '/**\n * 在系统文件管理器中打开/定位路径。\n * @param request - 路径与类型;文件用 /select, 定位,目录直接打开。\n */',
          },
        ],
        types: [
          {
            name: 'FileTreeItem',
            declaration: 'export interface FileTreeItem {\n    readonly name: string;\n    readonly kind: "file" | "dir" | "other";\n    readonly path: string;\n}',
          },
          {
            name: 'FileTreeListRequest',
            declaration: 'export interface FileTreeListRequest {\n    readonly path: string;\n}',
          },
          {
            name: 'FileTreeListResult',
            declaration: 'export type FileTreeListResult = { ok: true; path: string; items: FileTreeItem[] } | { ok: false; error: string };',
          },
          {
            name: 'FileTreeRevealRequest',
            declaration: 'export interface FileTreeRevealRequest {\n    readonly path: string;\n    readonly kind?: "file" | "dir";\n}',
          },
          {
            name: 'FileTreeRevealResult',
            declaration: 'export type FileTreeRevealResult = { ok: true } | { ok: false; error: string };',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
};
