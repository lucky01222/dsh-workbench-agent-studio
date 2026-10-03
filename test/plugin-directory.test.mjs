import test from 'node:test'
import assert from 'node:assert/strict'
import { readPluginDirectory } from '../packages/ui/src/client/plugin-directory.mjs'
import { buildPluginCatalog } from '../packages/ui/src/client/plugin-capabilities.mjs'

test('installation-supplied bundles remain available and management diagnostics are renderable strings', async () => {
  const remote = {
    pluginInventory: { list: async () => ({ ok: true, value: { managementAvailable: true } }) },
    pluginManager: { listBundles: async () => ({ ok: true, value: [
      { name: '@deepseek-ai/dsh-tool-fs', enabled: true, installed: false, version: '0.1.7-rc.2' },
      { name: 'dsh-workbench-library', enabled: false, installed: true, error: { code: 'MODULE_FAILED', diagnostic: 'Dependency unavailable' } },
    ] }) },
  }
  const directory = await readPluginDirectory(remote)
  assert.equal(directory.bundles[0].installed, undefined)
  assert.equal(directory.bundles[1].error, 'Dependency unavailable')
  const catalog = buildPluginCatalog([{ name: 'read', description: 'Read' }], { installedBundles: directory.bundles })
  assert.equal(catalog.find(plugin => plugin.id === '@deepseek-ai/dsh-tool-fs').available, true)
  assert.equal(typeof catalog.find(plugin => plugin.id === 'dsh-workbench-library').reason, 'string')
})
test('raw ManagementError supplied to the model cannot reach React as an object', () => {
  const catalog = buildPluginCatalog([], { installedBundles: [{ name: 'dsh-workbench-library', error: { code: 'INCOMPATIBLE_VERSION' } }] })
  assert.equal(catalog.find(plugin => plugin.id === 'dsh-workbench-library').reason, 'INCOMPATIBLE_VERSION')
})
test('unmanaged and failed remotes use explicit fallback instead of invented installation state', async () => {
  let calls = 0
  const directory = await readPluginDirectory({ pluginInventory: { list: async () => ({ ok: true, value: {} }) }, pluginManager: { listBundles: async () => { calls++; return { ok: true, value: [] } } } })
  assert.deepEqual(directory, { bundles: [], managementAvailable: false })
  assert.equal(calls, 0)
  await assert.rejects(readPluginDirectory({ pluginInventory: { list: async () => ({ ok: false }) } }), /插件状态/)
})
