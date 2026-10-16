/** Model-facing creator tools. Only the built-in “Agent 创建助手” preset mounts them. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CreatorGates, accepted, capabilitiesCard, needsCard, promptCard, saveCard, skipped, trialCard, trialSummary } from './gates.mjs'

const json = { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
export const DRAFT = {
  type: 'object', additionalProperties: false, description: 'Agent 草稿；各工具之间传同一个对象。',
  properties: {
    name: { type: 'string', required: true, description: '简短名称' },
    description: { type: 'string', description: '一句话说明这个 Agent 做什么' },
    model: { type: 'object', additionalProperties: false, description: '默认 {"selection":"global"}；指定模型时 selection 为 explicit 并给出 provider 与 model',
      properties: { selection: { type: 'string', enum: ['global', 'explicit'], required: true }, provider: { type: 'string' }, model: { type: 'string' }, reasoningEffort: { type: 'string' } } },
    systemPrompt: { type: 'string', description: '系统提示词，原样使用' },
    plugins: { type: 'array', description: '要启用的插件；id 来自 agent_studio_catalog',
      items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true }, mode: { type: 'string', enum: ['all', 'custom'], required: true, description: 'all：整组启用；custom：只启用 tools 里列出的工具' },
        tools: { type: 'array', items: { type: 'string' } } } } },
    skills: { type: 'array', items: { type: 'string' }, description: 'Skill 名称；会自动带上加载 Skill 的工具' },
  },
}

/** Tool definitions over a Studio owner. Exported for tests that run them without a Host. */
export function creatorTools(owner, gates = new CreatorGates()) {
  const call = (method, args) => owner.dispatch(method, args)
  const session = exec => exec.agent?.id ?? 'direct'
  // The same question service as ask_user_question, so the cards look and answer the same way.
  const ask = async (exec, card) => {
    const questions = owner.ctx.get('userQuestions')
    if (!questions) throw Object.assign(new Error('当前环境无法向用户显示确认卡片。'), { code: 'NO_PROVIDER' })
    const result = await questions.ask({ questions: [card], ...(exec.agent ? { agent: exec.agent } : {}), signal: exec.signal })
    const answer = result.answers.find(item => item.id === card.id) ?? { selected: [] }
    return { selected: [...answer.selected], ...(answer.custom ? { custom: answer.custom } : {}) }
  }
  return [
    defineTool({
      name: 'agent_studio_catalog',
      description: '读取 Agent 工作室当前真实可用的对话模型、插件工具和 Skills，用于为新 Agent 挑选能力。section 可只取一部分；plugin 传插件 id 时返回该插件每个工具的完整说明。只读。',
      parameters: { section: { type: 'string', enum: ['all', 'models', 'plugins', 'skills'] }, plugin: { type: 'string' } },
      output: json, isConcurrencySafe: () => true,
      execute: args => call('creatorCatalog', args),
    }),
    defineTool({
      name: 'agent_studio_check',
      description: '静态检查 Agent 草稿：模型、插件、工具、Skills 是否真实可用，提示词是否缺失或提到未选的工具，能力是否过多或有风险。不调用模型、不花钱。',
      parameters: { draft: { ...DRAFT, required: true } },
      output: json, isConcurrencySafe: () => true,
      execute: args => call('creatorCheck', args.draft),
    }),
    defineTool({
      name: 'agent_studio_write_prompt',
      description: '用工作室的提示词撰写功能，为草稿生成系统提示词初稿或按要求改写（会调用一次模型）。instruction 写清职责、步骤、何时用哪个工具、输出格式与边界；改写时把当前提示词放进 original。',
      parameters: { instruction: { type: 'string', required: true }, draft: { ...DRAFT, required: true }, original: { type: 'string' } },
      output: json,
      execute: (args, exec) => call('draftPrompt', { ...args, signal: exec.signal }),
    }),
    defineTool({
      name: 'agent_studio_confirm',
      description: '向用户显示确认卡片并等待回答。stage 为 needs 时用 points 列出你理解的需求（任务与输入、交付物、边界）；为 capabilities 时列出草稿的模型、插件、工具和 Skills；为 prompt 时展示 points（3～5 条要点）和提示词节选。顺序是 needs → capabilities → prompt；确认能力时草稿还不需要提示词；试跑和保存要求当前草稿的能力和提示词都已确认，草稿改动后需要重新确认。用户选“需要补充”“需要调整”等时按 selected 和 custom 修改。',
      parameters: { stage: { type: 'string', enum: ['needs', 'capabilities', 'prompt'], required: true }, draft: { ...DRAFT, description: 'stage 为 capabilities 或 prompt 时必填' },
        points: { type: 'array', items: { type: 'string' }, description: 'stage 为 needs 时写出理解的需求；为 prompt 时用 3～5 条要点概括提示词' } },
      output: json,
      async execute(args, exec) {
        let card
        if (args.stage === 'needs') {
          if (!args.points?.length) throw Object.assign(new Error('stage 为 needs 时，用 points 写出你理解的需求。'), { code: 'INVALID_REQUEST' })
          card = needsCard(args.points)
        } else {
          if (!args.draft) throw Object.assign(new Error(`stage 为 ${args.stage} 时需要 draft。`), { code: 'INVALID_REQUEST' })
          gates.require(session(exec), null, ['needs'], '确认能力和提示词')
          // Re-asking about an unchanged part only costs the person a click.
          if (!gates.missing(session(exec), args.draft, [args.stage]).length) return { stage: args.stage, confirmed: true, alreadyConfirmed: true }
          // Capabilities come before the prompt exists; only the prompt card needs one.
          const check = await call('creatorCheck', { draft: args.draft, stage: args.stage })
          if (!check.ok) throw Object.assign(new Error('请先修正草稿再请用户确认：' + check.errors.join('；')), { code: 'DRAFT_INVALID' })
          card = args.stage === 'capabilities' ? capabilitiesCard(args.draft, { model: check.summary.modelLabel }) : promptCard(args.draft, args.points)
        }
        const answer = await ask(exec, card)
        const confirmed = accepted(card, answer)
        if (confirmed) gates.record(session(exec), args.stage, args.draft)
        return { stage: args.stage, confirmed, ...answer }
      },
    }),
    defineTool({
      name: 'agent_studio_trial',
      description: '用 1～3 条示例任务试跑草稿。工具会先向用户显示试跑确认卡片（可开始、修改任务或跳过），用户同意才运行并产生费用。要求能力和提示词已确认。只读工具真实执行；可能写入或修改数据的工具只记录调用、不执行（executed 为 false）。返回每条任务的状态、工具调用和回答。',
      parameters: {
        draft: { ...DRAFT, required: true },
        tasks: { type: 'array', required: true, description: '1～3 条示例任务', items: { type: 'object', additionalProperties: false, properties: {
          input: { type: 'string', required: true, description: '用户会对这个 Agent 说的话' }, expectation: { type: 'string', description: '期望它怎么做，用于对照结果' } } } },
        maxSteps: { type: 'integer', description: '每条任务最多几步，默认 8，最多 12' },
      },
      output: json,
      async execute(args, exec) {
        if (!Array.isArray(args.tasks) || args.tasks.length < 1 || args.tasks.length > 3) throw Object.assign(new Error('一次试跑 1～3 条示例任务。'), { code: 'INVALID_REQUEST' })
        gates.require(session(exec), args.draft, ['capabilities', 'prompt'], '试跑')
        const card = trialCard(args.draft, args.tasks), answer = await ask(exec, card)
        if (skipped(card, answer)) { gates.record(session(exec), 'trial', args.draft); return { started: false, skipped: true, ...answer } }
        if (!accepted(card, answer)) return { started: false, ...answer }
        const report = await call('trialDraft', { ...args, signal: exec.signal })
        gates.recordTrial(session(exec), args.draft, trialSummary(report))
        return { started: true, ...report }
      },
    }),
    defineTool({
      name: 'agent_studio_save',
      description: '把草稿保存为 Agent 工作室“我的 Agent”。工具会先向用户显示保存确认卡片。要求能力和提示词已确认，并且已经通过 agent_studio_trial 试跑或由用户选择跳过。修改刚保存过的 Agent 时传 agentId 和 revision。',
      parameters: { draft: { ...DRAFT, required: true }, agentId: { type: 'string' }, revision: { type: 'integer' } },
      output: json,
      async execute(args, exec) {
        gates.require(session(exec), args.draft, ['capabilities', 'prompt', 'trial'], '保存')
        // Checked before asking, so the person is never asked to confirm a draft that cannot be saved.
        const check = await call('creatorCheck', args.draft)
        if (!check.ok) throw Object.assign(new Error('草稿未通过检查：' + check.errors.join('；')), { code: 'DRAFT_INVALID' })
        const card = saveCard(args.draft, gates.trialLines(session(exec), args.draft), { model: check.summary.modelLabel }), answer = await ask(exec, card)
        if (!accepted(card, answer)) return { saved: false, ...answer }
        return { saved: true, ...await call('saveDraft', args) }
      },
    }),
  ]
}

/** Module name of the preset row that registers these tools on the creator Agent (see ./agent.mjs). */
export const CREATOR_ROW = 'dsh-workbench-agent-studio-service/creator-agent'

/**
 * Offer the tools to the creator preset's own row. They are deliberately not
 * registered at Host level: every other Agent would then carry six tool
 * definitions it never uses. One instance, so confirmations are tracked once.
 */
export async function provideCreator(ctx, owner) {
  const tools = Object.freeze(creatorTools(owner))
  await ctx.effect(() => ctx.provide('agentStudioCreator', Object.freeze({ tools: () => tools })))
}
