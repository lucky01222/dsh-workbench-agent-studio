import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPluginCatalog, selectionFromTools, flattenPluginSelection, setPluginEnabled,
  setPluginMode, proposePluginMode, togglePluginTool, setOfficialBundle,
  proposeOfficialBundle, officialBundleState, summarizePluginSelection,
  chosenPluginTools, clonePluginSelection, KNOWN_PLUGIN_CONTRACTS,
} from '../packages/ui/src/client/plugin-capabilities.mjs'

const rows = (...names) => names.map(name => ({ name, description: `Host description: ${name}` }))
const plugin = (catalog, suffix) => catalog.find(item => item.id.endsWith(suffix))
const frozen = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') frozen(child); return Object.freeze(value) }

test('verified contracts retain 16 official owners / 29 tools and 4 custom owners / 28 tools', () => {
  const official = KNOWN_PLUGIN_CONTRACTS.filter(item => item.origin === 'official')
  const custom = KNOWN_PLUGIN_CONTRACTS.filter(item => item.origin === 'custom')
  assert.equal(official.length, 16)
  assert.equal(official.flatMap(item => item.names).length, 29)
  assert.equal(custom.length, 4)
  assert.equal(custom.flatMap(item => item.names).length, 28)
})

test('known owner does not imply installation or tool availability; live description is retained', () => {
  const catalog = buildPluginCatalog(rows('read', 'library_search'))
  const files = plugin(catalog, 'dsh-tool-fs')
  assert.equal(files.installed, undefined)
  assert.equal(files.available, true)
  assert.equal(files.tools.find(item => item.name === 'read').description, 'Host description: read')
  assert.equal(files.tools.find(item => item.name === 'write').available, false)
  const media = plugin(catalog, 'dsh-workbench-media-studio')
  assert.equal(media.available, false)
  assert.ok(media.requiresContext)
  assert.deepEqual(setPluginEnabled({}, media, true), {})
  assert.deepEqual(flattenPluginSelection({ [media.id]: { enabled: true, mode: 'all', tools: [] } }, catalog), [])
})

test('unknown tool names and unverified qualified identities are never guessed from prefixes', () => {
  const catalog = buildPluginCatalog([
    ...rows('library_delete', 'univer_magic', 'media_generate'),
    { id: 'external/read', name: 'read', description: 'Another provider' },
    { id: 'openconnector/svc/action', name: 'action', description: '', source: 'openconnector' },
  ])
  const unknown = plugin(catalog, 'unassigned')
  assert.deepEqual(unknown.tools.map(item => item.id), ['library_delete', 'univer_magic', 'media_generate', 'external/read'])
  assert.equal(plugin(catalog, 'dsh-tool-fs').available, false)
})

test('stale capability names and unverified provider aliases do not acquire official ownership', () => {
  const stale = ['enter_plan_mode', 'cordis_inspect_self', 'cordis_define', 'cordis_run', 'cordis_stop', 'cordis_undefine']
  const catalog = buildPluginCatalog([
    ...rows(...stale),
    { id: 'filesystem/read', name: 'read', description: 'Unverified identity' },
    { id: 'host/library_search', name: 'library_search', description: 'Unverified identity' },
  ])
  const ids = [...stale, 'filesystem/read', 'host/library_search']
  assert.deepEqual(plugin(catalog, 'unassigned').tools.map(item => item.id), ids)
  assert.equal(plugin(catalog, 'dsh-plan-mode').available, false)
  assert.equal(plugin(catalog, 'dsh-tool-cordis').available, false)
  assert.equal(plugin(catalog, 'dsh-tool-fs').available, false)
  assert.equal(plugin(catalog, 'dsh-library-knowledge').available, false)
  assert.deepEqual(flattenPluginSelection(selectionFromTools(ids, catalog), catalog), ids)
  assert.deepEqual(flattenPluginSelection(setOfficialBundle({}, catalog, true), catalog), [])
})

test('legacy exact selections never become all mode, even when all currently available tools are chosen', () => {
  const catalog = buildPluginCatalog(rows('read', 'write', 'edit', 'read_image'))
  const selection = selectionFromTools(['read', 'write', 'edit', 'read_image'], catalog)
  const files = plugin(catalog, 'dsh-tool-fs')
  assert.equal(selection[files.id].mode, 'custom')
  assert.deepEqual(flattenPluginSelection(selection, catalog), ['read', 'write', 'edit', 'read_image'])
})

test('same-mode custom click is a no-op and expansion waits for confirmation; cancellation changes nothing', () => {
  const catalog = buildPluginCatalog(rows('read', 'write', 'edit', 'read_image'))
  const files = plugin(catalog, 'dsh-tool-fs')
  const selection = frozen(selectionFromTools(['read'], catalog))
  assert.equal(setPluginMode(selection, files, 'custom'), selection)
  assert.equal(setPluginMode(selection, files, 'all'), selection)
  const proposal = proposePluginMode(selection, files, 'all')
  assert.equal(proposal.selection, selection)
  assert.deepEqual(proposal.pending.toolIds, ['write', 'edit', 'read_image'])
  assert.equal(proposal.pending.count, 3)
  assert.deepEqual(flattenPluginSelection(selection, catalog), ['read'])
  const accepted = setPluginMode(selection, files, 'all', { confirmed: true })
  assert.equal(accepted[files.id].mode, 'all')
  assert.deepEqual(flattenPluginSelection(accepted, catalog), ['read', 'write', 'edit', 'read_image'])
})

test('existing unavailable and unknown tools survive refresh and mode changes with exact identities', () => {
  const catalog = buildPluginCatalog(rows('library_search'))
  const selection = selectionFromTools(['library_search', 'library_correct', 'old_exact_tool', 'openconnector/svc/a'], catalog)
  assert.deepEqual(flattenPluginSelection(selection, catalog), ['library_search', 'library_correct', 'old_exact_tool'])
  const refreshed = selectionFromTools(flattenPluginSelection(selection, catalog), buildPluginCatalog([]), selection)
  assert.deepEqual(flattenPluginSelection(refreshed, buildPluginCatalog([])), ['library_search', 'library_correct', 'old_exact_tool'])
  const unknown = plugin(catalog, 'unassigned')
  assert.equal(chosenPluginTools(unknown, selection)[0].available, false)
  const summary = summarizePluginSelection(selection, catalog)
  assert.equal(summary.unavailable, 2)
  assert.equal(summary.unassigned, 1)
})

test('disabling and re-enabling a known custom subset does not widen it', () => {
  const catalog = buildPluginCatalog(rows('read', 'write'))
  const files = plugin(catalog, 'dsh-tool-fs')
  const initial = frozen(selectionFromTools(['read'], catalog))
  const off = setPluginEnabled(initial, files, false)
  assert.deepEqual(flattenPluginSelection(off, catalog), [])
  const on = setPluginEnabled(off, files, true)
  assert.deepEqual(flattenPluginSelection(on, catalog), ['read'])
  assert.deepEqual(initial[files.id].tools, ['read'])
})

test('whole mode resolves new actually registered tools; custom subset stays exact after catalog refresh', () => {
  const before = buildPluginCatalog(rows('read'))
  const files = plugin(before, 'dsh-tool-fs')
  const whole = setPluginEnabled({}, files, true)
  const subset = selectionFromTools(['read'], before)
  const after = buildPluginCatalog(rows('read', 'write', 'unowned_new_tool'))
  const restoredWhole = selectionFromTools(['read'], after, whole)
  const restoredSubset = selectionFromTools(['read'], after, subset)
  assert.deepEqual(flattenPluginSelection(restoredWhole, after), ['read', 'write'])
  assert.deepEqual(flattenPluginSelection(restoredSubset, after), ['read'])
})

test('official bundle has none / partial / all states and confirms broadening existing subsets atomically', () => {
  const catalog = buildPluginCatalog(rows('read', 'write', 'bash', 'library_search'))
  const initial = frozen(selectionFromTools(['read', 'library_search'], catalog))
  assert.equal(officialBundleState(catalog, {}), 'none')
  assert.equal(officialBundleState(catalog, initial), 'partial')
  const proposed = proposeOfficialBundle(initial, catalog, true)
  assert.equal(proposed.selection, initial)
  assert.deepEqual(proposed.pending.toolIds, ['write', 'bash'])
  assert.equal(proposed.pending.count, 2)
  assert.equal(setOfficialBundle(initial, catalog, true), initial)
  const all = setOfficialBundle(initial, catalog, true, { confirmed: true })
  assert.equal(officialBundleState(catalog, all), 'all')
  assert.deepEqual(new Set(flattenPluginSelection(all, catalog)), new Set(['read', 'write', 'bash', 'library_search']))
  const cleared = setOfficialBundle(all, catalog, false)
  assert.equal(officialBundleState(catalog, cleared), 'none')
  assert.deepEqual(flattenPluginSelection(cleared, catalog), ['library_search'])
})

test('deselecting one tool in all mode creates an exact custom subset', () => {
  const catalog = buildPluginCatalog(rows('read', 'write', 'edit'))
  const files = plugin(catalog, 'dsh-tool-fs')
  const selection = frozen(setPluginEnabled({}, files, true))
  assert.equal(togglePluginTool(selection, files, 'read', true), selection)
  const subset = togglePluginTool(selection, files, 'write', false)
  assert.equal(subset[files.id].mode, 'custom')
  assert.deepEqual(flattenPluginSelection(subset, catalog), ['read', 'edit'])
})

test('an unknown tool checkbox never restores a hidden unknown group of tools', () => {
  const catalog = buildPluginCatalog(rows('first_unknown', 'second_unknown'))
  const unknown = plugin(catalog, 'unassigned')
  const selection = { unassigned: { enabled: false, mode: 'custom', tools: ['second_unknown'] } }
  const next = togglePluginTool(selection, unknown, 'first_unknown', true)
  assert.deepEqual(flattenPluginSelection(next, catalog), ['first_unknown'])
  assert.equal(togglePluginTool(next, unknown, 'first_unknown', false).unassigned.enabled, false)
})

test('real bundle metadata can mark a bundle stopped; absence of bundle metadata leaves official installation unknown', () => {
  const catalog = buildPluginCatalog(rows('library_search', 'read'), {
    installedBundles: [{ packageName: 'dsh-library-knowledge', installed: true, enabled: false, version: '0.10.0', error: 'Stopped by user' }],
  })
  const knowledge = plugin(catalog, 'dsh-library-knowledge')
  assert.equal(knowledge.installed, true)
  assert.equal(knowledge.version, '0.10.0')
  assert.equal(knowledge.available, false)
  assert.equal(knowledge.reason, 'Stopped by user')
  assert.equal(plugin(catalog, 'dsh-tool-fs').installed, undefined)
  const old = selectionFromTools(['library_search'], catalog)
  assert.deepEqual(flattenPluginSelection(old, catalog), ['library_search'])
})

test('legacy choice is copied without shared arrays and special object keys do not change the prototype', () => {
  const selection = Object.fromEntries([['__proto__', { enabled: true, mode: 'custom', tools: ['exact'] }]])
  const copy = clonePluginSelection(selection)
  copy.__proto__.tools.push('another')
  assert.deepEqual(selection.__proto__.tools, ['exact'])
  assert.equal(Object.getPrototypeOf(copy), Object.prototype)
})

test('authoritative null ownership suppresses static-name fallback and declared but absent tools', () => {
  const catalog = buildPluginCatalog([
    { name: 'library_search', description: 'Reliable unknown owner', pluginId: null },
    { name: 'read', description: 'Metadata absent in an authoritative response' },
  ], { capabilityBindings: true })
  assert.deepEqual(plugin(catalog, 'unassigned').tools.map(tool => tool.id), ['library_search', 'read'])
  assert.equal(catalog.some(item => item.id === 'dsh-library-knowledge'), false)
  assert.equal(catalog.some(item => item.id === '@deepseek-ai/dsh-tool-fs'), false)
})

test('dynamic registration adds arbitrary tools to its authoritative plugin without name guesses', () => {
  const id = 'custom-research-plugin'
  const before = buildPluginCatalog([{ name: 'lookup_a', description: 'Read A', pluginId: id, pluginVersion: '1.0.0' }])
  const dynamic = plugin(before, id)
  assert.equal(dynamic.discovery, 'host-registry')
  assert.equal(dynamic.version, '1.0.0')
  const whole = setPluginEnabled({}, dynamic, true)
  const exact = { [id]: { enabled: true, mode: 'custom', tools: ['lookup_a'] } }
  const after = buildPluginCatalog([
    { name: 'lookup_a', description: 'Read A', pluginId: id, pluginVersion: '1.1.0' },
    { name: 'find_b', description: 'Find B', pluginId: id, pluginVersion: '1.1.0' },
  ], { capabilityBindings: true, selection: whole })
  assert.deepEqual(flattenPluginSelection(whole, after), ['lookup_a', 'find_b'])
  assert.deepEqual(flattenPluginSelection(exact, after), ['lookup_a'])
})

test('a tool moving to another authoritative owner remains missing under the saved original owner', () => {
  const oldId = '@deepseek-ai/dsh-tool-fs'
  const saved = { [oldId]: { enabled: true, mode: 'all', tools: ['read'] } }
  const catalog = buildPluginCatalog([{ name: 'read', description: 'Different provider', pluginId: 'other-reader' }], { capabilityBindings: true, selection: saved })
  const restored = selectionFromTools(['read'], catalog, saved)
  assert.equal(restored['other-reader'], undefined)
  assert.equal(chosenPluginTools(plugin(catalog, 'dsh-tool-fs'), restored)[0].available, false)
  assert.equal(summarizePluginSelection(restored, catalog).unavailable, 1)
  const legacy = selectionFromTools(['read'], buildPluginCatalog([{ name: 'read', description: '', pluginId: 'other-reader' }]))
  assert.equal(legacy['other-reader'], undefined)
  assert.deepEqual(legacy.unassigned.tools, ['read'])
})

test('official bundle stays partial when a saved official plugin has lost every available tool', () => {
  const id = '@deepseek-ai/dsh-tool-fs'
  const saved = { [id]: { enabled: true, mode: 'all', tools: ['read'] } }
  const catalog = buildPluginCatalog([], { capabilityBindings: true, selection: saved })
  assert.equal(officialBundleState(catalog, saved), 'partial')
  assert.equal(summarizePluginSelection(saved, catalog).unavailable, 1)
})
