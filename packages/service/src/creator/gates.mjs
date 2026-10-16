/**
 * Checkpoints the creator cannot skip. A model tends to build everything and ask
 * once at the end; trial and save therefore require the person to have confirmed
 * this exact draft's capabilities and prompt (and, for save, decided on a trial)
 * through cards the tools show themselves.
 */
import { createHash } from 'node:crypto'
import { draftToDefinition, pluginTitle, toolLabel } from './draft.mjs'

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const RISKY = new Set(['bash', 'write', 'edit', 'str_replace_editor', 'library_correct', 'library_undo', 'library_ingest', 'univer_execute', 'job_kill'])

/** Keys per stage. Capabilities ignore prompt wording; the trial key covers both. */
export function draftKeys(draft) {
  const definition = draftToDefinition(draft)
  const capabilities = digest({ model: [definition.modelSelection, definition.provider, definition.model],
    plugins: Object.entries(definition.pluginBindings).sort(([a], [b]) => a.localeCompare(b)).map(([id, binding]) => [id, binding.mode, [...binding.tools].sort()]),
    skills: [...definition.skills].sort() })
  const prompt = digest({ name: definition.name, description: definition.description, prompt: definition.systemPrompt })
  return { capabilities, prompt, trial: digest([capabilities, prompt]) }
}

const STAGE_NAMES = { needs: '需求', capabilities: '能力（模型、插件、Skills）', prompt: '提示词', trial: '是否试跑' }
const GUIDANCE = { needs: '调用 agent_studio_confirm（stage: needs），用 points 写出你理解的需求', capabilities: '调用 agent_studio_confirm（stage: capabilities）', prompt: '调用 agent_studio_confirm（stage: prompt）', trial: '调用 agent_studio_trial，由用户选择试跑或跳过' }

/** Confirmations per conversation, bounded; a restart only means confirming again. */
export class CreatorGates {
  constructor(limit = 200) { this.sessions = new Map(); this.limit = limit }
  state(session) {
    const value = this.sessions.get(session) ?? {}
    this.sessions.delete(session); this.sessions.set(session, value)
    while (this.sessions.size > this.limit) this.sessions.delete(this.sessions.keys().next().value)
    return value
  }
  /** Needs belong to the conversation; the other stages to the exact draft. */
  record(session, stage, draft) { this.state(session)[stage] = stage === 'needs' ? true : draftKeys(draft)[stage] }
  /** The last trial's summary, shown on the save card while the draft is unchanged. */
  recordTrial(session, draft, lines) { const state = this.state(session); state.trial = draftKeys(draft).trial; state.trialLines = { key: state.trial, lines } }
  trialLines(session, draft) { const value = this.sessions.get(session)?.trialLines; return value?.key === draftKeys(draft).trial ? value.lines : [] }
  missing(session, draft, stages) {
    const state = this.sessions.get(session) ?? {}, keys = draft ? draftKeys(draft) : {}
    return stages.filter(stage => stage === 'needs' ? state.needs !== true : state[stage] !== keys[stage])
  }
  /** Throws a message that tells the model exactly which card to show next. */
  require(session, draft, stages, action) {
    const missing = this.missing(session, draft, stages)
    if (missing.length) throw Object.assign(new Error(`${action}前需要用户确认当前草稿的${missing.map(stage => STAGE_NAMES[stage]).join('、')}。请${missing.map(stage => GUIDANCE[stage]).join('，再')}。草稿改动后需要重新确认。`), { code: 'CONFIRMATION_REQUIRED' })
  }
}

/** `labels.model` is the checked draft's model as the person knows it (see `modelLabel`). */
function capabilityLines(draft, labels = {}) {
  const definition = draftToDefinition(draft)
  const model = labels.model || (definition.modelSelection === 'global' ? '全局默认' : `${definition.provider} / ${definition.model}`)
  const plugins = Object.entries(definition.pluginBindings).map(([id, binding]) => {
    const risky = binding.tools.filter(name => RISKY.has(name))
    return `- **${pluginTitle(id).title}**：${binding.mode === 'all' ? '全部工具' : binding.tools.map(toolLabel).join('、')}${risky.length ? `（⚠ ${risky.join('、')} 会修改文件、数据或执行命令）` : ''}`
  })
  return [`- **模型**：${model}`, ...(plugins.length ? plugins : ['- **插件**：无（只能对话）']), `- **Skills**：${definition.skills.length ? definition.skills.join('、') : '无'}`]
}

const options = (...items) => items.map(([label, description]) => ({ label, ...(description ? { description } : {}) }))

export function needsCard(points) {
  return { id: 'needs', header: '确认需求', question: '我理解的需求是这样，对吗？', detail: points.map(point => `- ${point}`).join('\n'),
    options: options(['对，就是这样（推荐）', '按这个理解挑选能力'], ['需要补充', '说明要补充或纠正的地方']) }
}

export function capabilitiesCard(draft, labels) {
  return { id: 'capabilities', header: '确认能力', question: `「${draft.name}」用下面这些能力，可以吗？`, detail: capabilityLines(draft, labels).join('\n'),
    options: options(['确认这些能力（推荐）', '进入下一步'], ['需要调整', '说明要增加或去掉什么']) }
}

export function promptCard(draft, points = []) {
  const prompt = String(draft.systemPrompt || '')
  const excerpt = prompt.length > 600 ? prompt.slice(0, 600) + '……' : prompt
  const detail = [...(points.length ? ['**要点**', ...points.map(point => `- ${point}`), ''] : []),
    `**提示词节选**（共 ${prompt.length} 字）`, ...excerpt.split('\n').map(line => `> ${line}`)].join('\n')
  return { id: 'prompt', header: '确认提示词', question: `「${draft.name}」的提示词这样写可以吗？`, detail,
    options: options(['可以了（推荐）'], ['更简洁'], ['更严格'], ['需要补充', '说明要补充的内容']) }
}

export function trialCard(draft, tasks) {
  const detail = tasks.map((task, index) => `${index + 1}. ${task.input}${task.expectation ? `\n   期望：${task.expectation}` : ''}`).join('\n')
  return { id: 'trial', header: '试跑', question: `用这些示例任务试跑「${draft.name}」吗？试跑会调用模型、产生费用。`, detail,
    options: options(['开始试跑（推荐）', '只读工具真实执行，写入类工具只记录不执行'], ['修改示例任务'], ['跳过试跑', '不试跑，直接进入保存确认']) }
}

export function saveCard(draft, trialLines = [], labels) {
  return { id: 'save', header: '保存', question: `把「${draft.name}」保存到“我的 Agent”吗？`,
    detail: [`- **用途**：${draft.description || '（未填写）'}`, ...capabilityLines(draft, labels), '', '**试跑**', ...(trialLines.length ? trialLines : ['- 已跳过'])].join('\n'),
    options: options(['确认保存（推荐）'], ['先不保存', '继续调整']) }
}

/** The first option of every card is the “yes” answer. */
export const accepted = (card, answer) => answer.selected[0] === card.options[0].label
export const skipped = (card, answer) => card.id === 'trial' && answer.selected[0] === card.options[2].label

/** One line per sample task for the save card: outcome, tools (✓ ran, ○ recorded only), answer excerpt. */
export function trialSummary(report) {
  return report.runs.map((run, index) => {
    const tools = run.toolCalls.map(call => `${call.name}${call.executed ? (call.error ? ' ✗' : ' ✓') : ' ○'}`).join('、') || '未调用工具'
    const outcome = run.status === 'succeeded' ? '完成' : run.askedUser ? '停下来向用户提问' : run.status === 'failed' ? `失败：${run.error || ''}` : run.status
    const answer = run.answer.replace(/\s+/g, ' ').slice(0, 80)
    return `${index + 1}. ${outcome}；工具：${tools}${answer ? `；回答：${answer}${run.answer.length > 80 ? '…' : ''}` : ''}`
  }).concat(['（✓ 已执行，○ 只记录未执行，✗ 出错）'])
}
