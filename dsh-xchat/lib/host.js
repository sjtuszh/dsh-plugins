// ============================================================================
// 跨会话知识桥 dsh-xchat — Host 半边（静态版，profile 层）
// ----------------------------------------------------------------------------
// 注册模型工具 xchat_query（start/ask/stop）。关键：inject 声明全部硬依赖
// （tools/subagents/sessionQuery/agents/agentPresets），Cordis 激活是服务
// 可用性驱动的——插件会等这些服务就绪后再 apply，因此在 profile 层即可
// 拿到它们并向全局 tools 注册（对任意会话可见，无需选择特定预设）。
// ============================================================================
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// 可配置项默认值；设置面板（设置 → XChat）经 Typert remote 读写。
// modelMode: 'auto' = 子代理继承目标会话的模型路由；'custom' = 用 modelProvider/modelId。
const DEFAULTS = { enabled: true, menuEnabled: true, autoCleanup: true, waitTimeoutMs: 240000, modelMode: 'auto', modelProvider: null, modelId: null }

function configPath() {
  const home = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME) || ''
  return home ? join(home, 'xchat-config.json') : ''
}

function textBlock(text) {
  return { type: 'text', text: String(text) }
}

function assistantTexts(snap) {
  const out = []
  if (!snap || !Array.isArray(snap.events)) return out
  for (const e of snap.events) {
    if (e.type !== 'assistant/message') continue
    const blocks = e.data && e.data.message && e.data.message.content
    if (!Array.isArray(blocks)) continue
    const text = blocks.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n')
    if (text.trim().length > 0) out.push(text)
  }
  return out
}

export default {
  name: 'dsh-xchat',
  inject: ['tools', 'subagents', 'sessionQuery', 'agents', 'agentPresets', 'timer'],
  apply(ctx) {
    // 配置：内存默认值 + 启动时从 $DSH_HOME/xchat-config.json 加载，setConfig 写回。
    const config = { ...DEFAULTS }
    const CONFIG_PATH = configPath()
    if (CONFIG_PATH) {
      try {
        const raw = readFileSync(CONFIG_PATH, 'utf8')
        Object.assign(config, JSON.parse(raw))
      } catch (e) { /* 无配置/损坏时用默认值 */ }
    }
    function persistConfig() {
      if (!CONFIG_PATH) return
      try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8') } catch (e) { /* ignore */ }
    }
    let disposeTool
    // 每个条目 = 一个调用方会话对目标会话的专用子代理：
    //   { childId, targetId, callerId, parentAgent, resumed, targetLabel }
    const active = []
    // 本进程创建的所有 xchat 子代理 id，用于把子代理排除出目标解析（防链式）。
    const xchatChildren = new Set()
    const resumed = new Map()
    const source = { kind: 'plugin', plugin: 'xchat-bridge' }

    function sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          cleanup()
          reject((signal && signal.reason) || new Error('aborted'))
        }
        function cleanup() {
          clear()
          if (signal) signal.removeEventListener('abort', onAbort)
        }
        const clear = ctx.timeout(() => { cleanup(); resolve() }, ms)
        if (signal) {
          if (signal.aborted) { onAbort(); return }
          signal.addEventListener('abort', onAbort)
        }
      })
    }

    // 归档一个会话（从所有分组表面消失，可回收站还原）。失败静默。
    async function archiveSession(id) {
      try {
        const wsr = ctx.get('workspaceRegistry')
        if (wsr) await wsr.archiveSession(id)
      } catch (e) { /* ignore */ }
    }

    // A（调用方）会话关闭时，自动清理它发起的所有 XChat 子代理（用完即删的兜底：
    // 即使模型忘了调 stop，A 一关闭子代理立刻被打断并归档删除）。
    ctx.on('agent/disposed', (payload) => {
      const gone = payload && payload.agent
      if (!gone) return
      const goneId = String(gone.id)
      const mine = active.filter((v) => v.callerId === goneId)
      if (mine.length === 0) return
      for (const entry of mine) {
        try {
          ctx.subagents.interrupt(entry.childId, { kind: 'user', parentSessionId: entry.targetId })
        } catch (e) { /* ignore */ }
        archiveSession(entry.childId).then(() => {
          xchatChildren.delete(entry.childId)
          const i = active.findIndex((v) => v.childId === entry.childId)
          if (i >= 0) active.splice(i, 1)
        }).catch(() => { /* ignore */ })
      }
    })

    // 清理所有目标会话名下遗留的 xchat:* 孤儿（进程重启后 active 丢失，以及
    // 旧版链式留下的中间节点）。只归档不在当前 active 里的，绝不动正在使用的。
    // 全局限定 + 30 秒限流，避免每次 start 都全表扫描。
    let lastSweep = 0
    async function sweepAllOrphans() {
      const now = Date.now()
      if (now - lastSweep < 30000) return
      lastSweep = now
      try {
        const records = await ctx.sessionQuery.listSessions()
        for (const rec of records) {
          try {
            const children = await ctx.subagents.listChildren(String(rec.header.id))
            for (const c of children) {
              const label = String(c.label || '')
              if (!label.startsWith('xchat:')) continue
              const childId = String(c.sessionId || c.id || '')
              if (!childId) continue
              if (active.some((v) => v.childId === childId)) continue
              await archiveSession(childId)
              xchatChildren.delete(childId)
            }
          } catch (e) { /* ignore per-parent */ }
        }
      } catch (e) { /* ignore */ }
    }

    async function resolveTarget(agent, name, signal) {
      const q = String(name || '').replace(/^[\\@]+/, '').trim().toLowerCase()
      if (!q) return { error: '目标名称为空' }
      let records
      try {
        records = await ctx.sessionQuery.listSessions(signal)
      } catch (e) {
        return { error: '无法列出会话: ' + (e && e.message ? e.message : String(e)) }
      }
      const rows = []
      for (const rec of records) {
        const h = rec.header
        const id = String(h.id)
        if (id === String(agent.id)) continue
        // 排除所有子代理（含 XChat 派生子代理）：目标必须是真实会话。
        if (h.origin === 'subagent') continue
        // 排除本进程创建的 xchat 子代理，防止把它当成目标（链式子代理根因）。
        if (xchatChildren.has(id)) continue
        let title = ''
        try {
          const t = await ctx.sessionQuery.readTitle(id, signal)
          if (t && typeof t.title === 'string') title = t.title
        } catch (e) {}
        // 兜底：标题以 xchat: 开头的会话也排除。
        if (title.startsWith('xchat:')) continue
        const cwdName = h.cwd ? String(h.cwd).split(/[\\/]/).filter(Boolean).pop() : ''
        const labels = [id, title, cwdName].filter(Boolean)
        rows.push({ id, labels })
      }
      let hit = rows.find((r) => r.labels.some((l) => l.toLowerCase() === q))
      if (!hit) hit = rows.find((r) => r.labels.some((l) => l.toLowerCase().includes(q)))
      if (!hit) return { error: '找不到会话「' + name + '」（可用会话名、会话ID或目录名引用）' }
      return { id: hit.id }
    }

    async function getParentAgent(id, signal) {
      const live = ctx.agents.get(id)
      if (live) return { agent: live, resumed: false }
      let presetId
      try {
        const recs = await ctx.sessionQuery.listSessions(signal)
        const rec = recs.find((r) => String(r.header.id) === String(id))
        presetId = rec && rec.header.agentPreset ? rec.header.agentPreset : undefined
      } catch (e) {}
      const handle = await ctx.agents.resume({
        resumeSessionId: id,
        signal,
        ...(presetId ? { setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, presetId) } } : {})
      })
      resumed.set(id, handle)
      return { agent: handle.agent, resumed: true }
    }

    async function currentReply(childId) {
      try {
        const snap = await ctx.sessionQuery.readSurface(childId)
        const texts = assistantTexts(snap)
        return texts.length > 0 ? texts[texts.length - 1] : ''
      } catch (e) {
        return ''
      }
    }

    async function currentSeq(childId) {
      try {
        const snap = await ctx.sessionQuery.readSurface(childId)
        return snap && snap.capturedThroughSeq != null ? snap.capturedThroughSeq : -1
      } catch (e) {
        return -1
      }
    }

    async function waitForReply(childId, signal, timeoutMs, afterSeq) {
      const deadline = Date.now() + timeoutMs
      let stable = 0
      let lastText = ''
      let lastSeq = -1
      while (Date.now() < deadline) {
        if (signal && signal.aborted) throw (signal.reason || new Error('aborted'))
        let snap = null
        try { snap = await ctx.sessionQuery.readSurface(childId) } catch (e) { snap = null }
        if (snap) {
          const seq = snap.capturedThroughSeq != null ? snap.capturedThroughSeq : -1
          // ask 场景：只接受 afterSeq（followup 提交前的基线）之后的新事件。
          // 否则冷恢复期间 surface 无变化会被误判为「回复稳定」，提前返回旧文本。
          if (afterSeq != null && seq <= afterSeq) {
            await sleep(600, signal)
            continue
          }
          // 只收集 afterSeq 之后的新 assistant 消息：冷恢复会先写 turn 开始等事件
          // （seq 前进但 assistant 还是旧文），必须按事件 seq 过滤，否则误取旧回复。
          const texts = []
          for (const e of snap.events) {
            if (e.type !== 'assistant/message') continue
            if (afterSeq != null && e.seq <= afterSeq) continue
            const blocks = e.data && e.data.message && e.data.message.content
            if (!Array.isArray(blocks)) continue
            const text = blocks.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n')
            if (text.trim().length > 0) texts.push(text)
          }
          const cur = texts.length > 0 ? texts[texts.length - 1] : ''
          if (seq === lastSeq && cur === lastText) {
            stable += 1
            if (stable >= 4 && cur.length > 0) return { reply: cur, done: true, timedOut: false }
          } else {
            stable = 0
            lastSeq = seq
            lastText = cur
          }
        }
        await sleep(600, signal)
      }
      if (lastText.length > 0) return { reply: lastText, done: false, timedOut: true }
      return { reply: '', done: false, timedOut: true }
    }

    // 设置面板 RPC：状态 + 配置读写（Typert remote，client 经 ctx.remote.xchat 调用）。
    class XChatService extends TypertRemoteService {
      async getStatus() {
        return { ok: true, toolRegistered: !!disposeTool, activeCount: active.length, config: { ...config } }
      }
      async getConfig() {
        return { ok: true, config: { ...config } }
      }
      async listModels() {
        const llm = this.ctx.get('llm')
        if (!llm) return { ok: false, error: 'llm 服务不可用' }
        try {
          const providers = await llm.listProviders()
          const groups = []
          for (const p of providers) {
            let models = []
            try { models = await llm.listModels(p.id) } catch (e) { /* 该 provider 无模型目录 */ }
            groups.push({
              id: String(p.id),
              name: String((p && p.name) || p.id),
              models: models.map(function (m) { return { id: String(m.id), name: String((m && m.name) || m.id) } })
            })
          }
          return { ok: true, groups }
        } catch (e) {
          return { ok: false, error: e && e.message ? String(e.message) : String(e) }
        }
      }
      async setConfig(request) {
        const next = request && typeof request.config === 'object' ? request.config : {}
        if (typeof next.enabled === 'boolean') config.enabled = next.enabled
        if (typeof next.menuEnabled === 'boolean') config.menuEnabled = next.menuEnabled
        if (typeof next.autoCleanup === 'boolean') config.autoCleanup = next.autoCleanup
        if (Number.isFinite(next.waitTimeoutMs) && next.waitTimeoutMs > 0) config.waitTimeoutMs = Math.round(next.waitTimeoutMs)
        if (next.modelMode === 'auto' || next.modelMode === 'custom') config.modelMode = next.modelMode
        if (typeof next.modelProvider === 'string' && next.modelProvider) config.modelProvider = next.modelProvider
        if (typeof next.modelId === 'string' && next.modelId) config.modelId = next.modelId
        persistConfig()
        return { ok: true, config: { ...config } }
      }
    }
    // 手写 ESM 无法用 @Remote 装饰器（那是 TS 编译注入 markers 的）。
    // 这里模拟装饰器：构造 decorator context 调用 Remote() 并触发 initializer，
    // 使网关 remoteMethods() 能枚举到这些方法——否则 host 无 xchat/* 端点，
    // client 的 $mount 调用会 404。
    function markRemoteMethods(instance, methodNames) {
      for (const name of methodNames) {
        const initializers = []
        const context = {
          kind: 'method',
          name: String(name),
          private: false,
          static: false,
          addInitializer(fn) { initializers.push(fn) }
        }
        Remote(name)(undefined, context)
        for (const fn of initializers) fn.call(instance)
      }
    }
    const xchatService = new XChatService(ctx, 'xchat')
    markRemoteMethods(xchatService, ['getStatus', 'getConfig', 'listModels', 'setConfig'])

    disposeTool = ctx.tools.register({
      name: 'xchat_query',
      description: '跨会话知识桥：在目标会话名下原生拉起一个继承其记忆的 fork 子代理，向它询问关键信息并等待回复。每个调用方会话对同一目标会话各分配一个同级专用子代理；可反复追问（ask）；用完必须结束（stop），stop 会打断并归档删除该子代理。用户通常以 @会话名 或 \\会话名 形式引用目标会话，把引用的名称作为 target 传入。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'ask', 'stop'], description: 'start=在目标会话下创建继承其记忆的子代理并首次询问；ask=向本调用方名下的子代理追问；stop=结束并删除本调用方名下的子代理' },
          target: { type: 'string', description: '目标会话名或子代理名（可带 @ 或 \\ 前缀，如 @财务报告）。start/stop 必填，ask 可用 target 或 childId 定位' },
          request: { type: 'string', description: '询问内容：需要目标会话提供哪些关键信息。start/ask 必填' },
          childId: { type: 'string', description: '已建立的子代理会话 id（ask/stop 定位用，可选）' }
        },
        required: ['action']
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reply: { type: 'string' },
            childId: { type: 'string' },
            target: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['ok']
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.ok ? '[xchat] 目标「' + (value.target || '') + '」子代理回复：\n' + (value.reply || '(无文本回复)') : '[xchat] ' + (value.note || '失败')
        }]
      },
      timeoutMs: 300000,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const action = args.action
        const target = String(args.target || '').trim()
        const request = String(args.request || '').trim()
        const childIdArg = args.childId ? String(args.childId) : undefined
        const agent = exec.agent
        if (!agent) return { ok: false, note: '无调用代理' }
        if (!config.enabled) return { ok: false, note: 'xchat_query 已在设置中禁用（设置 → XChat）' }
        const callerId = String(agent.id)
        // 只在本调用方名下定位（childId 精确优先，其次 callerId+targetId）。
        const findEntry = async () => {
          if (childIdArg) return active.find((v) => v.childId === childIdArg)
          if (target) {
            const resolved = await resolveTarget(agent, target, exec.signal)
            if (!resolved.error) return active.find((v) => v.callerId === callerId && v.targetId === resolved.id)
          }
          return undefined
        }
        try {
          if (action === 'start') {
            if (!target) return { ok: false, note: 'start 需要 target（@会话名）' }
            if (!request) return { ok: false, note: 'start 需要 request（要问什么）' }
            const resolved = await resolveTarget(agent, target, exec.signal)
            if (resolved.error) return { ok: false, note: resolved.error }
            const existing = active.find((v) => v.callerId === callerId && v.targetId === resolved.id)
            if (existing) return { ok: true, childId: existing.childId, target, reply: '', note: '本会话对该目标已有活跃子代理，请直接 ask 追问' }
            // 清理遗留的 xchat 孤儿（含旧版链式留下的中间节点）。
            if (config.autoCleanup) await sweepAllOrphans()
            const g = await getParentAgent(resolved.id, exec.signal)
            const promptText = [
              '你是从会话「' + target + '」派生的记忆子代理，你通过 fork 继承了该会话的完整对话历史。',
              '当前另一个会话需要该会话中的知识。请只依据你继承的记忆回答，不要编造。',
              '任务：' + request,
              '输出要求：把与该请求相关的关键信息组织成清晰、结构化、可直接引用的回复（关键文件路径、命令、结论、决策依据、数字等）；如果记忆中确实没有相关信息，请明确说明缺了什么。',
              '约束：你只负责信息提取与整理，不要执行文件或命令操作，不要调用工具。'
            ].join('\n')
            // 模型路由：auto=继承目标会话；custom=设置面板指定的 provider/model。
            // 注意：外层已有 `const request`（工具参数），这里必须用不同名字，
            // 否则同作用域 const 重复声明 → TDZ → start 分支必炸。
            const forkRequest = { parent: g.agent, prompt: [textBlock(promptText)] }
            if (config.modelMode === 'custom' && config.modelProvider && config.modelId) {
              forkRequest.agentOptions = { provider: config.modelProvider, model: config.modelId }
            }
            const started = await ctx.subagents.startContinuable({
              provider: 'fork',
              label: 'xchat:' + target,
              request: forkRequest,
              signal: exec.signal
            })
            xchatChildren.add(started.childId)
            // 给子代理打上可识别的标题「xchat:<目标名>」：
            //  - client 的 @ 菜单据此过滤（不显示 XChat 子代理候选）
            //  - host 的 resolveTarget 据此排除（防链式）
            try {
              const sessions = ctx.get('sessions')
              const sessionTitle = ctx.get('sessionTitle')
              if (sessions && sessionTitle) {
                const childSession = sessions.get(started.childId)
                if (childSession) {
                  const label = ('xchat:' + target).slice(0, 100)
                  sessionTitle.rename(childSession, label)
                }
              }
            } catch (e) { /* 标题设置失败不影响主流程 */ }
            active.push({ childId: started.childId, targetId: resolved.id, callerId, parentAgent: g.agent, resumed: g.resumed, targetLabel: target })
            const wait = await waitForReply(started.childId, exec.signal, config.waitTimeoutMs)
            const reply = wait.reply || (await currentReply(started.childId))
            return { ok: true, childId: started.childId, target, reply, ...(wait.timedOut && !reply ? { note: '子代理已启动但 4 分钟内无文本回复，可 ask 追问' } : {}) }
          }
          if (action === 'ask') {
            const entry = await findEntry()
            if (!entry) return { ok: false, note: '本会话没有找到活跃子代理，请先用 start 创建' }
            if (!request) return { ok: false, note: 'ask 需要 request（追问内容）' }
            // 刷新父 agent：entry.parentAgent 可能是早期 resume 的临时 handle，
            // 若目标会话已关闭/被平台释放，followup 的 parent 会失效（子代理收不到唤醒）。
            // 取当前 live 的 agent，没有再 resume 一个，并回写 entry。
            let parent = ctx.agents.get(entry.targetId)
            if (!parent) {
              const g = await getParentAgent(entry.targetId, exec.signal)
              parent = g.agent
              entry.parentAgent = parent
            }
            // beforeSeq = followup 提交前的 seq 基线：只接受其后的新回复（修复 ask 复读旧文）。
            const beforeSeq = await currentSeq(entry.childId)
            await ctx.subagents.followup(parent, entry.childId, [textBlock(request)], { source, signal: exec.signal })
            const wait = await waitForReply(entry.childId, exec.signal, config.waitTimeoutMs, beforeSeq)
            const reply = wait.reply || (await currentReply(entry.childId))
            return { ok: true, childId: entry.childId, target: entry.targetLabel || target, reply, ...(wait.timedOut && !reply ? { note: '4 分钟内无新增文本回复，可继续 ask 或 stop' } : {}) }
          }
          if (action === 'stop') {
            const entry = await findEntry()
            if (!entry) return { ok: false, note: '本会话没有找到活跃子代理可结束' }
            // 1) 打断当前 turn：用子代理的 durable 直接父（目标会话 id）作为人类父地址，
            //    不依赖父 agent 是否还 live。
            try {
              ctx.subagents.interrupt(entry.childId, { kind: 'user', parentSessionId: entry.targetId })
            } catch (e) {
              // 兜底：父 agent 仍 live 时用 ancestor 形式。
              try {
                ctx.subagents.interrupt(entry.childId, { kind: 'ancestor', agent: entry.parentAgent })
              } catch (e2) { /* ignore */ }
            }
            // 2) 归档删除：从所有分组表面消失，可回收站还原。
            await archiveSession(entry.childId)
            xchatChildren.delete(entry.childId)
            const i = active.findIndex((v) => v.childId === entry.childId)
            if (i >= 0) active.splice(i, 1)
            return { ok: true, childId: entry.childId, target: entry.targetLabel || target, note: '已打断并归档删除子代理' }
          }
          return { ok: false, note: '未知 action: ' + String(action) }
        } catch (e) {
          return { ok: false, note: e && e.message ? String(e.message) : String(e) }
        }
      }
    })
  }
}
