import { Definition } from './schema.mjs'

export const LIBRARY_OWNER = 'dsh-workbench-library'
export const LEGACY_KNOWLEDGE_OWNER = 'dsh-library-knowledge'
export const LIBRARY_UNIFIED_CONTRACT = 'library-unified-v1'
export const LEGACY_LIBRARY_TOOLS = Object.freeze(['library_locate', 'library_entities', 'library_relations', 'library_get', 'library_correct', 'library_operation', 'library_undo', 'library_sources', 'library_ingest', 'library_ingest_operation'])
export const LEGACY_KNOWLEDGE_TOOLS = Object.freeze(['library_list', 'library_search', 'library_read', 'library_evidence', 'library_graph'])
const knowledge = new Set(LEGACY_KNOWLEDGE_TOOLS)
const library = new Set(LEGACY_LIBRARY_TOOLS)
const universe = new Set([...library, ...knowledge])
const unique = values => [...new Set(values)]
const clone = value => structuredClone(value)
const unavailable = message => Object.assign(new Error(message), { code: 'CAPABILITY_UNAVAILABLE' })
const keyOf = row => row.id || row.name

/** A versioned owner contract, not a name-prefix or display-name inference. */
export function isUnifiedLibraryVersion(value) {
  const match = typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) && Number.isSafeInteger(patch)
    && (major > 0 || minor > 23 || minor === 23 && patch >= 1)
}
function verifiedUnifiedRow(name, row) {
  return universe.has(name) && !!row && !row.unavailable && row.name === name && keyOf(row) === name
    && row.pluginId === LIBRARY_OWNER && isUnifiedLibraryVersion(row.pluginVersion)
}
/** Only this known historical package's five exact read tools can change owner. */
export function isCompatibleLibraryToolOwner(name, oldOwner, row) {
  return oldOwner === LEGACY_KNOWLEDGE_OWNER && knowledge.has(name) && verifiedUnifiedRow(name, row)
}
function oldLibraryChoice(choice) {
  return !!choice && !choice.tools.some(name => knowledge.has(name))
}
export function isLegacyLibraryBinding(owner, choice) {
  return owner === LEGACY_KNOWLEDGE_OWNER || owner === LIBRARY_OWNER && choice?.mode === 'all' && oldLibraryChoice(choice)
}
function unifiedCandidate(rows) {
  return rows.some(row => row.pluginId === LIBRARY_OWNER && (universe.has(row.name) && isUnifiedLibraryVersion(row.pluginVersion) || knowledge.has(row.name)))
}
function permissionProjection(definition) {
  return { tools: [...definition.tools], pluginBindings: definition.pluginBindings === undefined ? undefined : clone(definition.pluginBindings) }
}

/** Pure, versioned migration plan. It never expands an unrelated plugin or writes a definition. */
export function planLibraryOwnerMigration(input, rows, { policy = 'saved' } = {}) {
  const definition = Definition.parse(input), before = permissionProjection(definition)
  const result = { status: 'not-needed', version: 1, before, after: clone(before), added: [], removed: [], disabledBindings: {}, reasons: [], affectedOwners: [] }
  if (!['saved', 'current'].includes(policy)) return { ...result, status: 'blocked', reasons: ['不支持的资料库权限迁移策略'] }
  const bindings = definition.pluginBindings
  if (!bindings) return result
  const priorLibrary = bindings[LIBRARY_OWNER], priorKnowledge = bindings[LEGACY_KNOWLEDGE_OWNER]
  const affected = !!priorKnowledge || !!priorLibrary && priorLibrary.mode === 'all' && oldLibraryChoice(priorLibrary)
  if (!affected) return result
  const owners = [LIBRARY_OWNER, LEGACY_KNOWLEDGE_OWNER].filter(id => bindings[id])
  result.affectedOwners = owners
  for (const id of owners) if (!bindings[id].enabled) result.disabledBindings[id] = clone(bindings[id])
  const reasons = []
  if (!rows.some(row => verifiedUnifiedRow(row.name, row))) reasons.push('统一资料库的真实工具归属或版本尚未核验')
  const index = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    if (index.has(key) && universe.has(key)) reasons.push(`资料库工具存在歧义注册：${key}`)
    index.set(key, row)
  }
  const selected = []
  for (const id of owners) {
    const choice = bindings[id]
    if (!choice.enabled) continue
    if (choice.mode === 'all' && choice.tools.length === 0) {
      reasons.push(`旧全部选择没有可证明的保存名单：${id}`)
      continue
    }
    const old = id === LEGACY_KNOWLEDGE_OWNER || oldLibraryChoice(choice)
    const allowed = id === LEGACY_KNOWLEDGE_OWNER ? knowledge : old ? library : universe
    for (const name of choice.tools) if (!allowed.has(name)) reasons.push(`工具不属于已核验的原插件合同：${id}/${name}`)
    // current is an explicit preview policy, not runtime's default. It can add
    // only the original Library's fixed ten tools, never retrieval or future names.
    const intended = policy === 'current' && id === LIBRARY_OWNER && old && choice.mode === 'all'
      ? LEGACY_LIBRARY_TOOLS : choice.tools
    for (const name of intended) {
      if (!verifiedUnifiedRow(name, index.get(name))) reasons.push(`工具缺失、不可用或归属/版本未核验：${name}`)
      else selected.push(name)
    }
  }
  if (reasons.length) return { ...result, status: 'blocked', reasons: unique(reasons) }
  const enabled = owners.some(id => bindings[id].enabled), tools = unique(selected)
  const inactiveTools = enabled ? [] : unique(owners.flatMap(id => bindings[id].tools.filter(name => {
    const allowed = id === LEGACY_KNOWLEDGE_OWNER ? knowledge : oldLibraryChoice(bindings[id]) ? library : universe
    return allowed.has(name) && verifiedUnifiedRow(name, index.get(name))
  })))
  const afterBindings = Object.fromEntries(Object.entries(bindings).filter(([id]) => !owners.includes(id)).map(([id, choice]) => [id, clone(choice)]))
  afterBindings[LIBRARY_OWNER] = { enabled, mode: 'custom', tools: enabled ? tools : inactiveTools }
  // Flat tools cache only enabled authority. Disabled legacy choices survive in
  // the plan/receipt, not by being unioned into the active merged allowlist.
  const otherSelected = new Set(Object.values(afterBindings).filter(choice => choice.enabled).flatMap(choice => choice.tools))
  const remaining = definition.tools.filter(name => !universe.has(name) || otherSelected.has(name))
  const after = { tools: unique([...remaining, ...tools]), pluginBindings: afterBindings }
  return { ...result, status: 'ready', after, added: after.tools.filter(name => !before.tools.includes(name)), removed: before.tools.filter(name => !after.tools.includes(name)) }
}

/** Compatibility is in-memory until an explicit, reversible definition migration is applied. */
export function normalizeLibraryOwnerBindings(input, rows) {
  const definition = Definition.parse(input)
  // A Studio-only upgrade may still run against the original two packages.
  // Do not reinterpret their unchanged owners before the unified provider exists.
  if (!unifiedCandidate(rows)) return definition
  const plan = planLibraryOwnerMigration(definition, rows)
  if (plan.status === 'blocked') throw unavailable(plan.reasons.join('；'))
  if (plan.status === 'not-needed') return definition
  return { ...definition, tools: [...plan.after.tools], pluginBindings: clone(plan.after.pluginBindings) }
}
