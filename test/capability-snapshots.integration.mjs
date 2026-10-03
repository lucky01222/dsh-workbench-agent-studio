import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as DomainStorage from '@deepseek-ai/dsh-storage-domain'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { CapabilitySnapshots, capabilitySnapshotSpec, restrictCapabilities } from '../packages/runtime/src/snapshots.mjs'
import * as policy from '../packages/runtime/src/policy.mjs'

const pluginId = '@deepseek-ai/dsh-tool-fs'
const definition = tools => ({ name: 'Frozen test', description: '', modelSelection: 'explicit', provider: 'test', model: 'test',
  systemPrompt: 'original prompt', tools, skills: [], pluginBindings: { [pluginId]: { enabled: true, mode: 'all', tools } } })
const rows = (...names) => names.map(name => ({ name, pluginId }))
const agent = (id, header = {}, requestHeader) => ({ id, session: { header, requestHeader: () => requestHeader } })
const frozen = (tools, prompt = 'frozen prompt') => ({ definition: { ...definition(tools), systemPrompt: prompt },
  resolution: { version: 1, resolvedAt: '2026-10-02T00:00:00.000Z', tools,
    plugins: [{ id: pluginId, mode: 'all', tools, version: '0.1.7-rc.2' }] } })

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'studio-snapshot-'))
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root })
  await ctx.plugin(DomainStorage, { backend: 'json' })
  t.after(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  let available = rows('read')
  const open = async () => new CapabilitySnapshots(await ctx.storageDomain.open(capabilitySnapshotSpec), async () => available)
  return { ctx, open, setTools: value => { available = value } }
}

test('session snapshot survives a real domain close/reopen while new sessions follow plugin additions', async t => {
  const h = await setup(t)
  let service = await h.open()
  const first = await service.forAgent(agent('persisted'), { definition: definition(['read']) })
  assert.deepEqual(first.resolution.tools, ['read'])
  await service.close()
  h.setTools(rows('read', 'write'))
  service = await h.open()
  const resumed = await service.forAgent(agent('persisted'), { definition: { ...definition(['read', 'write']), systemPrompt: 'changed' }, source: 'resume' })
  assert.deepEqual(resumed.resolution.tools, ['read'])
  assert.equal(resumed.definition.systemPrompt, 'original prompt')
  const next = await service.forAgent(agent('fresh'), { definition: definition(['read']) })
  assert.deepEqual(new Set(next.resolution.tools), new Set(['read', 'write']))
  assert.deepEqual(restrictCapabilities(next, ['read']).resolution.toolOwners, { read: pluginId })
  resumed.definition.tools.push('write')
  assert.deepEqual(service.get('persisted').definition.tools, ['read'], 'API snapshots must not expose stored mutable objects')
  await service.close()
})

test('trusted trial/manual snapshot bypasses all-mode refresh and mismatch fails before storage', async t => {
  const h = await setup(t)
  h.setTools(rows('read', 'write'))
  const service = await h.open(), snapshot = frozen(['read'])
  const result = await service.forAgent(agent('manual'), { definition: snapshot.definition, capabilityResolution: snapshot.resolution })
  assert.deepEqual(result.resolution.tools, ['read'])
  assert.equal(result.definition.systemPrompt, 'frozen prompt')
  await assert.rejects(service.forAgent(agent('invalid'), { definition: definition(['write']), capabilityResolution: snapshot.resolution }), /快照与 Agent 配置不一致/)
  assert.equal(service.get('invalid'), undefined)
  await service.close()
})

test('fork uses its parent frozen ceiling and child filters can only narrow', async t => {
  const h = await setup(t)
  h.setTools(rows('read', 'write'))
  const service = await h.open()
  await service.forAgent(agent('parent', { agentPreset: 'same-role' }), { definition: definition(['read']) })
  h.setTools(rows('read', 'write', 'edit'))
  const fork = await service.forAgent(agent('fork', { parentSession: 'parent', origin: 'subagent', isSeeded: true, agentPreset: 'same-role' }), { definition: { ...definition(['read', 'write', 'edit']), systemPrompt: 'new prompt' } })
  assert.deepEqual(new Set(fork.resolution.tools), new Set(['read', 'write']))
  assert.equal(fork.definition.systemPrompt, 'original prompt')
  const spawned = await service.forAgent(agent('spawned', { parentSession: 'parent', origin: 'subagent', agentPreset: 'different-role' }), { definition: { ...definition(['read']), systemPrompt: 'spawned role' } })
  assert.equal(spawned.definition.systemPrompt, 'spawned role')
  assert.deepEqual(new Set(spawned.resolution.tools), new Set(['read', 'write', 'edit']))
  const differentFork = await service.forAgent(agent('different-fork', { parentSession: 'parent', origin: 'subagent', isSeeded: true, agentPreset: 'different-role' }), { definition: { ...definition(['read']), systemPrompt: 'different fork role' } })
  assert.equal(differentFork.definition.systemPrompt, 'different fork role')
  assert.deepEqual(new Set(differentFork.resolution.tools), new Set(['read', 'write']))
  h.setTools([{ name: 'read', pluginId: 'different-owner' }])
  await assert.rejects(service.forAgent(agent('different-owner-fork', { parentSession: 'parent', origin: 'subagent', isSeeded: true, agentPreset: 'different-role' }), {
    definition: { ...definition(['read']), pluginBindings: { 'different-owner': { enabled: true, mode: 'all', tools: ['read'] } } },
  }), /工具归属已变化/, 'a different role cannot inherit a parent tool name from another owning plugin')
  h.setTools(rows('read'))
  const child = await service.forAgent(agent('filtered', { parentSession: 'parent', origin: 'subagent' }), { definition: definition(['read', 'write']) })
  assert.deepEqual(child.resolution.tools, ['read'])
  h.setTools(rows('read', 'write', 'edit'))
  const resumed = await service.forAgent(agent('filtered', { parentSession: 'parent', origin: 'subagent' }), { definition: definition(['read', 'write', 'edit']), source: 'resume' })
  assert.deepEqual(resumed.resolution.tools, ['read'])
  await service.close()
})

test('frozen roots reject missing or reassigned tools instead of silently widening or changing owners', async t => {
  const h = await setup(t), service = await h.open()
  await service.forAgent(agent('saved'), { definition: definition(['read']) })
  h.setTools([])
  await assert.rejects(service.forAgent(agent('saved'), { definition: definition(['read']), source: 'resume' }), { code: 'CAPABILITY_UNAVAILABLE' })
  h.setTools([{ name: 'read', pluginId: 'different-plugin' }])
  await assert.rejects(service.forAgent(agent('saved'), { definition: definition(['read']), source: 'resume' }), /工具归属已变化/)
  assert.deepEqual(service.get('saved').resolution.tools, ['read'])
  await service.close()
})

test('concurrent same-session creates persist one ceiling; shutdown drains its write', async t => {
  const h = await setup(t), service = await h.open()
  const [first, second] = await Promise.all([
    service.forAgent(agent('concurrent'), { definition: definition(['read']) }),
    service.forAgent(agent('concurrent'), { definition: { ...definition(['read']), systemPrompt: 'later' } }),
  ])
  assert.deepEqual(second, first)
  const pending = service.forAgent(agent('draining'), { definition: definition(['read']) })
  const close = service.close()
  await pending
  await close
  await assert.rejects(service.forAgent(agent('late'), { definition: definition(['read']) }), /正在停止/)
  const reopened = await h.open()
  assert.deepEqual(reopened.get('draining').resolution.tools, ['read'])
  await reopened.close()
})

test('pre-upgrade resume keeps the native historical ceiling and legacy definitions remain exact', async t => {
  const h = await setup(t)
  h.setTools(rows('read', 'write'))
  const service = await h.open()
  const upgraded = await service.forAgent(agent('old', {}, { tools: [{ name: 'read' }] }), { definition: definition(['read', 'write']), source: 'resume' })
  assert.deepEqual(upgraded.resolution.tools, ['read'])
  const { pluginBindings: _bindings, ...legacy } = definition(['read'])
  const exact = await service.forAgent(agent('legacy'), { definition: legacy })
  assert.deepEqual(exact.resolution.tools, ['read'])
  await assert.rejects(service.forAgent(agent('ptc', {}, { tools: [{ name: 'run_code' }] }), { definition: definition(['read']), source: 'resume' }), /旧会话缺少可验证/)
  await assert.rejects(service.forAgent(agent('unknown-history'), { definition: definition(['read']), source: 'resume' }), /旧会话缺少可验证/)
  await service.close()
})

test('pre-upgrade child resumes obey their own history before current parent or all-mode bindings', async t => {
  const h = await setup(t)
  h.setTools(rows('read', 'write'))
  const service = await h.open()
  const current = definition(['read', 'write'])
  const header = { origin: 'subagent', isSeeded: true, parentSession: 'old-parent', agentPreset: 'role' }
  const request = { tools: [{ name: 'read' }] }
  const orphan = await service.forAgent(agent('old-child', header, request), { definition: current, source: 'resume' })
  assert.deepEqual(orphan.resolution.tools, ['read'], 'missing parent snapshot must never expand an old child')
  await service.forAgent(agent('old-parent', { agentPreset: 'role' }), { definition: current })
  const knownParent = await service.forAgent(agent('another-old-child', header, request), { definition: current, source: 'resume' })
  assert.deepEqual(knownParent.resolution.tools, ['read'], 'same-preset parent snapshot cannot override child historical scope')
  const declaredSnapshot = frozen(['read', 'write'])
  const supplied = await service.forAgent(agent('resume-with-template-snapshot', header, request), {
    definition: declaredSnapshot.definition, capabilityResolution: declaredSnapshot.resolution, source: 'resume',
  })
  assert.deepEqual(supplied.resolution.tools, ['read'], 'template snapshot cannot replace the existing session history')
  await assert.rejects(service.forAgent(agent('no-history-child', header), { definition: current, source: 'resume' }), /旧会话缺少可验证/)
  const { pluginBindings: _binding, ...legacy } = current
  const oldLegacy = await service.forAgent(agent('legacy-child', header, request), { definition: legacy, source: 'resume' })
  assert.deepEqual(oldLegacy.resolution.tools, ['read'])
  assert.equal(oldLegacy.definition.pluginBindings, undefined)
  await service.close()
})

test('legacy and unassigned exact snapshots preserve every known tool owner without guessing unknown origins', async t => {
  const h = await setup(t), service = await h.open()
  const { pluginBindings: _binding, ...legacy } = definition(['read'])
  const unassigned = { ...legacy, pluginBindings: { unassigned: { enabled: true, mode: 'custom', tools: ['read'] } } }
  const first = await service.forAgent(agent('legacy-known'), { definition: legacy })
  const second = await service.forAgent(agent('unassigned-known'), { definition: unassigned })
  assert.equal(first.resolution.toolOwners.read, pluginId)
  assert.equal(second.resolution.toolOwners.read, pluginId)
  h.setTools([{ name: 'read', pluginId: 'different-plugin' }])
  await assert.rejects(service.forAgent(agent('legacy-known'), { definition: legacy, source: 'resume' }), /工具归属已变化/)
  await assert.rejects(service.forAgent(agent('unassigned-known'), { definition: unassigned, source: 'resume' }), /工具归属已变化/)
  h.setTools([{ name: 'read' }])
  const unknown = await service.forAgent(agent('legacy-unknown'), { definition: legacy })
  assert.equal(unknown.resolution.toolOwners?.read, undefined)
  h.setTools([{ name: 'read', pluginId: 'newly-observable-plugin' }])
  const restored = await service.forAgent(agent('legacy-unknown'), { definition: legacy, source: 'resume' })
  assert.deepEqual(restored.resolution.tools, ['read'])
  assert.equal(restored.resolution.toolOwners?.read, undefined, 'do not retrospectively claim an unknown historical owner')
  await service.close()
})

test('policy freezes model schemas and guards late global and agent-local registrations', async t => {
  const h = await setup(t), ctx = h.ctx, service = await h.open()
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  let calls = 0
  const tool = name => defineTool({ name, description: name, parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => { calls++; return name } })
  const releaseRead = ctx.tools.register(tool('read'))
  let toolOwner = 'original-plugin'
  let entryId = 'original-bundle-entry'
  ctx.tools.registrationOf = name => name === 'read' ? { moduleName: toolOwner, entryId } : undefined
  service.readTools = async scope => ctx.tools.schemas(scope).map(row => ({ ...row, pluginId }))
  await ctx.plugin({ apply(c) {
    c.provide('agents', {})
    c.provide('skills', { list: async () => [] })
    c.provide('sessionProjections', { stateOf: () => ({ pending: null, lastUsed: null }) })
    c.provide('studioCapabilities', service)
  } })
  const presetKey = {}
  await ctx.plugin({ inject: policy.inject, apply(owner) {
    const preset = createScope(owner, presetKey)
    policy.apply(preset.ctx, { definition: definition(['read']) })
  } })
  const key = agent('policy-agent')
  key.session.append = () => {}
  await ctx.plugin({ inject: policy.inject, apply(owner) { key.ctx = createScope(owner, key, { parent: presetKey }).ctx } })
  await ctx.serial(scopeTarget(key, key), 'agent/created', { agent: key, source: 'startup' })
  assert.deepEqual(ctx.tools.schemas(key).map(row => row.name), ['read'])
  ctx.tools.register(tool('write'))
  assert.deepEqual(ctx.tools.schemas(key).map(row => row.name), ['read'], 'late global tool must remain outside the inherited allowlist')
  key.ctx.tools.register(tool('local_late'))
  assert.ok(ctx.tools.schemas(key).some(row => row.name === 'local_late'), 'official own-scope exemption is preserved')
  const assembly = await ctx.systemPrompt.assemble({ scope: key, agent: key })
  assert.deepEqual(assembly.tools.map(row => row.name), ['read'], 'own-scope additions must also stay outside the model schema')
  const result = await ctx.tools.execute({ name: 'local_late', arguments: {}, callId: 'blocked', signal: new AbortController().signal, agent: key })
  assert.equal(result.isError, true)
  assert.equal(calls, 0, 'execution guard must prevent a newly scoped tool from bypassing the frozen ceiling')
  await releaseRead()
  ctx.tools.register(tool('read'))
  toolOwner = 'different-plugin'
  const changed = await ctx.systemPrompt.assemble({ scope: key, agent: key })
  assert.deepEqual(changed.tools, [], 'same tool name from a different owner must disappear from model schemas')
  const changedCall = await ctx.tools.execute({ name: 'read', arguments: {}, callId: 'changed', signal: new AbortController().signal, agent: key })
  assert.equal(changedCall.isError, true)
  assert.equal(calls, 0)
  toolOwner = 'original-plugin'
  entryId = 'different-bundle-entry'
  const differentBundle = await ctx.tools.execute({ name: 'read', arguments: {}, callId: 'different-bundle', signal: new AbortController().signal, agent: key })
  assert.equal(differentBundle.isError, true, 'identical embedded module name cannot bypass a changed Loader owner chain')
  assert.deepEqual((await ctx.systemPrompt.assemble({ scope: key, agent: key })).tools, [])
  entryId = 'original-bundle-entry'
  const samePackage = await ctx.tools.execute({ name: 'read', arguments: {}, callId: 'same-registration', signal: new AbortController().signal, agent: key })
  assert.equal(samePackage.isError, false, 'same entry can re-register the same module without changing the admitted origin')
  assert.equal(calls, 1)
  await service.close()
})

test('policy waits for late per-Agent registration even when its created listener was loaded first', async t => {
  const h = await setup(t), ctx = h.ctx, service = await h.open()
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  const subagentPlugin = '@deepseek-ai/dsh-tool-subagent'
  service.readTools = async scope => ctx.tools.schemas(scope).map(row => ({ ...row, pluginId: subagentPlugin }))
  await ctx.plugin({ apply(c) {
    c.provide('agents', {})
    c.provide('skills', { list: async () => [] })
    c.provide('sessionProjections', { stateOf: () => ({ pending: null, lastUsed: null }) })
    c.provide('studioCapabilities', service)
  } })
  const presetKey = {}, desired = { ...definition(['subagent']), pluginBindings: { [subagentPlugin]: { enabled: true, mode: 'all', tools: ['subagent'] } } }
  let preset
  await ctx.plugin({ inject: policy.inject, apply(owner) {
    preset = createScope(owner, presetKey)
    policy.apply(preset.ctx, { definition: desired })
  } })
  let target, installed = false
  const order = []
  await preset.ctx.plugin({ inject: ['tools'], apply(c) {
    const install = () => {
      if (!target || installed) return
      installed = true
      return target.ctx.inject(['tools'], async child => {
        await Promise.resolve()
        order.push('registered')
        child.tools.register(defineTool({ name: 'subagent', description: 'deferred registration fixture', parameters: {},
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => 'unused' }))
      })
    }
    c.on('tools/change', install)
    c.on('agent/created', async () => { order.push('provider-created-listener'); await install() })
  } })
  target = agent('late-registration')
  target.session.append = () => {}
  await ctx.plugin({ inject: policy.inject, apply(owner) { target.ctx = createScope(owner, target, { parent: presetKey }).ctx } })
  await ctx.serial(scopeTarget(target, target), 'agent/created', { agent: target, source: 'startup' })
  assert.deepEqual(service.get(target.id).resolution.tools, ['subagent'])
  assert.deepEqual(order, ['registered', 'provider-created-listener'], 'policy reconciles and awaits the tool before the later serial listener')
  assert.deepEqual((await ctx.systemPrompt.assemble({ scope: target, agent: target })).tools.map(row => row.name), ['subagent'])
  await service.close()
})

async function standalonePolicy(t, declared) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  for (const name of ['read', 'write']) ctx.tools.register(defineTool({ name, description: name, parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => name }))
  await ctx.plugin({ apply(c) {
    c.provide('agents', {})
    c.provide('skills', { list: async () => [] })
    c.provide('sessionProjections', { stateOf: () => ({ pending: null, lastUsed: null }) })
  } })
  const presetKey = {}
  const policyHost = await ctx.plugin({ inject: policy.inject, apply(owner) {
    const preset = createScope(owner, presetKey)
    policy.apply(preset.ctx, { definition: declared })
  } })
  const create = async id => {
    const key = agent(id)
    key.session.append = () => {}
    await ctx.plugin({ inject: policy.inject, apply(owner) { key.ctx = createScope(owner, key, { parent: presetKey }).ctx } })
    await ctx.serial(scopeTarget(key, key), 'agent/created', { agent: key, source: 'startup' })
    return key
  }
  return { ctx, create, policyHost }
}

test('legacy exported exact policy remains effective without installing the capability Host service', async t => {
  const { pluginBindings: _bindings, ...legacy } = definition(['read'])
  const h = await standalonePolicy(t, legacy)
  assert.equal(h.ctx.get('studioCapabilities'), undefined)
  assert.equal(h.ctx.get('storageDomain'), undefined, 'legacy standalone runtime must not acquire a new persistence dependency')
  const key = await h.create('legacy-portable')
  assert.deepEqual(h.ctx.tools.schemas(key).map(tool => tool.name), ['read'])
  assert.deepEqual((await h.ctx.systemPrompt.assemble({ scope: key, agent: key })).tools.map(tool => tool.name), ['read'])
  const blocked = await h.ctx.tools.execute({ name: 'write', arguments: {}, callId: 'legacy-blocked', agent: key, signal: new AbortController().signal })
  assert.equal(blocked.isError, true)
})

test('new bindings fail Agent creation clearly without support and can load before the service becomes ready', async t => {
  const declared = definition(['read'])
  const h = await standalonePolicy(t, declared)
  await assert.rejects(h.create('missing-host-support'), error => error.code === 'CAPABILITY_UNAVAILABLE' && /插件能力服务不可用/.test(error.message))
  let resolutions = 0
  await h.ctx.plugin({ apply(c) {
    c.provide('studioCapabilities', { async forAgent(_agent, input) { resolutions++; return { definition: input.definition } } })
  } })
  await h.policyHost.await()
  const key = await h.create('late-host-support')
  assert.equal(resolutions, 1)
  assert.deepEqual((await h.ctx.systemPrompt.assemble({ scope: key, agent: key })).tools.map(tool => tool.name), ['read'])
})
