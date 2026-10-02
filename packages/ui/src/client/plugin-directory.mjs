/** Read existing rc.2 management remotes. This adds no Host endpoint or tool. */
const diagnostic = error => typeof error === 'string' ? error : typeof error?.diagnostic === 'string' ? error.diagnostic : typeof error?.code === 'string' ? error.code : '插件状态读取失败。'

export async function readPluginDirectory(remote) {
  const inventory = await remote.pluginInventory.list()
  if (!inventory.ok) throw new Error('无法读取工作台插件状态，请刷新后重试。')
  if (inventory.value.managementAvailable !== true) return { bundles: [], managementAvailable: false }
  const response = await remote.pluginManager.listBundles()
  if (!response.ok) throw new Error('无法读取已安装插件，请刷新后重试。')
  return {
    managementAvailable: true,
    bundles: response.value.map(bundle => ({
      packageName: bundle.name, version: bundle.version,
      // rc.2 installed means profile ownership, not physical presence. The live
      // tool catalog remains availability authority for installation-supplied bundles.
      enabled: bundle.enabled, ...(bundle.error ? { error: diagnostic(bundle.error) } : {}),
    })),
  }
}
