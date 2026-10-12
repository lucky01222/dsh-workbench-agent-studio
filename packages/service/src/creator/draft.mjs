/**
 * Draft Agents as the creator tools see them, and the static checks run before
 * a trial or a save. Pure: catalog rows, models and skills are passed in.
 */
import { KNOWN_PLUGIN_CONTRACTS } from '../../../ui/src/client/plugin-capabilities.mjs'

const SKILL_PLUGIN = '@deepseek-ai/dsh-tool-skill'
const UNASSIGNED = 'unassigned'
const PROMPT_VARIABLE = /\{\{\s*[\w.-]+\s*\}\}/
const unique = values => [...new Set(values)]
const contracts = new Map(KNOWN_PLUGIN_CONTRACTS.map(plugin => [plugin.id, plugin]))

/** First sentence, capped, so a catalog of ~80 tools stays readable for the model. */
export function summary(text = '', max = 110) {
  const flat = String(text).replace(/\s+/g, ' ').trim()
  const sentence = flat.split(/(?<=[。.!?！？；;])\s*/)[0] || flat
  return sentence.length > max ? sentence.slice(0, max - 1) + '…' : sentence
}

export function pluginTitle(id) {
  const known = contracts.get(id)
  return known ? { title: known.name, description: known.description } : { title: id === UNASSIGNED ? '未识别归属' : id, description: '' }
}

/** Catalog rows grouped by owning plugin, with the creator's own tools left out. */
export function groupPlugins(rows, { exclude = [] } = {}) {
  const groups = new Map()
  for (const row of rows) {
    if (exclude.includes(row.name) || row.name === 'run_code') continue
    const id = row.pluginId || UNASSIGNED
    if (!groups.has(id)) groups.set(id, { id, ...pluginTitle(id), origin: id.startsWith('@deepseek-ai/') ? 'official' : id === UNASSIGNED ? 'unassigned' : 'custom', tools: [] })
    groups.get(id).tools.push({ name: row.name, summary: summary(row.description, 80), ...(row.unavailable ? { unavailable: true } : {}) })
  }
  return [...groups.values()].sort((a, b) => (a.origin === b.origin ? 0 : a.origin === 'custom' ? -1 : b.origin === 'custom' ? 1 : a.origin === 'official' ? -1 : 1))
}

/**
 * Draft → Studio Definition. Plugins become bindings. An `all` binding lists the
 * plugin's current tools, as the editor does; an empty one reads as a legacy
 * Library binding and is refused on save.
 */
export function draftToDefinition(draft, rows = []) {
  const owned = id => rows.filter(row => (row.pluginId || UNASSIGNED) === id && !row.unavailable).map(row => row.name)
  const plugins = (draft.plugins || []).map(plugin => plugin.mode === 'custom'
    ? { id: plugin.id, mode: 'custom', tools: unique(plugin.tools || []) }
    : { id: plugin.id, mode: 'all', tools: unique([...owned(plugin.id), ...(plugin.tools || [])]) })
  const skills = unique(draft.skills || [])
  if (skills.length && !plugins.some(plugin => plugin.id === SKILL_PLUGIN)) plugins.push({ id: SKILL_PLUGIN, mode: 'custom', tools: ['skill'] })
  const model = draft.model || {}
  const explicit = model.selection === 'explicit' && model.provider && model.model
  return {
    name: String(draft.name || '').trim(), description: String(draft.description || ''),
    modelSelection: explicit ? 'explicit' : 'global', provider: explicit ? model.provider : '', model: explicit ? model.model : '',
    ...(explicit && model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
    promptMode: 'literal', connectorBindings: {}, systemPrompt: String(draft.systemPrompt || ''),
    tools: unique(plugins.flatMap(plugin => plugin.tools)), skills,
    pluginBindings: Object.fromEntries(plugins.map(plugin => [plugin.id, { enabled: true, mode: plugin.mode, tools: plugin.tools }])),
  }
}

/**
 * Static checks that cost nothing. Errors block a trial or a save; warnings are
 * for the person. `rows` are catalog tool rows, `models` the chat model groups.
 * `stage: 'capabilities'` checks a draft that has no prompt yet.
 */
export function checkDraft(draft, { rows = [], skills = [], models = [], defaultModel } = {}, { stage } = {}) {
  const errors = [], warnings = []
  const definition = draftToDefinition(draft, rows)
  const byName = new Map(rows.map(row => [row.name, row]))
  if (!definition.name) errors.push('缺少名称。')
  else if (definition.name.length > 40) warnings.push('名称超过 40 个字，列表里会被截断。')
  if (!definition.description.trim()) warnings.push('缺少用途描述。以后在 Agent 列表和切换时，靠它说明这个 Agent 做什么。')
  if (definition.modelSelection === 'global') {
    if (!defaultModel?.provider || !defaultModel?.model) errors.push('没有可用的全局默认模型，请明确指定一个对话模型。')
  } else {
    const group = models.find(item => item.id === definition.provider)
    if (!group?.models.some(item => item.id === definition.model)) errors.push(`模型 ${definition.provider}/${definition.model} 不在可用的对话模型里。`)
  }
  // Capabilities are confirmed before the prompt is written, so its absence is not yet an error.
  if (!definition.systemPrompt.trim()) { if (stage !== 'capabilities') errors.push('缺少系统提示词。') }
  else if (PROMPT_VARIABLE.test(definition.systemPrompt)) warnings.push('提示词里有 {{…}} 形式的文字，它会原样发给模型，不会被替换。')
  const plugins = Object.entries(definition.pluginBindings)
  if (!plugins.length) warnings.push('没有选择任何插件工具。这个 Agent 只能对话，不能读文件、检索或调用其他能力。')
  for (const [id, binding] of plugins) {
    const owned = rows.filter(row => (row.pluginId || UNASSIGNED) === id)
    if (!owned.length) { errors.push(`插件 ${id} 当前不可用或不存在。`); continue }
    if (binding.mode === 'custom' && !binding.tools.length) errors.push(`插件 ${pluginTitle(id).title} 选了自定义范围，但没有列出工具。`)
    for (const name of binding.tools) {
      const row = byName.get(name)
      if (!row) errors.push(`工具 ${name} 不存在。`)
      else if ((row.pluginId || UNASSIGNED) !== id) errors.push(`工具 ${name} 属于 ${pluginTitle(row.pluginId || UNASSIGNED).title}，不属于 ${pluginTitle(id).title}。`)
      else if (row.unavailable) errors.push(`工具 ${name} 当前不可用：${row.unavailable}`)
    }
  }
  const known = new Set(skills.map(skill => skill.name))
  for (const name of definition.skills) if (!known.has(name)) errors.push(`Skill ${name} 不存在。`)
  const selectedTools = new Set(plugins.flatMap(([id, binding]) => binding.mode === 'all' ? rows.filter(row => (row.pluginId || UNASSIGNED) === id).map(row => row.name) : binding.tools))
  if (selectedTools.size > 40) warnings.push(`一共 ${selectedTools.size} 个工具，偏多。工具越多，模型越容易选错；只保留用得上的插件。`)
  // Tool names written into the prompt that the Agent will not actually have.
  const mentioned = rows.map(row => row.name).filter(name => name.length > 3 && !selectedTools.has(name) && new RegExp(`(^|[^\\w])${name}([^\\w]|$)`).test(definition.systemPrompt))
  if (mentioned.length) warnings.push(`提示词提到了没有选择的工具：${unique(mentioned).join('、')}。要么选上，要么从提示词里删掉。`)
  const risky = [...selectedTools].filter(name => ['bash', 'write', 'edit', 'str_replace_editor', 'library_correct', 'library_undo', 'library_ingest', 'univer_execute', 'job_kill', 'interrupt_agent'].includes(name))
  if (risky.length) warnings.push(`包含会修改文件、数据或执行命令的工具：${risky.join('、')}。确认这个 Agent 确实需要。`)
  return { ok: errors.length === 0, errors, warnings, definition }
}

/** How a card names the model: the actual model behind “global default”, and display names where known. */
export function modelLabel(definition, { models = [], defaultModel } = {}) {
  const name = (provider, model) => models.find(group => group.id === provider)?.models.find(item => item.id === model)?.name || model
  if (definition.modelSelection === 'global') return defaultModel?.model ? `全局默认（${name(defaultModel.provider, defaultModel.model)}）` : '全局默认'
  return `${models.find(group => group.id === definition.provider)?.name || definition.provider} / ${name(definition.provider, definition.model)}`
}

/** `mcp__server__tool` reads as `tool` on a card that already names the plugin. */
export const toolLabel = name => String(name).replace(/^mcp__[^_]+(?:_[^_]+)*__/, '')

