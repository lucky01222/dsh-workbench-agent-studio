import test from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { StudioService } from '../packages/service/src/service.mjs'
import { creatorTools, provideCreator, CREATOR_ROW } from '../packages/service/src/creator/tools.mjs'
import * as creatorAgent from '../packages/service/src/creator/agent.mjs'
import { CREATOR_PRESET_ID, CREATOR_TOOLS } from '../packages/service/src/creator/operations.mjs'

const row = (name, pluginId, description = name) => ({ name, pluginId, description, pluginVersion: '1.0.0' })
const flat = rows => rows.flatMap(item => item.group && Array.isArray(item.config) ? flat(item.config) : [item])
const draft = (extra = {}) => ({ name: '资料问答', description: '回答资料库里的问题', model: { selection: 'global' }, systemPrompt: '先检索，再回答。', plugins: [{ id: 'dsh-workbench-library', mode: 'all' }], skills: ['library-knowledge'], ...extra })

// Cards are answered from `replies` (card id → option index or { selected, custom }); otherwise the first option.
function harness({ text = '你是资料问答助手。', replies = {} } = {}) {
  const stores = new Map(), registrations = [], streams = [], cards = []
  const questions = { ask: async ({ questions: [card] }) => { cards.push(card); const reply = replies[card.id] ?? 0; return { answers: [{ id: card.id, ...(typeof reply === 'number' ? { selected: [card.options[reply].label] } : reply) }] } } }
  const table = name => {
    if (!stores.has(name)) stores.set(name, new Map())
    const data = stores.get(name)
    return { get: id => data.get(id), entries: () => data.entries(), put: async (id, value) => { data.set(id, structuredClone(value)) } }
  }
  const service = new StudioService({
    agentPresets: { register: async value => { registrations.push(structuredClone(value)); return async () => {} },
      readDocument: async id => ({ name: registrations.find(item => item.id === id)?.name, content: yaml.dump(registrations.find(item => item.id === id).plugins, { schema: entryListSchema }) }) },
    llm: { resolveCallConfig: async () => ({}), listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'dmxapi', name: 'DMXAPI' }],
      listModels: async id => id === 'dmxapi' ? [{ id: 'kling-v3', name: 'kling-v3' }] : [{ id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' }],
      stream: async function* (request) { streams.push(request); yield { type: 'text-delta', text }; yield { type: 'finish', reason: { kind: 'stop' } } } },
    get: name => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) } : name === 'userQuestions' ? questions : undefined,
  })
  service.domain = { table, close: async () => {} }
  service.cwd = '/fixture'
  service.catalog = async () => ({ tools: [row('library_search', 'dsh-workbench-library'), row('library_read', 'dsh-workbench-library'), row('skill', '@deepseek-ai/dsh-tool-skill'),
    row('ask_user_question', '@deepseek-ai/dsh-tool-ask-user'), ...CREATOR_TOOLS.map(name => row(name, 'dsh-workbench-agent-studio'))],
    skills: [{ name: 'library-knowledge', description: '查找和核对资料库知识', source: 'bundled', owner: 'dsh-workbench-library' }] })
  const tools = Object.fromEntries(creatorTools(service).map(tool => [tool.name, tool]))
  const run = (name, args) => tools[name].execute(args, { signal: new AbortController().signal })
  const confirmAll = async value => { await run('agent_studio_confirm', { stage: 'needs', points: ['回答资料库问题'] }); await run('agent_studio_confirm', { stage: 'capabilities', draft: value }); await run('agent_studio_confirm', { stage: 'prompt', draft: value, points: ['先检索'] }) }
  return { service, registrations, streams, table, tools, run, cards, confirmAll }
}

test('the creator tools compile with the official defineTool and register with the Skill until disposed', async () => {
  const { service, tools } = harness()
  assert.deepEqual(Object.keys(tools), CREATOR_TOOLS)
  for (const tool of Object.values(tools)) assert.ok(tool.output && tool.description.length > 20 && tool.parameters)
  // Nothing is registered at Host level: the tools are offered as a service and only the creator preset's row mounts them.
  const provided = {}, host = { provide: (name, value) => { provided[name] = value; return () => { delete provided[name] } }, effect: async factory => { host.cleanup = await factory() },
    tools: { register() { throw new Error('creator tools must not be registered at Host level') } }, skills: { register() { throw new Error('no creator Skill at Host level') } } }
  await provideCreator(host, service)
  assert.deepEqual(provided.agentStudioCreator.tools().map(tool => tool.name), CREATOR_TOOLS)
  assert.equal(provided.agentStudioCreator.tools(), provided.agentStudioCreator.tools(), 'one instance keeps one record of confirmations')
  const mounted = []
  assert.deepEqual(creatorAgent.inject, ['tools', 'agentStudioCreator'])
  creatorAgent.apply({ agentStudioCreator: provided.agentStudioCreator, tools: { register: tool => mounted.push(tool.name) } })
  assert.deepEqual(mounted, CREATOR_TOOLS)
  host.cleanup(); assert.equal(provided.agentStudioCreator, undefined)
})

test('catalog lists chat models, plugins without the creator tools, Skills by source, and one plugin in full', async () => {
  const { run } = harness()
  const all = await run('agent_studio_catalog', {})
  assert.deepEqual(all.defaultModel, { provider: 'deepseek-official', model: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' })
  assert.deepEqual(all.models.map(group => group.provider), ['deepseek-official'], 'media-only providers are not offered')
  assert.equal(all.plugins.some(plugin => plugin.tools.some(tool => tool.name.startsWith('agent_studio_'))), false)
  assert.equal(all.plugins.find(plugin => plugin.id === 'dsh-workbench-library').title, '资料库')
  assert.deepEqual(all.skills, [{ name: 'library-knowledge', group: '资料库', summary: '查找和核对资料库知识' }])
  assert.deepEqual(Object.keys(await run('agent_studio_catalog', { section: 'skills' })), ['skills'])
  assert.equal((await run('agent_studio_catalog', { plugin: 'dsh-workbench-library' })).plugin.tools.length, 2)
  await assert.rejects(run('agent_studio_catalog', { plugin: 'ghost' }), /没有找到插件 ghost/)
})

test('check reports problems before anything is saved and agrees with the save-time resolution', async () => {
  const { run, table } = harness()
  const ok = await run('agent_studio_check', { draft: draft() })
  assert.equal(ok.ok, true); assert.deepEqual(ok.summary.plugins, ['资料库（全部工具）', 'Skills（skill）'])
  const bad = await run('agent_studio_check', { draft: draft({ plugins: [{ id: 'dsh-workbench-library', mode: 'custom', tools: ['library_graph'] }] }) })
  assert.equal(bad.ok, false); assert.ok(bad.errors.some(text => text.includes('library_graph')))
  assert.equal([...table('agents').entries()].length, 0)
})

test('write_prompt uses the Studio writer on an unsaved draft with the default model', async () => {
  const { run, streams } = harness()
  const result = await run('agent_studio_write_prompt', { instruction: '回答资料库问题', draft: draft() })
  assert.deepEqual(result, { prompt: '你是资料问答助手。', model: 'deepseek-official/deepseek-v4-pro' })
  assert.equal(streams[0].provider, 'deepseek-official')
  assert.deepEqual(JSON.parse(streams[0].messages[0].content[0].text).skills, ['library-knowledge'])
})

test('save creates a “my Agent” with expanded bindings, updates it by revision, and refuses an invalid draft', async () => {
  const { run, table, registrations, confirmAll } = harness({ replies: { trial: 2 } })
  await confirmAll(draft())
  assert.equal((await run('agent_studio_trial', { draft: draft(), tasks: [{ input: '1' }] })).skipped, true)
  const saved = await run('agent_studio_save', { draft: draft() })
  assert.equal(saved.saved, true)
  const doc = table('agents').get(saved.agentId)
  assert.equal(saved.revision, 2); assert.equal(saved.presetId, `wb-studio-${saved.agentId}`)
  assert.deepEqual(doc.definition.pluginBindings['dsh-workbench-library'], { enabled: true, mode: 'all', tools: ['library_search', 'library_read'] })
  assert.deepEqual(doc.definition.skills, ['library-knowledge']); assert.ok(registrations.some(item => item.id === saved.presetId))
  await confirmAll(draft({ name: '资料问答 2' })); await run('agent_studio_trial', { draft: draft({ name: '资料问答 2' }), tasks: [{ input: '1' }] })
  const updated = await run('agent_studio_save', { draft: draft({ name: '资料问答 2' }), agentId: saved.agentId, revision: saved.revision })
  assert.equal(updated.revision, 3); assert.equal(table('agents').get(saved.agentId).definition.name, '资料问答 2')
  await assert.rejects(run('agent_studio_save', { draft: draft({ systemPrompt: '' }) }), /需要用户确认/)
  await assert.rejects(run('agent_studio_save', { draft: draft({ name: '资料问答 2' }), agentId: saved.agentId }), /revision/)
  assert.equal([...table('agents').entries()].filter(([, value]) => !value.deleted).length, 1)
})

test('the built-in creator is a Studio-composed preset; reading it yields its definition, so copies are plain Agents', async () => {
  const { service, registrations } = harness()
  await service.registerCreator()
  const preset = registrations.find(item => item.id === CREATOR_PRESET_ID)
  assert.equal(preset.name, 'Agent 创建助手')
  const rows = flat(preset.plugins)
  assert.ok(rows.some(item => item.name === '@deepseek-ai/dsh-tool-ask-user'))
  const policy = rows.find(item => item.name === 'dsh-workbench-agent-studio-runtime')
  // The creator's tools are mounted by its own row, placed before the policy that selects them.
  assert.ok(rows.findIndex(item => item.name === CREATOR_ROW) >= 0 && rows.findIndex(item => item.name === CREATOR_ROW) < rows.indexOf(policy))
  assert.deepEqual(policy.config.definition.tools, ['ask_user_question', ...CREATOR_TOOLS])
  const read = await service.readPreset(CREATOR_PRESET_ID, '/fixture')
  assert.equal(read.baseYaml, undefined); assert.equal(read.definition.name, 'Agent 创建助手')
  assert.ok(read.definition.systemPrompt.includes('agent_studio_check'))
})

test('catalog adds the tools a built-in preset mounts on its own, with their real owners', async () => {
  const { service, registrations } = harness()
  registrations.push({ id: 'standard', name: 'standard', plugins: [{ id: 'tool-present', name: '@deepseek-ai/dsh-tool-present' }] })
  const probed = []
  service.catalogRows = async (cwd, rows) => { probed.push(rows); return { tools: [row('library_search', 'dsh-workbench-library'), row('present', '@deepseek-ai/dsh-tool-present'), row('run_code', 'x')], skills: [] } }
  assert.equal((await service.doDispatch('catalog', { cwd: '/fixture' })).tools.some(tool => tool.name === 'present'), false)
  const inherited = await service.doDispatch('catalog', { cwd: '/fixture', source: 'standard' })
  assert.equal(inherited.tools.find(tool => tool.name === 'present').pluginId, '@deepseek-ai/dsh-tool-present')
  assert.equal(inherited.tools.filter(tool => tool.name === 'library_search').length, 1)
  assert.equal(inherited.tools.some(tool => tool.name === 'run_code'), false)
  // Skills that only this composition provides arrive the same way.
  service.catalogRows = async () => ({ tools: [], skills: [{ name: 'library-knowledge', description: 'known' }, { name: 'cordis-plugin-development', description: 'own' }] })
  assert.deepEqual((await service.doDispatch('catalog', { cwd: '/fixture', source: 'standard' })).skills.map(skill => skill.name), ['library-knowledge', 'cordis-plugin-development'])
  service.catalogRows = async (cwd, rows) => { probed.push(rows); return { tools: [], skills: [] } }
  // The creator's tools exist only in its own composition, so it is probed too, without the policy row that selects them.
  await service.registerCreator(); probed.length = 0
  await service.doDispatch('catalog', { cwd: '/fixture', source: CREATOR_PRESET_ID })
  assert.equal(probed.length, 1)
  assert.ok(flat(probed[0]).some(item => item.name === CREATOR_ROW)); assert.equal(flat(probed[0]).some(item => item.name === 'dsh-workbench-agent-studio-runtime'), false)
  service.catalogRows = async () => { throw new Error('composition unavailable') }
  assert.equal((await service.doDispatch('catalog', { cwd: '/fixture', source: 'standard' })).tools.some(tool => tool.name === 'present'), false)
})

test('the capability card appears for a draft without a prompt and names the real default model', async () => {
  const { run, cards } = harness()
  await run('agent_studio_confirm', { stage: 'needs', points: ['回答资料库问题'] })
  const unwritten = draft({ systemPrompt: '' })
  assert.equal((await run('agent_studio_confirm', { stage: 'capabilities', draft: unwritten })).confirmed, true)
  assert.ok(cards.at(-1).detail.includes('全局默认（DeepSeek-V4-Pro）'))
  await assert.rejects(run('agent_studio_confirm', { stage: 'prompt', draft: unwritten, points: ['x'] }), /缺少系统提示词/)
})

test('trial runs each sample task in read-only mode on an unsaved draft and reports executed versus recorded calls', async () => {
  const { service, run, table, confirmAll, cards } = harness()
  const started = [], records = new Map()
  service.run = id => records.get(id)
  service.startRun = async (input, document, options) => {
    started.push({ input, document, options })
    const id = crypto.randomUUID(), record = { id, status: 'succeeded', reason: 'completed', output: [
      { id: 'a', role: 'assistant', text: '', tools: [{ id: 'c1', name: 'library_search', arguments: '{"query":"预算"}', result: '命中 2 条' }, { id: 'c2', name: 'library_correct', arguments: '{}', result: '[试跑未执行] library_correct 可能写入' }] },
      { id: 'b', role: 'assistant', text: '预算是 30 万。' }] }
    records.set(id, record); service.live.set(id, { done: Promise.resolve(), record })
    return record
  }
  await confirmAll(draft())
  const report = await run('agent_studio_trial', { draft: draft(), tasks: [{ input: '今年预算是多少？', expectation: '先检索再回答' }] })
  assert.equal(report.started, true)
  assert.equal(started.length, 1); assert.equal(started[0].options.safety, 'read-only')
  assert.equal(started[0].input.mode, 'react'); assert.equal(started[0].input.maxSteps, 8)
  assert.equal(started[0].document.readOnly, true); assert.equal(started[0].document.sourcePreset, CREATOR_PRESET_ID)
  assert.deepEqual(started[0].document.definition.pluginBindings['dsh-workbench-library'].tools, ['library_search', 'library_read'])
  const [first] = report.runs
  assert.equal(first.answer, '预算是 30 万。'); assert.equal(first.expectation, '先检索再回答')
  assert.deepEqual(first.toolCalls.map(call => [call.name, call.executed]), [['library_search', true], ['library_correct', false]])
  assert.equal([...table('agents').entries()].length, 0, 'a trial saves nothing to my Agents')
  assert.equal((await run('agent_studio_save', { draft: draft() })).saved, true)
  assert.match(cards.at(-1).detail, /\*\*试跑\*\*\n1\. 完成；工具：library_search ✓、library_correct ○；回答：预算是 30 万。/)
  await assert.rejects(run('agent_studio_trial', { draft: draft(), tasks: [{ input: '1' }, { input: '2' }, { input: '3' }, { input: '4' }] }), /1～3 条/)
  await assert.rejects(run('agent_studio_trial', { draft: draft({ systemPrompt: '另一版' }), tasks: [{ input: '1' }] }), /需要用户确认当前草稿的提示词/)
})

test('in a read-only trial the Studio tool path records writing calls without reaching the tool runtime', async () => {
  const { service } = harness(), executed = []
  service.ctx.tools = { execute: async request => { executed.push(request.name); return { content: [{ type: 'text', text: 'ok' }] } } }
  const live = { safety: 'read-only', handle: { agent: {} }, controller: new AbortController(), record: { document: { definition: { tools: ['read', 'write'] } } } }
  assert.deepEqual(await service.callTool(live, { name: 'read', arguments: '{}' }), { text: 'ok', error: false })
  assert.match((await service.callTool(live, { name: 'write', arguments: '{}' })).text, /^\[试跑未执行\] write/)
  assert.deepEqual(executed, ['read'])
  assert.deepEqual(await service.callTool({ ...live, safety: undefined }, { name: 'write', arguments: '{}' }), { text: 'ok', error: false }, 'ordinary Studio trials are unchanged')
})

test('trial and save refuse until the person confirmed this exact draft, and a declined card changes nothing', async () => {
  const { run, table, cards } = harness({ replies: { capabilities: 1, save: 1 } })
  await assert.rejects(run('agent_studio_trial', { draft: draft(), tasks: [{ input: '1' }] }), /能力（模型、插件、Skills）、提示词.*agent_studio_confirm/)
  await assert.rejects(run('agent_studio_save', { draft: draft() }), /是否试跑.*agent_studio_trial/)
  await assert.rejects(run('agent_studio_confirm', { stage: 'capabilities', draft: draft() }), /需求.*stage: needs/)
  await assert.rejects(run('agent_studio_confirm', { stage: 'needs' }), /points/)
  assert.equal((await run('agent_studio_confirm', { stage: 'needs', points: ['回答资料库问题', '只读'] })).confirmed, true)
  assert.match(cards[0].detail, /- 回答资料库问题\n- 只读/)
  const declined = await run('agent_studio_confirm', { stage: 'capabilities', draft: draft() })
  assert.deepEqual([declined.confirmed, declined.selected], [false, ['需要调整']])
  assert.match(cards[1].detail, /资料库\*\*：全部工具/); assert.match(cards[1].detail, /library-knowledge/)
  await assert.rejects(run('agent_studio_confirm', { stage: 'prompt', draft: draft({ systemPrompt: '' }) }), /请先修正草稿/)
  assert.equal([...table('agents').entries()].length, 0)
})

test('a changed draft needs its changed part confirmed again; declining the save card saves nothing', async () => {
  const { run, table, cards, confirmAll } = harness({ replies: { save: 1, trial: 2 } })
  await confirmAll(draft()); await run('agent_studio_trial', { draft: draft(), tasks: [{ input: '1' }] })
  const wider = draft({ plugins: [{ id: 'dsh-workbench-library', mode: 'all' }, { id: '@deepseek-ai/dsh-tool-ask-user', mode: 'all' }] })
  await assert.rejects(run('agent_studio_trial', { draft: wider, tasks: [{ input: '1' }] }), /能力/)
  const result = await run('agent_studio_save', { draft: draft() })
  assert.deepEqual([result.saved, result.selected], [false, ['先不保存']])
  assert.match(cards.at(-1).question, /保存到“我的 Agent”/)
  assert.equal([...table('agents').entries()].length, 0)
  const shown = cards.length, again = await run('agent_studio_confirm', { stage: 'capabilities', draft: draft({ systemPrompt: '只改了措辞' }) })
  assert.deepEqual([again.confirmed, again.alreadyConfirmed, cards.length], [true, true, shown], 'unchanged capabilities are not asked again')
})
