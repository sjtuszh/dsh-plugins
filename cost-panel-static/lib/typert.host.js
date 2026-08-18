// ============================================================================
// 双轨计费面板 — Typert Host 清单(静态版)
// ----------------------------------------------------------------------------
// 形状参照 dsh-file-panel/lib/typert.host.js(已在 profile 验证):
//   - package 必须等于包名 dsh-cost-panel;
//   - face: 'host';
//   - invocation codec 挂 zod v4 实例(校验要求 "_zod" + parse),结果用 z.any()
//     宽松放行(客户端不校验,payload 由 Host 自行构造);
//   - typert-loader 自动加载 exports["./typert"] 并注册,
//     网关把 costglobal/snapshot 端点映射到 ctx.get('costglobal') 服务方法。
// ============================================================================

import { z } from 'zod';

const costglobalSnapshotResult$schema = z.any();

export const TYPERT = {
  package: 'dsh-cost-panel',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: 'dsh-cost-panel#costglobal/snapshot',
      service: 'costglobal',
      namespace: 'costglobal',
      method: 'snapshot',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-cost-panel/types#CostGlobalSnapshot',
        schema: costglobalSnapshotResult$schema,
      },
      sourceLocation: { file: 'dsh-cost-panel/lib/host.js', line: 1, column: 1 },
    },
  ],
  model: {
    services: [
      {
        description: '双轨计费面板 Host 服务:返回所有会话/工作区的全局统计与 DeepSeek API 余额实时快照。',
        summary: '全局统计 + 余额 实时快照服务。',
        tags: [],
        jsDoc: '/**\n * 全局统计(所有会话/工作区)与 DeepSeek API 余额的实时快照。\n */',
        key: 'costglobal',
        exportName: 'CostGlobalService',
        members: [
          {
            kind: 'method',
            name: 'snapshot',
            signature: 'async snapshot(): Promise<CostGlobalSnapshot>',
            summary: '返回 { totals, statsToday, statsMonth, label, balance, ts }。',
            jsDoc: '/**\n * 返回全局累计、今日/本月统计、分叉信息与余额的实时快照。\n */',
          },
        ],
        types: [
          {
            name: 'CostGlobalSnapshot',
            declaration: 'export interface CostGlobalSnapshot {\n    totals: { calls: number; totalCostRmb: number; relayCostRmb: number; legacyCostRmb: number };\n    statsToday: unknown;\n    statsMonth: unknown;\n    label: { today: string; month: string };\n    balance: { is_available: boolean | null; total: number | null; currency: string | null; ts: number; error: string | null };\n    ts: number;\n}',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
};
