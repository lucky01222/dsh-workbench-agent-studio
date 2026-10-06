import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { Definition, CapabilityResolution } from './schema.mjs'
import { normalizeLibraryOwnerBindings } from './library-owner-compat.mjs'

const require = createRequire(import.meta.url)
const unique = values => [...new Set(values)]
const unavailable = message => Object.assign(new Error(message), { code: 'CAPABILITY_UNAVAILABLE' })
export const packageOf = name => typeof name === 'string' && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/|$)/i.test(name)
  && !name.startsWith('.') && !name.includes(':') ? name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/') : null

/** Ownership comes from the actual registering fiber and the installed bundle's rows. */
export function ownerOfRegistration(registration, bundles = []) {
  if (!registration) return null
  const packageName = packageOf(registration.moduleName)
  if (packageName?.startsWith('@deepseek-ai/')) return { id: packageName, packageName, origin: 'official' }
  const chain = registration.entryChain?.length ? registration.entryChain : [registration]
  for (const entry of chain) {
    // The registered module may live under an official preset declaration.
    // That infrastructure ancestor does not become the tool's owner. A custom
    // bundle can nevertheless own that exact preset row (for example Media).
    if (typeof entry.entryId !== 'string' || !entry.entryId) continue
    const exact = bundles.filter(bundle => !bundle.name.startsWith('@deepseek-ai/')
      && bundle.rows?.some(row => row.entryId === entry.entryId && row.moduleName === entry.moduleName))
    if (exact.length === 1) return { id: exact[0].name, packageName: exact[0].name, origin: 'custom', ...(exact[0].version ? { version: exact[0].version } : {}) }
  }
  if (!packageName || packageName === 'cordis') return null
  const direct = bundles.find(bundle => bundle.name === packageName)
  return { id: packageName, packageName, origin: packageName.startsWith('@deepseek-ai/') ? 'official' : 'custom', ...(direct?.version ? { version: direct.version } : {}) }
}

async function installedVersion(packageName) {
  try { return JSON.parse(await readFile(require.resolve(`${packageName}/package.json`), 'utf8')).version } catch { return undefined }
}

/** No inferred tool-name prefixes and no model/session creation during inventory. */
export async function toolsForScope(ctx, scope) {
  let bundles = []
  try { bundles = await ctx.get('pluginManager')?.listBundles() || [] } catch { /* Package identity remains available without management. */ }
  const versions = new Map()
  return Promise.all(ctx.tools.schemas(scope).map(async tool => {
    const registration = ctx.tools.registrationOf?.(tool.name, scope)
    const owner = ownerOfRegistration(registration, bundles)
    if (owner && !versions.has(owner.id)) versions.set(owner.id, owner.version || installedVersion(owner.packageName))
    const version = owner ? await versions.get(owner.id) : undefined
    return { name: tool.name, description: tool.description || '', pluginId: owner?.id || null,
      ...(version ? { pluginVersion: version } : {}),
      ...(registration ? { registration } : {}) }
  }))
}

/** Resolve intent once. Old flat definitions remain exact; bindings never grant unknown tools. */
export function resolveCapabilities(input, toolRows) {
  const definition = normalizeLibraryOwnerBindings(Definition.parse(input), toolRows)
  const index = new Map(toolRows.map(row => [row.id || row.name, row]))
  const plugins = [], selected = []
  if (definition.pluginBindings === undefined) selected.push(...definition.tools)
  else {
    selected.push(...definition.tools.filter(name => name.startsWith('openconnector/')))
    for (const [id, binding] of Object.entries(definition.pluginBindings)) {
      if (!binding.enabled) continue
      const owned = toolRows.filter(row => row.pluginId === id && !row.unavailable)
      if (id !== 'unassigned' && !owned.length) throw unavailable(`插件不可用或尚未提供工具：${id}`)
      for (const name of binding.tools) {
        const row = index.get(name)
        if (!row || row.unavailable) throw unavailable(`工具不可用：${name}`)
        if (id !== 'unassigned' && row.pluginId !== id) throw unavailable(`工具归属已变化，请重新选择：${name}`)
      }
      const tools = binding.mode === 'all' && id !== 'unassigned' ? owned.map(row => row.id || row.name) : binding.tools
      selected.push(...tools)
      const version = owned.find(row => row.pluginVersion)?.pluginVersion
      plugins.push({ id, mode: id === 'unassigned' ? 'custom' : binding.mode, tools: unique(tools), ...(version ? { version } : {}) })
    }
  }
  const tools = unique(selected)
  for (const name of tools) if (!index.has(name) || index.get(name).unavailable) throw unavailable(`工具不可用：${name}`)
  if (definition.skills.length && !tools.includes('skill')) throw unavailable('已选 Skills 需要启用 skill 工具')
  const resolution = CapabilityResolution.parse({ version: 1, resolvedAt: new Date().toISOString(), tools, plugins, toolOwners: Object.fromEntries(tools.filter(name => index.get(name)?.pluginId).map(name => [name, index.get(name).pluginId])) })
  const pluginBindings = definition.pluginBindings === undefined ? undefined : Object.fromEntries(Object.entries(definition.pluginBindings).map(([id, binding]) => [id, { ...binding, tools: plugins.find(plugin => plugin.id === id)?.tools || binding.tools }]))
  return { definition: { ...definition, tools, ...(pluginBindings ? { pluginBindings } : {}) }, resolution }
}
