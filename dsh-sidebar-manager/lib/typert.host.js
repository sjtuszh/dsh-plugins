// ============================================================================
// 侧栏会话管理器 — Typert Host 清单(静态版)
// 形状参照 dsh-message-feedback/lib/typert.host.js;codec 需真 zod v4 schema。
// ============================================================================

import { z } from 'zod';

const sessmanRenameRequest$schema = z.object({
  sessionId: z.string(),
  title: z.string(),
});

const sessmanRenameResult$schema = z.union([
  z.object({
    ok: z.literal(true),
    title: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export const TYPERT = {
  package: 'dsh-sidebar-manager',
  face: 'host',
  schemas: [],
  invocations: [
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-sidebar-manager/types#SessmanRenameRequest',
            schema: sessmanRenameRequest$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-sidebar-manager/types#SessmanRenameResult',
        schema: sessmanRenameResult$schema,
      },
      sourceLocation: { file: 'dsh-sidebar-manager/lib/host.js', line: 1, column: 1 },
    },
  ],
  model: {
    services: [
      {
        description: '侧栏会话管理器 Host 服务:会话改名(含冷会话)。',
        summary: '侧栏会话管理器 Host 服务。',
        tags: [],
        jsDoc: '/**\n * 侧栏会话管理器 Host 服务:会话改名(含冷会话)。\n */',
        key: 'sessman',
        exportName: 'SidebarManagerService',
        members: [
          {
            kind: 'method',
            name: 'rename',
            signature: 'async rename(request: SessmanRenameRequest): Promise<SessmanRenameResult>',
            summary: '重命名一个会话(冷会话自动物化)。',
            jsDoc: '/**\n * 重命名一个会话;冷会话先从持久化物化。\n * @param request - 会话 id 与新标题。\n * @returns 规范化标题或错误。\n */',
          },
        ],
        types: [
          {
            name: 'SessmanRenameRequest',
            declaration: 'export interface SessmanRenameRequest {\n    readonly sessionId: string;\n    readonly title: string;\n}',
          },
          {
            name: 'SessmanRenameResult',
            declaration: 'export type SessmanRenameResult = { ok: true; title: string } | { ok: false; error: string };',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
};
