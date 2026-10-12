import test from 'node:test'
import assert from 'node:assert/strict'
import { ownerOfRegistration, packageOf, resolveCapabilities, toolsForScope } from '../packages/runtime/src/capabilities.mjs'

const files = '@deepseek-ai/dsh-tool-fs'
const skill = '@deepseek-ai/dsh-tool-skill'
const base = { name: 'Agent', description: '', modelSelection: 'global', provider: '', model: '', systemPrompt: '', tools: [], skills: [] }
const binding = (mode, tools = [], enabled = true) => ({ mode, tools, enabled })
const row = (name, pluginId = files, extra = {}) => ({ name, pluginId, ...extra })
const definition = pluginBindings => ({ ...base, pluginBindings })
const resolve = (pluginBindings, tools) => resolveCapabilities(definition(pluginBindings), tools)
const unavailable = fn => assert.throws(fn, error => error.code === 'CAPABILITY_UNAVAILABLE')
const owner = (moduleName, entryId, ancestors = []) => ({ moduleName, entryId, entryChain: [{ moduleName, entryId }, ...ancestors] })

test('all resolves newly registered plugin tools while custom and legacy remain exact', () => {
  const before = [row('read')], after = [...before, row('write'), row('elsewhere', 'another-plugin')]
  const all = { [files]: binding('all', ['read']) }, custom = { [files]: binding('custom', ['read']) }
  const first = resolve(all, before)
  assert.deepEqual(first.definition.tools, ['read'])
  assert.deepEqual(resolve(all, after).definition.tools, ['read', 'write'])
  assert.deepEqual(resolve(custom, after).definition.tools, ['read'])
  assert.deepEqual(resolveCapabilities({ ...base, tools: ['read'] }, after).definition.tools, ['read'])
  assert.deepEqual(first.resolution.tools, ['read'], 'an earlier resolved snapshot must retain its original tool set')
  assert.deepEqual(all[files], binding('all', ['read']), 'resolution must not mutate persistent intent')
})

test('disabled bindings retain stale choices without granting or validating them', () => {
  const selected = { missing: binding('all', ['gone'], false), [files]: binding('custom', ['read']) }
  const result = resolve(selected, [row('read'), row('write')])
  assert.deepEqual(result.definition.tools, ['read'])
  assert.deepEqual(result.resolution.plugins.map(plugin => plugin.id), [files])
  assert.deepEqual(result.definition.pluginBindings.missing, selected.missing)
})

test('enabled absent plugins and unavailable tools fail closed for every selection mode', () => {
  unavailable(() => resolve({ absent: binding('all') }, []))
  unavailable(() => resolve({ [files]: binding('custom', ['read']) }, [row('read', files, { unavailable: true })]))
  unavailable(() => resolveCapabilities({ ...base, tools: ['missing'] }, [row('read')]))
  unavailable(() => resolveCapabilities({ ...base, tools: ['read'] }, [row('read', files, { unavailable: true })]))
})

test('all adds new tools but remembered removals and ownership changes require an explicit update', () => {
  for (const mode of ['all', 'custom']) {
    unavailable(() => resolve({ [files]: binding(mode, ['read', 'removed']) }, [row('read'), row('write')]))
    unavailable(() => resolve({ [files]: binding(mode, ['read']) }, [row('read', 'other'), row('write')]))
  }
  assert.deepEqual(resolve({ [files]: binding('all', ['write']) }, [row('read', 'other'), row('write')]).definition.tools, ['write'])
})

test('unassigned is always exact and never expands even when supplied all mode', () => {
  const result = resolve({ unassigned: binding('all', ['old_exact']) }, [row('old_exact', null), row('new_unknown', null)])
  assert.deepEqual(result.definition.tools, ['old_exact'])
  assert.deepEqual(result.resolution.plugins, [{ id: 'unassigned', mode: 'custom', tools: ['old_exact'] }])
  // Legacy exact identities remain usable if trustworthy ownership is learned
  // later; users have not opted into that newly discovered plugin's whole set.
  assert.deepEqual(resolve({ unassigned: binding('custom', ['old_exact']) }, [row('old_exact', 'new-owner'), row('new_tool', 'new-owner')]).definition.tools, ['old_exact'])
  unavailable(() => resolve({ unassigned: binding('custom', ['gone']) }, []))
})

test('bindings are authoritative while connector exact selections remain separately available', () => {
  const input = { ...definition({ [files]: binding('custom', ['read']), unassigned: binding('custom', ['read']) }), tools: ['write', 'openconnector/server/action'] }
  const result = resolveCapabilities(input, [row('read'), row('write'), { id: 'openconnector/server/action', name: 'action', pluginId: null }])
  assert.deepEqual(result.definition.tools, ['openconnector/server/action', 'read'])
  assert.equal(result.resolution.tools.filter(name => name === 'read').length, 1)
})

test('each resolution records the current owner version without modifying earlier snapshots', () => {
  const choices = { [files]: binding('all', ['read']) }
  const first = resolve(choices, [row('read', files, { pluginVersion: '1.0.0' })])
  const second = resolve(choices, [row('read', files, { pluginVersion: '1.1.0' }), row('write', files, { pluginVersion: '1.1.0' })])
  assert.equal(first.resolution.plugins[0].version, '1.0.0')
  assert.equal(second.resolution.plugins[0].version, '1.1.0')
  assert.equal(second.resolution.version, 1)
  assert.ok(Number.isFinite(Date.parse(second.resolution.resolvedAt)))
})

test('skills require the resolved skill tool, not a stale flat selection or merely an enabled plugin', () => {
  const input = { ...definition({ [skill]: binding('all') }), skills: ['library-knowledge'] }
  assert.deepEqual(resolveCapabilities(input, [row('skill', skill)]).definition.tools, ['skill'])
  unavailable(() => resolveCapabilities({ ...input, pluginBindings: { [skill]: binding('custom') } }, [row('skill', skill)]))
  unavailable(() => resolveCapabilities({ ...input, tools: ['skill'], pluginBindings: {} }, [row('skill', skill)]))
})

test('official tools group by their actual npm package including subpath and configuration variants', () => {
  const official = '@deepseek-ai/dsh-tool-subagent-control'
  const registration = owner(`${official}/list-agents`, 'preset:list-agents')
  assert.deepEqual(ownerOfRegistration(registration, [{ name: '@deepseek-ai/dsh-base', rows: [{ moduleName: registration.moduleName, entryId: registration.entryId }] }]), { id: official, packageName: official, origin: 'official' })
  assert.equal(ownerOfRegistration(owner('@deepseek-ai/dsh-tool-subagent', 'spawn')).id, ownerOfRegistration(owner('@deepseek-ai/dsh-tool-subagent', 'fork')).id)
})

test('Office tools under the Univer row group under their exact owning bundle', () => {
  const registration = owner('dsh-workbench-univer', 'profile:workbench-univer')
  const bundles = [{ name: 'dsh-workbench-office', version: '1.1.1', rows: [{ rowId: 'workbench-univer', entryId: 'profile:workbench-univer', moduleName: 'dsh-workbench-univer' }] }]
  assert.deepEqual(ownerOfRegistration(registration, bundles), { id: 'dsh-workbench-office', packageName: 'dsh-workbench-office', origin: 'custom', version: '1.1.1' })
  assert.equal(ownerOfRegistration(owner('dsh-workbench-univer', 'other:workbench-univer'), bundles).id, 'dsh-workbench-univer', 'local row IDs cannot establish ownership across distinct Loader trees')
})

test('custom tools do not inherit official preset-registry ownership or the dsh-base umbrella', () => {
  const ancestor = { moduleName: '@deepseek-ai/dsh-agent-preset', entryId: 'default-preset' }
  const registration = owner('custom-tools', 'custom-tools', [ancestor])
  const bundles = [{ name: '@deepseek-ai/dsh-base', rows: [ancestor] }]
  assert.deepEqual(ownerOfRegistration(registration, bundles), { id: 'custom-tools', packageName: 'custom-tools', origin: 'custom' })
  assert.equal(ownerOfRegistration(owner('file:///plugin/tools.mjs', 'file-tools', [ancestor]), bundles), null)
})

test('Media can be attributed through the custom bundle owning its official preset declaration row', () => {
  const ancestor = { moduleName: '@deepseek-ai/dsh-agent-preset', entryId: 'media-assistant' }
  const registration = owner('dsh-media-tools', 'media-assistant:tools', [ancestor])
  const bundles = [{ name: 'dsh-workbench-media-studio', version: '1.8.7', rows: [ancestor] }]
  assert.equal(ownerOfRegistration(registration, bundles).id, 'dsh-workbench-media-studio')
})

test('unassigned, mismatched and ambiguous provenance is never inferred from tool names or absent entry IDs', () => {
  assert.equal(ownerOfRegistration(undefined), null)
  assert.equal(ownerOfRegistration({ name: 'library_search' }), null)
  assert.equal(ownerOfRegistration(owner('file:///anonymous.mjs', 'anonymous')), null)
  const bundles = [{ name: 'bundle', rows: [{ moduleName: 'custom-tools' }] }]
  assert.equal(ownerOfRegistration({ moduleName: 'custom-tools' }, bundles).id, 'custom-tools')
  const registration = owner('custom-tools', 'tools')
  assert.equal(ownerOfRegistration(registration, [{ name: 'one', rows: [registration] }, { name: 'two', rows: [registration] }]).id, 'custom-tools')
  assert.equal(ownerOfRegistration(registration, [{ name: 'one', rows: [{ entryId: 'tools', moduleName: 'another-module' }] }]).id, 'custom-tools')
  assert.equal(packageOf('@deepseek-ai/dsh-tool-fs/subpath'), files)
  for (const module of ['./local.mjs', '/absolute/plugin.mjs', 'file:///plugin.mjs', 'cordis:tool']) assert.equal(packageOf(module), null)
})

test('scope inventory reads actual registrations and bundle versions without creating sessions', async () => {
  const scope = {}, registration = owner('custom-tools', 'tools')
  const ctx = {
    get(name) { assert.equal(name, 'pluginManager'); return { listBundles: async () => [{ name: 'bundle', version: '2.0.0', rows: [registration] }] } },
    tools: {
      schemas(key) { assert.equal(key, scope); return [{ name: 'actual', description: 'Live description' }, { name: 'unknown' }] },
      registrationOf(name, key) { assert.equal(key, scope); return name === 'actual' ? registration : undefined },
    },
  }
  const tools = await toolsForScope(ctx, scope)
  assert.deepEqual(tools[0], { name: 'actual', description: 'Live description', pluginId: 'bundle', pluginVersion: '2.0.0', registration })
  assert.deepEqual(tools[1], { name: 'unknown', description: '', pluginId: null })
  ctx.get = () => ({ listBundles: async () => { throw Error('manager unavailable') } })
  assert.equal((await toolsForScope(ctx, scope))[0].pluginId, 'custom-tools')
})

test('a row declared by one of Studio\'s own parts belongs to the Studio bundle', () => {
  const registration = { moduleName: 'dsh-workbench-agent-studio-service/creator-agent', entryId: 'studio-creator-tools', entryChain: [{ entryId: 'studio-creator-tools', moduleName: 'dsh-workbench-agent-studio-service/creator-agent' }] }
  assert.deepEqual(ownerOfRegistration(registration, [{ name: 'dsh-workbench-agent-studio', version: '1.13.0', rows: [] }]),
    { id: 'dsh-workbench-agent-studio', packageName: 'dsh-workbench-agent-studio', origin: 'custom', version: '1.13.0' })
  assert.equal(ownerOfRegistration({ moduleName: 'dsh-workbench-agent-studio-extras' }).id, 'dsh-workbench-agent-studio-extras')
})

