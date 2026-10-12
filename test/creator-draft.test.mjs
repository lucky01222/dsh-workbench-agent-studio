import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDraft, draftToDefinition, groupPlugins, summary } from '../packages/service/src/creator/draft.mjs'

const row = (name, pluginId, description = name) => ({ name, pluginId, description })
const rows = [row('read', '@deepseek-ai/dsh-tool-fs'), row('write', '@deepseek-ai/dsh-tool-fs'), row('skill', '@deepseek-ai/dsh-tool-skill'),
  row('library_search', 'dsh-workbench-library', '检索资料。返回命中与引用。'), row('library_read', 'dsh-workbench-library'), row('agent_studio_save', 'dsh-workbench-agent-studio')]
const facts = { rows, skills: [{ name: 'library-knowledge' }], models: [{ id: 'deepseek-official', models: [{ id: 'deepseek-v4-pro' }] }], defaultModel: { provider: 'deepseek-official', model: 'deepseek-v4-pro' } }
const draft = (extra = {}) => ({ name: '资料问答', description: '回答资料库里的问题', model: { selection: 'global' }, systemPrompt: '先用 library_search 检索，再回答。', plugins: [{ id: 'dsh-workbench-library', mode: 'all' }], skills: [], ...extra })

test('a draft becomes a Studio definition with plugin bindings; Skills bring the skill loader', () => {
  const definition = draftToDefinition(draft({ skills: ['library-knowledge'], plugins: [{ id: 'dsh-workbench-library', mode: 'custom', tools: ['library_search', 'library_search'] }] }))
  assert.equal(definition.modelSelection, 'global'); assert.equal(definition.promptMode, 'literal')
  assert.deepEqual(definition.pluginBindings, { 'dsh-workbench-library': { enabled: true, mode: 'custom', tools: ['library_search'] }, '@deepseek-ai/dsh-tool-skill': { enabled: true, mode: 'custom', tools: ['skill'] } })
  assert.deepEqual(definition.tools, ['library_search', 'skill'])
  assert.equal(draftToDefinition(draft({ model: { selection: 'explicit', provider: 'p' } })).modelSelection, 'global', 'an explicit model needs both provider and model')
})

test('a complete draft passes; errors name the missing or foreign parts', () => {
  assert.deepEqual(checkDraft(draft(), facts).errors, [])
  const bad = checkDraft(draft({ name: ' ', systemPrompt: '', model: { selection: 'explicit', provider: 'dmxapi', model: 'kling-v3' },
    plugins: [{ id: 'dsh-workbench-library', mode: 'custom', tools: ['read', 'nope'] }, { id: 'ghost', mode: 'all' }], skills: ['missing-skill'] }), facts)
  assert.equal(bad.ok, false)
  for (const fragment of ['缺少名称', '缺少系统提示词', 'kling-v3', '工具 read 属于 文件读写', '工具 nope 不存在', '插件 ghost', 'Skill missing-skill']) assert.ok(bad.errors.some(text => text.includes(fragment)), fragment)
  assert.ok(checkDraft(draft({ plugins: [{ id: 'dsh-workbench-library', mode: 'custom', tools: [] }] }), facts).errors.some(text => text.includes('没有列出工具')))
  assert.ok(checkDraft(draft(), { ...facts, defaultModel: null }).errors.some(text => text.includes('全局默认模型')))
})

test('warnings cover a missing description, prompt references to unselected tools and risky tools', () => {
  const result = checkDraft(draft({ description: '', systemPrompt: '用 read 读文件，再用 library_search 检索', plugins: [{ id: '@deepseek-ai/dsh-tool-fs', mode: 'custom', tools: ['write'] }] }), facts)
  assert.equal(result.ok, true)
  assert.ok(result.warnings.some(text => text.includes('用途描述')))
  assert.ok(result.warnings.some(text => text.includes('read') && text.includes('library_search') && text.includes('没有选择')))
  assert.ok(result.warnings.some(text => text.includes('write')))
  assert.ok(checkDraft(draft({ plugins: [] }), facts).warnings.some(text => text.includes('只能对话')))
})

test('the catalog groups tools by plugin with readable titles and leaves out the creator tools', () => {
  const groups = groupPlugins(rows, { exclude: ['agent_studio_save'] })
  assert.deepEqual(groups.map(group => group.id), ['dsh-workbench-library', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-skill'])
  assert.equal(groups[0].title, '资料库'); assert.equal(groups[0].tools[0].summary, '检索资料。')
  assert.equal(summary('x'.repeat(200)).length, 110)
})

test('trials execute only tools known to read; anything that might write is recorded instead', async () => {
  const { isReadOnlyTool, unexecutedResult, UNEXECUTED } = await import('../packages/service/src/creator/safety.mjs')
  for (const name of ['read', 'grep', 'web_fetch', 'library_search', 'univer_inspect', 'mcp__openviking__search', 'mcp__openviking__list_users', 'mcp__openviking__get_acl']) assert.equal(isReadOnlyTool(name), true, name)
  for (const name of ['write', 'bash', 'library_correct', 'univer_execute', 'subagent', 'todo_write', 'mcp__openviking__set_acl', 'mcp__openviking__add_resource', 'mcp__x__list_and_delete', 'search_and_replace']) assert.equal(isReadOnlyTool(name), false, name)
  assert.ok(unexecutedResult('write').text.startsWith(UNEXECUTED))
})

test('checkpoint keys follow what each card shows: wording leaves capabilities confirmed, any change needs a new trial decision', async () => {
  const { draftKeys, CreatorGates, capabilitiesCard, promptCard, trialCard, accepted, skipped } = await import('../packages/service/src/creator/gates.mjs')
  const base = draftKeys(draft()), reworded = draftKeys(draft({ systemPrompt: '换个说法' })), wider = draftKeys(draft({ skills: ['library-knowledge'] }))
  assert.equal(reworded.capabilities, base.capabilities); assert.notEqual(reworded.prompt, base.prompt); assert.notEqual(reworded.trial, base.trial)
  assert.notEqual(wider.capabilities, base.capabilities)
  assert.equal(draftKeys(draft({ plugins: [{ id: 'dsh-workbench-library', mode: 'custom', tools: ['library_read', 'library_search'] }] })).capabilities,
    draftKeys(draft({ plugins: [{ id: 'dsh-workbench-library', mode: 'custom', tools: ['library_search', 'library_read'] }] })).capabilities, 'tool order is not a change')
  const gates = new CreatorGates(2)
  gates.record('a', 'capabilities', draft()); gates.record('a', 'prompt', draft())
  assert.deepEqual(gates.missing('a', draft({ systemPrompt: '换个说法' }), ['capabilities', 'prompt']), ['prompt'])
  assert.deepEqual(gates.missing('b', draft(), ['capabilities']), ['capabilities'], 'confirmations belong to one conversation')
  gates.record('b', 'trial', draft()); gates.record('c', 'trial', draft())
  assert.deepEqual(gates.missing('a', draft(), ['capabilities']), ['capabilities'], 'the oldest conversation is dropped beyond the limit')
  const risky = capabilitiesCard(draft({ plugins: [{ id: '@deepseek-ai/dsh-tool-fs', mode: 'custom', tools: ['write'] }] }))
  assert.match(risky.detail, /⚠ write/)
  assert.match(promptCard(draft({ systemPrompt: 'x'.repeat(700) }), ['要点一']).detail, /要点一[\s\S]*共 700 字/)
  const trial = trialCard(draft(), [{ input: '问题', expectation: '先检索' }])
  assert.equal(accepted(trial, { selected: ['开始试跑（推荐）'] }), true); assert.equal(skipped(trial, { selected: ['跳过试跑'] }), true)
  assert.equal(accepted(trial, { selected: [], custom: '换个任务' }), false)
})

test('capabilities are checked and shown before a prompt exists, in the names the person knows', async () => {
  const { checkDraft, modelLabel, toolLabel } = await import('../packages/service/src/creator/draft.mjs')
  const { capabilitiesCard, saveCard } = await import('../packages/service/src/creator/gates.mjs')
  const rows = [{ name: 'mcp__openviking__search', pluginId: '@openviking/dsh-memory-plugin', description: '' }]
  const models = [{ id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-x', name: 'GPT-X' }] }], defaultModel = { provider: 'openai', model: 'gpt-x' }
  const unwritten = { name: '主题简报', model: { selection: 'global' }, plugins: [{ id: '@openviking/dsh-memory-plugin', mode: 'custom', tools: ['mcp__openviking__search'] }] }
  assert.ok(checkDraft(unwritten, { rows, models, defaultModel }).errors.includes('缺少系统提示词。'))
  const staged = checkDraft(unwritten, { rows, models, defaultModel }, { stage: 'capabilities' })
  assert.deepEqual(staged.errors, [])
  assert.ok(checkDraft({ ...unwritten, name: '' }, { rows, models, defaultModel }, { stage: 'capabilities' }).errors.includes('缺少名称。'))
  assert.equal(modelLabel(staged.definition, { models, defaultModel }), '全局默认（GPT-X）')
  assert.equal(modelLabel({ modelSelection: 'explicit', provider: 'openai', model: 'gpt-x' }, { models }), 'OpenAI / GPT-X')
  assert.equal(toolLabel('mcp__openviking__get_acl'), 'get_acl'); assert.equal(toolLabel('library_search'), 'library_search')
  const card = capabilitiesCard(unwritten, { model: '全局默认（GPT-X）' })
  assert.ok(card.detail.includes('- **模型**：全局默认（GPT-X）'))
  assert.ok(card.detail.includes('**@openviking/dsh-memory-plugin**：search')); assert.equal(card.detail.includes('mcp__'), false)
  assert.ok(saveCard({ ...unwritten, systemPrompt: 'x' }, [], { model: '全局默认（GPT-X）' }).detail.includes('全局默认（GPT-X）'))
})

