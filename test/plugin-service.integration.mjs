import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { StudioService } from '../packages/service/src/service.mjs'
import { Document } from '../packages/service/src/schema.mjs'

const files = '@deepseek-ai/dsh-tool-fs'
const base = { name: 'Agent', description: '', modelSelection: 'explicit', provider: 'fixture', model: 'fixture', systemPrompt: '', tools: ['read'], skills: [] }
const choice = (mode = 'all', tools = ['read']) => ({ enabled: true, mode, tools })
const definition = () => ({ ...base, pluginBindings: { [files]: choice() } })
const row = (name, pluginId = files, extra = {}) => ({ name, pluginId, description: name, pluginVersion: '1.0.0', ...extra })
const stamp = '2026-10-02T00:00:00.000Z'
const document = (value = definition()) => Document.parse({ id: randomUUID(), revision: 1, definition: value, createdAt: stamp, updatedAt: stamp })
const flat = rows => rows.flatMap(row => row.group && Array.isArray(row.config) ? flat(row.config) : [row])

function serviceHarness(doc = document()) {
  const stores = new Map(), registrations = []
  const table = name => {
    if (!stores.has(name)) stores.set(name, new Map())
    const data = stores.get(name)
    return { get: id => data.get(id), entries: () => data.entries(), put: async (id, value) => { data.set(id, structuredClone(value)) } }
  }
  const service = new StudioService({
    agentPresets: { register: async value => { registrations.push(structuredClone(value)); return async () => {} } },
    llm: { resolveCallConfig: async () => ({}) },
  })
  service.domain = { table, close: async () => {} }
  service.cwd = '/fixture'
  table('agents').put(doc.id, doc)
  service.catalog = async () => ({ tools: [row('read'), row('write')], skills: [] })
  return { service, registrations, table, doc }
}

test('save persists bindings, refreshed all membership and revision history without persisting a run snapshot', async () => {
  const { service, table, registrations, doc } = serviceHarness()
  const saved = await service.dispatch('save', { id: doc.id, revision: 1, definition: definition() })
  assert.equal(saved.revision, 2)
  assert.deepEqual(saved.definition.tools, ['read', 'write'])
  assert.deepEqual(saved.definition.pluginBindings[files], choice('all', ['read', 'write']))
  assert.equal(saved.capabilityResolution, undefined)
  assert.deepEqual(table('agents').get(doc.id), saved)
  assert.deepEqual(table('revisions').get(`${doc.id}:2`), saved)
  const policy = flat(registrations[0].plugins).find(row => row.name === 'dsh-workbench-agent-studio-runtime')
  assert.deepEqual(policy.config.definition.pluginBindings, saved.definition.pluginBindings)
  assert.equal(policy.config.capabilityResolution, undefined)
  await assert.rejects(service.dispatch('save', { id: doc.id, revision: 1, definition: definition() }), error => error.code === 'REVISION_CONFLICT')
})

test('legacy flat definitions remain exact on save and copy', async () => {
  const { service, doc } = serviceHarness(document(base))
  service.catalog = async () => { throw Error('legacy save must not silently discover and widen tools') }
  const saved = await service.dispatch('save', { id: doc.id, revision: 1, definition: base })
  assert.deepEqual(saved.definition.tools, ['read'])
  assert.equal(saved.definition.pluginBindings, undefined)
  const copied = await service.dispatch('copy', { id: saved.id })
  assert.deepEqual(copied.definition.tools, ['read'])
  assert.equal(copied.definition.pluginBindings, undefined)
})

test('save rejects unknown definition/binding fields and unavailable selected tools without updating storage', async () => {
  const { service, doc, table, registrations } = serviceHarness()
  for (const invalid of [
    { ...definition(), unexpected: true },
    { ...definition(), pluginBindings: { [files]: { ...choice(), extraGrant: true } } },
    { ...definition(), pluginBindings: { [files]: choice('custom', ['missing']) } },
  ]) {
    await assert.rejects(service.dispatch('save', { id: doc.id, revision: 1, definition: invalid }))
    assert.deepEqual(table('agents').get(doc.id), doc)
  }
  assert.equal(registrations.length, 0)
  assert.equal([...table('revisions').entries()].length, 0)
})

test('copy retains independent plugin selection and export includes registry, snapshots and binding policy', async () => {
  const { service, doc, table } = serviceHarness()
  const copied = await service.dispatch('copy', { id: doc.id })
  assert.notEqual(copied.id, doc.id)
  assert.equal(copied.revision, 1)
  assert.deepEqual(copied.definition.pluginBindings, doc.definition.pluginBindings)
  copied.definition.pluginBindings[files].tools.push('write')
  assert.deepEqual(table('agents').get(doc.id).definition.pluginBindings[files].tools, ['read'])
  const exported = yaml.load(await service.dispatch('export', { id: doc.id }), { schema: entryListSchema })
  assert.ok(exported.some(row => row.id === 'tools' && row.name === '@deepseek-ai/dsh-tools' && row.disabled === true))
  const inserted = exported.flatMap(row => row.insert || [])
  assert.ok(inserted.some(row => row.id === 'studio-tool-registry' && row.name === 'dsh-workbench-agent-studio-runtime/tool-registry'))
  assert.ok(inserted.some(row => row.name === 'dsh-workbench-agent-studio-runtime/snapshots'))
  const preset = inserted.find(row => row.name === '@deepseek-ai/dsh-agent-preset')
  const policy = flat(preset.config.plugins).find(row => row.name === 'dsh-workbench-agent-studio-runtime')
  assert.deepEqual(policy.config.definition.pluginBindings, doc.definition.pluginBindings)
  assert.equal(policy.config.capabilityResolution, undefined, 'export must resolve new-session capabilities in its destination')
})

test('preflight resolves fresh capabilities for each new run and leaves stored Agent and old snapshot unchanged', async () => {
  const { service, doc, table } = serviceHarness()
  let current = [row('read')], modelChecks = 0
  service.ctx.llm.resolveCallConfig = async config => { modelChecks++; assert.equal(config.model, 'fixture') }
  service.catalog = async () => ({ tools: current, skills: [] })
  const first = await service.preflight(doc, '/fixture')
  current = [row('read', files, { pluginVersion: '2.0.0' }), row('write', files, { pluginVersion: '2.0.0' })]
  const second = await service.preflight(doc, '/fixture')
  assert.deepEqual(first.capabilityResolution.tools, ['read'])
  assert.deepEqual(second.capabilityResolution.tools, ['read', 'write'])
  assert.equal(first.capabilityResolution.plugins[0].version, '1.0.0')
  assert.equal(second.capabilityResolution.plugins[0].version, '2.0.0')
  assert.deepEqual(table('agents').get(doc.id), doc)
  assert.equal(modelChecks, 2)
})

test('copied preset effective tool ownership overrides general catalog and skills validate against actual availability', async () => {
  const { service, doc } = serviceHarness()
  const custom = { ...doc, baseYaml: '[]', definition: { ...base, pluginBindings: { custom: choice('custom') } } }
  service.catalogRows = async () => ({ tools: [row('read', 'custom')], skills: [] })
  assert.deepEqual((await service.capabilities(custom, '/fixture')).capabilityResolution.plugins.map(plugin => plugin.id), ['custom'])
  service.catalog = async () => ({ tools: [row('skill', '@deepseek-ai/dsh-tool-skill')], skills: [] })
  const withSkill = { ...doc, definition: { ...base, tools: ['skill'], skills: ['unavailable-skill'] } }
  await assert.rejects(service.capabilities(withSkill, '/fixture'), error => error.code === 'CAPABILITY_UNAVAILABLE' && /Skill/.test(error.message))
})

test('copied preset preflight honors a disabled tool provider instead of unioning a general catalog grant', async () => {
  const { service, doc } = serviceHarness()
  const copied = { ...doc, baseYaml: yaml.dump([{ id: 'disabled-fs', name: files, disabled: true }]) }
  service.catalog = async () => { assert.fail('a copied preset must use its actual composed directory') }
  service.catalogRows = async (_cwd, rows) => {
    const actual = flat(rows)
    assert.deepEqual(actual.filter(row => row.name === files).map(row => row.disabled), [true])
    assert.equal(actual.some(row => row.id === 'studio-policy'), false, 'the catalog probe must not freeze an Agent policy while still discovering it')
    return { tools: [], skills: [] }
  }
  await assert.rejects(service.preflight(copied, '/fixture'), error => error.code === 'CAPABILITY_UNAVAILABLE')
})

test('save and prompt generation validate project Skills against the requested normalized directory', async () => {
  const skillPlugin = '@deepseek-ai/dsh-tool-skill'
  const skillDefinition = { ...base, tools: [], skills: ['project-only'], pluginBindings: { [skillPlugin]: choice('all', []) } }
  const { service, doc, table } = serviceHarness(document(skillDefinition))
  const directories = []
  service.directory = async cwd => { assert.equal(cwd, '/project'); return '/normalized-project' }
  service.catalog = async cwd => {
    directories.push(cwd)
    return { tools: [row('skill', skillPlugin)], skills: cwd === '/normalized-project' ? [{ name: 'project-only' }] : [] }
  }
  const saved = await service.dispatch('save', { id: doc.id, revision: 1, cwd: '/project', definition: skillDefinition })
  assert.deepEqual(saved.definition.skills, ['project-only'])
  service.ctx.llm.stream = async function* () {
    yield { type: 'text-delta', text: 'A fixture prompt.' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const prompt = await service.dispatch('prompt', { id: doc.id, cwd: '/project', instruction: 'Use the chosen skills', original: '', definition: skillDefinition })
  await service.promptJobs.get(prompt.id)?.done
  assert.equal(table('prompts').get(prompt.id).status, 'succeeded')
  assert.deepEqual(JSON.parse(prompt.context), { tools: ['skill'], skills: ['project-only'] })
  assert.deepEqual(directories, ['/normalized-project', '/normalized-project'])
  await assert.rejects(service.dispatch('save', { id: doc.id, revision: 2, cwd: 123, definition: skillDefinition }))
  assert.equal(table('agents').get(doc.id).revision, 2)
})

test('catalog runs the actual Agent registration lifecycle and releases resources without invoking tools or models', async () => {
  const scope = {}, events = []
  const service = new StudioService({
    get: () => undefined,
    agentPresets: {
      register: async () => { events.push('register'); return async () => { events.push('release-preset') } },
      mount: async () => { events.push('mount') },
    },
    agents: { async create(options) { await options.setup({}); return { agent: scope, dispose: async () => { events.push('release-agent') } } } },
    llm: { stream() { assert.fail('catalog must not invoke a model') } },
    tools: { execute() { assert.fail('catalog must not invoke a tool') }, schemas(key) { assert.equal(key, scope); return [{ name: 'tool', description: 'live' }] } },
    skills: { async list({ scope: key }) { assert.equal(key, scope); return [{ name: 'visible', description: 'skill', invocation: { modelInvocable: true } }, { name: 'shipped', description: 'plugin skill', source: 'bundled', path: '/profile/node_modules/dsh-example/skills/shipped/SKILL.md', invocation: { modelInvocable: true } }, { name: 'registered', description: 'code skill', source: 'bundled', provider: 'example-skills', resourceBase: { kind: 'directory', path: '/profile/node_modules/dsh-office/node_modules/dsh-univer/skills/registered/' }, invocation: { modelInvocable: true } }, { name: 'hidden', invocation: { modelInvocable: false } }] } },
  })
  service.directory = async cwd => cwd
  const catalog = await service.catalogRows('/fixture', [])
  assert.deepEqual(catalog.tools, [{ name: 'tool', description: 'live', pluginId: null }])
  assert.deepEqual(catalog.skills, [{ name: 'visible', description: 'skill' }, { name: 'shipped', description: 'plugin skill', source: 'bundled', owner: 'dsh-example' }, { name: 'registered', description: 'code skill', source: 'bundled', owner: 'dsh-office' }])
  assert.deepEqual(events, ['register', 'mount', 'release-agent', 'release-preset'])
  events.length = 0
  service.ctx.tools.schemas = () => { throw Error('catalog read failed') }
  await assert.rejects(service.catalogRows('/fixture', []), /catalog read failed/)
  assert.deepEqual(events, ['register', 'mount', 'release-agent', 'release-preset'])
  events.length = 0
  service.ctx.agents.create = async () => { throw Error('Agent unavailable') }
  await assert.rejects(service.catalogRows('/fixture', []), /Agent unavailable/)
  assert.deepEqual(events, ['register', 'release-preset'])
})

test('plugin composition preserves both subagent configuration instances and subpath tools', () => {
  const service = new StudioService({})
  const selected = { ...base, tools: [], pluginBindings: { '@deepseek-ai/dsh-tool-subagent': choice('all', []) } }
  const rows = flat(service.rows(selected))
  const variants = rows.filter(row => row.name === '@deepseek-ai/dsh-tool-subagent' && !row.disabled)
  assert.deepEqual(variants.map(row => row.config.toolName), ['subagent', 'subagent_fork'])
  assert.equal(new Set(variants.map(row => row.id)).size, 2)
  assert.ok(rows.some(row => row.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents'))
  const inherited = yaml.dump([{ ...variants[0], id: 'inherited-spawn' }], { schema: entryListSchema })
  const merged = flat(service.rows(selected, false, inherited)).filter(row => row.name === '@deepseek-ai/dsh-tool-subagent' && !row.disabled)
  assert.deepEqual(merged.map(row => row.config.toolName), ['subagent', 'subagent_fork'])
  const customizedSpawn = { ...variants[0], config: { ...variants[0].config, description: 'User-owned spawn configuration' } }
  const customized = flat(service.rows(selected, false, yaml.dump([customizedSpawn], { schema: entryListSchema })))
    .filter(row => row.name === '@deepseek-ai/dsh-tool-subagent' && !row.disabled)
  assert.deepEqual(customized.map(row => row.config.toolName), ['subagent', 'subagent_fork'])
  assert.equal(customized[0].config.description, 'User-owned spawn configuration')
})

test('manual execution uses the stored run snapshot and rejects newly available tools outside it', async () => {
  const { service, doc, table } = serviceHarness()
  const frozen = await service.preflight(doc, '/fixture')
  frozen.definition.tools = ['read']
  frozen.capabilityResolution.tools = ['read']
  frozen.capabilityResolution.plugins[0].tools = ['read']
  const runId = randomUUID()
  table('runs').put(runId, { id: runId, status: 'waiting-tools', cwd: '/fixture', document: frozen,
    output: [{ tools: [{ id: 'old', name: 'read', arguments: '{}' }, { id: 'new', name: 'write', arguments: '{}' }] }] })
  const handles = [], executed = []
  service.capabilities = async () => { assert.fail('manual execution must not re-expand persistent all bindings') }
  service.preflight = async () => { assert.fail('manual execution must not preflight the latest Agent revision') }
  service.createHandle = async document => { handles.push(structuredClone(document)); return { agent: { id: randomUUID(), session: { append() {} }, runMaintenance: work => work(new AbortController().signal) }, dispose: async () => {} } }
  service.ctx.agents = { withInitiator: (_agent, work) => work() }
  service.ctx.tools = { execute: async call => { executed.push(call.name); return { content: [{ type: 'text', text: 'read result' }] } } }
  const success = await service.dispatch('executeTool', { runId, callId: 'old', executionId: randomUUID(), arguments: '{}' })
  assert.equal(success.status, 'succeeded')
  const denied = await service.dispatch('executeTool', { runId, callId: 'new', executionId: randomUUID(), arguments: '{}' })
  assert.equal(denied.status, 'failed')
  assert.match(denied.output.result, /not enabled/)
  assert.deepEqual(executed, ['read'])
  assert.deepEqual(handles.map(document => document.capabilityResolution.tools), [['read'], ['read']])
})

test('createHandle passes a fixed resolution into runtime policy and releases both resources', async () => {
  const { service, doc } = serviceHarness()
  const frozen = await service.preflight(doc, '/fixture'), releases = []
  let composition
  service.ctx.agentPresets = {
    register: async value => { composition = value; return async () => { releases.push('preset') } },
    mount: async () => {},
  }
  service.ctx.agents = { create: async options => { await options.setup({}); return { agent: { id: randomUUID() }, dispose: async () => { releases.push('agent') } } } }
  const handle = await service.createHandle(frozen, '/fixture')
  const policy = flat(composition.plugins).find(row => row.name === 'dsh-workbench-agent-studio-runtime')
  assert.deepEqual(policy.config.capabilityResolution, frozen.capabilityResolution)
  await handle.dispose()
  assert.deepEqual(releases, ['agent', 'preset'])
})

test('bootstrap identifies the actual host and packaged Studio instead of a historical version', async () => {
  const { getDshRuntimeVersion } = await import('@deepseek-ai/dsh-app-boot')
  const { version } = (await import('../packages/service/package.json', { with: { type: 'json' } })).default
  const { service } = serviceHarness()
  service.ctx.agentPresets.list = async () => []
  service.ctx.get = () => undefined
  const state = await service.dispatch('bootstrap')
  assert.equal(state.harness, getDshRuntimeVersion())
  assert.equal(state.version, version)
})
