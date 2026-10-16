/**
 * Frontend presentation of verified registration contracts for Harness 0.1.7-rc.2.
 * Old Hosts use explicit verified contracts. New Hosts supply authoritative
 * pluginId metadata; the table then supplies labels rather than ownership.
 */
const official = (suffix, key, name, description, tools, provider) => ({
  id: `@deepseek-ai/${suffix}`, packageName: `@deepseek-ai/${suffix}`,
  name, nameKey: `pluginCapability${key}`, description,
  descriptionKey: `pluginCapability${key}Description`, origin: 'official',
  names: tools, provider, discovery: 'known-registration',
})
const custom = (packageName, key, name, description, tools, extra = {}) => ({
  id: packageName, packageName, name, nameKey: `pluginCapability${key}`,
  description, descriptionKey: `pluginCapability${key}Description`, origin: 'custom',
  names: tools, discovery: 'known-registration', ...extra,
})

export const KNOWN_PLUGIN_CONTRACTS = Object.freeze([
  official('dsh-tool-fs', 'Fs', '文件读写', '读取、写入与编辑本地文件。', ['read', 'write', 'edit', 'read_image'], 'filesystem'),
  official('dsh-tool-fs-search', 'FsSearch', '文件搜索', '按路径和内容查找文件。', ['glob', 'grep'], 'filesystem'),
  official('dsh-tool-str-replace-editor', 'StrReplace', '文本编辑', '按文本片段修改文件。', ['str_replace_editor'], 'string-editor'),
  official('dsh-tool-bash', 'Bash', '命令执行', '在当前工作目录执行 Shell 命令。', ['bash'], 'shell'),
  official('dsh-tool-jobs', 'Jobs', '后台任务', '查看、读取与停止后台任务。', ['job_output', 'job_list', 'job_kill'], 'jobs'),
  official('dsh-tool-skill', 'Skill', 'Skills', '加载 Agent 使用的技能指导。', ['skill'], 'skills'),
  official('dsh-tool-goal', 'Goal', '持续目标', '创建和更新持续目标。', ['get_goal', 'create_goal', 'update_goal'], 'goals'),
  official('dsh-tool-ask-user', 'AskUser', '用户交互', '向用户请求必要的信息。', ['ask_user_question'], 'interaction'),
  official('dsh-tool-todo', 'Todo', 'Todo 计划', '维护任务执行计划。', ['todo_write'], 'todo'),
  official('dsh-plan-mode', 'Plan', '计划模式', '提交方案并退出计划模式。', ['exit_plan_mode'], 'planning'),
  official('dsh-tool-web', 'Web', '网络检索', '检索互联网并读取网页。', ['web_search', 'web_fetch'], 'web'),
  official('dsh-tool-cordis', 'Cordis', 'Cordis 查询', '查看当前 Cordis 配置与组件。', ['cordis_inspect_list', 'cordis_inspect_query'], 'cordis'),
  official('dsh-tool-subagent-control', 'SubagentControl', '子 Agent 管理', '查看、联系和中断子 Agent。', ['send_message', 'interrupt_agent', 'list_agents'], 'delegation'),
  official('dsh-tool-subagent', 'Subagent', '子 Agent', '派发任务或分叉子 Agent。', ['subagent', 'subagent_fork'], 'delegation'),
  official('dsh-tool-workflow', 'Workflow', '工作流', '编排多个 Agent 的执行流程。', ['workflow'], 'delegation'),
  official('dsh-tool-ralph', 'Ralph', 'Ralph 循环', '运行迭代工作流程。', ['ralph'], 'delegation'),
  official('dsh-tool-present', 'Present', '文件交付', '把生成的文件声明为交付物，供用户直接打开。', ['present']),
  custom('dsh-workbench-library', 'Library', '资料库', '定位、读取、纠正和撤销资料库知识。', ['library_locate', 'library_entities', 'library_relations', 'library_get', 'library_correct', 'library_operation', 'library_undo'], { relatedSkills: ['library-knowledge'] }),
  custom('dsh-library-knowledge', 'Knowledge', '资料库知识工具', '检索知识并回读正文、证据与关系。', ['library_list', 'library_search', 'library_read', 'library_evidence', 'library_graph'], { relatedSkills: ['library-knowledge'], requiredPlugins: ['dsh-workbench-library'] }),
  custom('dsh-workbench-office', 'Office', '文档工作台', '创建、编辑、检查和导出文档。', ['univer_new', 'univer_status', 'univer_worktree', 'univer_unit', 'univer_import', 'univer_inspect', 'univer_execute', 'univer_export', 'univer_lint', 'univer_print_pdf', 'univer_compile_svg', 'univer_api', 'univer_resources', 'univer_screenshot'], { relatedSkills: ['univer', 'univer-base', 'univer-board', 'univer-cross-unit-formula', 'univer-doc', 'univer-embed', 'univer-sheet', 'univer-slide'] }),
  custom('dsh-workbench-agent-studio', 'AgentStudio', 'Agent 工作室', '读取工作室目录，检查、试跑和保存 Agent 草稿。', ['agent_studio_catalog', 'agent_studio_check', 'agent_studio_write_prompt', 'agent_studio_confirm', 'agent_studio_trial', 'agent_studio_save']),
  custom('dsh-workbench-media-studio', 'Media', '创作画布', '读取画布项目并提出修改建议。', ['media_read_project', 'media_propose_changes'], { requiresContext: '创作助手预设与画布项目绑定' }),
])

const nameOwner = new Map(KNOWN_PLUGIN_CONTRACTS.flatMap(plugin => plugin.names.map(name => [name, plugin.id])))
export const LIBRARY_OWNER='dsh-workbench-library'
export const LEGACY_KNOWLEDGE_OWNER='dsh-library-knowledge'
const retrievalNames=new Set(['library_list','library_search','library_read','library_evidence','library_graph'])
export const UNIFIED_LIBRARY_TOOLS=Object.freeze(['library_locate','library_entities','library_relations','library_get','library_correct','library_operation','library_undo','library_sources','library_ingest','library_ingest_operation',...retrievalNames])
/** Presentation guard only; the Host's migration preview remains authoritative. */
export function isUnifiedLibraryCatalog(rows=[]){return rows.some(row=>{const v=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/.exec(row?.pluginVersion||''),stable=!!v&&v.slice(1).map(Number).every(Number.isSafeInteger)&&(Number(v[1])>0||Number(v[2])>23||Number(v[2])===23&&Number(v[3])>=1);return row?.pluginId===LIBRARY_OWNER&&(retrievalNames.has(row.name)||UNIFIED_LIBRARY_TOOLS.includes(row.name)&&stable)})}
export function isLegacyLibraryChoice(choice){return choice?.mode==='all'&&!choice.tools?.some(name=>retrievalNames.has(name))}
export function hasLegacyLibraryBindings(selection={}){return Object.hasOwn(selection,LEGACY_KNOWLEDGE_OWNER)||isLegacyLibraryChoice(selection[LIBRARY_OWNER])}
const UNASSIGNED = 'unassigned'
const connector = row => row.source === 'openconnector' || row.name?.startsWith('openconnector/') || row.id?.startsWith('openconnector/')
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))]
const keyOf = row => row.id || row.name
const reasonText = value => typeof value === 'string' ? value : typeof value?.diagnostic === 'string' ? value.diagnostic : typeof value?.code === 'string' ? value.code : undefined
const withChoice = (selection, id, choice) => Object.fromEntries([...Object.entries(selection), [id, choice]])
const availableIds = plugin => plugin.tools.filter(tool => tool.available).map(tool => tool.id)
const normalizeChoice = choice => ({ enabled: choice?.enabled === true, mode: choice?.mode === 'all' ? 'all' : 'custom', tools: unique(Array.isArray(choice?.tools) ? choice.tools : []) })
const emptyChoice = () => ({ enabled: false, mode: 'custom', tools: [] })

function ownerOf(row, authoritative) {
  if (Object.hasOwn(row, 'pluginId')) return typeof row.pluginId === 'string' && row.pluginId.length > 0 && row.pluginId !== UNASSIGNED ? row.pluginId : null
  if (authoritative) return null
  const owner = nameOwner.get(row.name)
  if (!owner) return null
  // Current Host rows contain plain names. A new qualified identity without an
  // owner contract must not acquire an owner just because its name looks known.
  return !row.id || row.id === row.name ? owner : null
}

function toolFromRow(row) {
  return { id: keyOf(row), key: keyOf(row), name: row.name, description: row.description || '',
    available: !row.unavailable, ...(row.unavailable ? { unavailable: row.unavailable } : {}),
    ...(row.requiresContext ? { requiresContext: row.requiresContext } : {}),
    ...(row.label ? { label: row.label } : {}) }
}
function missingTool(id, requiresContext) {
  return { id, key: id, name: id, description: '', available: false,
    reasonKey: requiresContext ? 'pluginPickerContextRequired' : 'pluginPickerNotInCatalog',
    ...(requiresContext ? { requiresContext } : {}) }
}

/** Build a presentation catalog from actual Host tool rows; never synthesize availability. */
export function buildPluginCatalog(toolRows = [], options = {}) {
  const unified=isUnifiedLibraryCatalog(toolRows)
  const authoritative = options.capabilityBindings === true || toolRows.some(row => row && Object.hasOwn(row, 'pluginId'))
  const metadata = new Map(KNOWN_PLUGIN_CONTRACTS.map(plugin => [plugin.id, plugin]))
  const groups = new Map(authoritative ? [] : KNOWN_PLUGIN_CONTRACTS.map(plugin => [plugin.id, []]))
  const versions = new Map()
  const unknown = []
  const seen = new Set()
  for (const row of toolRows) {
    if (!row || typeof row.name !== 'string' || connector(row) || seen.has(keyOf(row))) continue
    seen.add(keyOf(row))
    const owner = ownerOf(row, authoritative)
    if (owner) {
      if (!groups.has(owner)) groups.set(owner, [])
      groups.get(owner).push(toolFromRow(row))
      if (typeof row.pluginVersion === 'string') versions.set(owner, row.pluginVersion)
    } else unknown.push(toolFromRow(row))
  }
  const installed = new Map((options.installedBundles || []).map(bundle => typeof bundle === 'string'
    ? [bundle, { installed: true }] : [bundle.packageName || bundle.name, bundle]))
  if (authoritative) {
    for (const id of installed.keys()) if (metadata.has(id) && !groups.has(id)&&!(unified&&id===LEGACY_KNOWLEDGE_OWNER&&!options.selection?.[id])) groups.set(id, [])
    for (const id of Object.keys(options.selection || {})) if (id !== UNASSIGNED && !groups.has(id)) groups.set(id, [])
  }
  const failures = new Map((options.unavailable || []).map(failure => [failure.provider, failure.reason]))
  const plugins = [...groups].map(([id, actual]) => {
    let contract = metadata.get(id) || { id, packageName: id, name: id, nameKey: '', description: '', descriptionKey: '',
      origin: id.startsWith('@deepseek-ai/') ? 'official' : 'custom', names: [], discovery: 'host-registry' }
    if(unified&&id===LIBRARY_OWNER)contract={...contract,names:UNIFIED_LIBRARY_TOOLS,descriptionKey:'pluginCapabilityUnifiedLibraryDescription'}
    const migrationOnly=unified&&id===LEGACY_KNOWLEDGE_OWNER
    const actualNames = new Set(actual.map(tool => tool.name))
    const bundle = installed.get(contract.packageName)
    const disabled = bundle?.enabled === false
    const absent = bundle?.installed === false
    const missing = authoritative ? options.selection?.[id]?.tools || [] : contract.names
    const actualIds = new Set(actual.map(tool => tool.id))
    const tools = [...actual, ...unique(missing).filter(name => authoritative ? !actualIds.has(name) : !actualNames.has(name)).map(name => missingTool(name, contract.requiresContext))]
    const activeTools = disabled || absent || migrationOnly ? tools.map(tool => ({ ...tool, available: false,
      reasonKey: migrationOnly?'pluginLibraryOwnerMoved':absent ? 'pluginPickerPluginNotInstalled' : 'pluginPickerPluginDisabled' })) : tools
    const available = activeTools.some(tool => tool.available)
    const failure = failures.get(contract.provider) || failures.get(contract.id) || failures.get(contract.packageName)
    const reason = reasonText(bundle?.reason || bundle?.error || failure)
    const reasonKey = migrationOnly?'pluginLibraryOwnerMoved':absent ? 'pluginPickerPluginNotInstalled' : disabled ? 'pluginPickerPluginDisabled'
      : !available ? contract.requiresContext ? 'pluginPickerContextRequired' : 'pluginPickerNotInCatalog'
      : activeTools.some(tool => !tool.available) ? 'pluginPickerPartiallyAvailable' : undefined
    const { names, provider, ...labels } = contract
    return { ...labels, discovery: authoritative ? 'host-registry' : labels.discovery, tools: activeTools, available,
      ...(unified&&id===LIBRARY_OWNER?{unifiedLibrary:true}:{}),...(migrationOnly?{migrationOnly:true}:{}),
      ...(reason ? { reason, unavailable: !available ? reason : undefined } : {}),
      ...(reasonKey ? { reasonKey } : {}),
      ...(versions.has(id) || bundle?.version ? { version: versions.get(id) || bundle.version } : {}),
      ...(typeof bundle?.installed === 'boolean' ? { installed: bundle.installed } : {}) }
  })
  plugins.push({ id: UNASSIGNED, packageName: '', name: '未识别归属的工具', nameKey: 'pluginCapabilityUnassigned',
    description: '保留精确工具选择，直到宿主提供可靠的插件归属。', descriptionKey: 'pluginCapabilityUnassignedDescription',
    origin: 'unassigned', tools: unknown, available: unknown.some(tool => tool.available),
    reasonKey: 'pluginPickerOwnerUnknown', discovery: 'unassigned' })
  return plugins
}

export function clonePluginSelection(selection = {}) {
  return Object.fromEntries(Object.entries(selection).map(([id, choice]) => [id, normalizeChoice(choice)]))
}

/**
 * Legacy tools always become exact custom choices, even if they happen to select
 * every current tool. Only previously saved client intent can restore all mode.
 */
export function selectionFromTools(tools = [], catalog = [], persisted, { live = false } = {}) {
  const selection = persisted ? clonePluginSelection(persisted) : {}
  const owned = new Map(catalog.flatMap(plugin => plugin.tools.map(tool => [tool.id, plugin.id])))
  const assigned = new Set(Object.values(selection).filter(choice => choice.enabled).flatMap(choice => choice.tools))
  const disabled = new Set(Object.values(selection).filter(choice => !choice.enabled).flatMap(choice => choice.tools))
  for (const key of unique(tools).filter(key => !key.startsWith('openconnector/'))) {
    if (assigned.has(key)) continue
    // A stale flat preview must not resurrect an explicitly disabled binding.
    if(persisted&&disabled.has(key))continue
    let id = owned.get(key) || UNASSIGNED
    const owner = catalog.find(plugin => plugin.id === id)
    // A legacy name is not evidence that its historical provider changed. Keep
    // exact tools without intent unassigned when the old contract names a
    // different owner than the Host does. A tool no contract mentions has no
    // history to contradict, and a `live` list (a built-in preset read from its
    // running composition) has no history at all: the Host's owner stands.
    if (!persisted && !live && owner?.discovery === 'host-registry' && nameOwner.has(key) && nameOwner.get(key) !== id) id = UNASSIGNED
    const current = selection[id] || emptyChoice()
    selection[id] = { ...current, enabled: true, tools: [...current.tools, key] }
    assigned.add(key)
  }
  return selection
}

function chosenIds(plugin, choice) {
  if (!choice?.enabled) return []
  if(plugin.migrationOnly||plugin.unifiedLibrary===true&&isLegacyLibraryChoice(choice))return unique(choice.tools)
  if (choice.mode !== 'all' || plugin.origin === 'unassigned') return unique(choice.tools)
  // A lost tool remains selected, so catalog refresh cannot silently erase a
  // capability from an existing Agent. The UI can explain or remove it.
  return unique([...availableIds(plugin), ...choice.tools])
}

export function chosenPluginTools(plugin, selection) {
  const index = new Map(plugin.tools.map(tool => [tool.id, tool]))
  return chosenIds(plugin, selection?.[plugin.id]).map(id => index.get(id) || missingTool(id))
}

export function flattenPluginSelection(selection = {}, catalog = []) {
  const index = new Map(catalog.map(plugin => [plugin.id, plugin]))
  return unique(Object.entries(selection).flatMap(([id, choice]) => {
    if (!choice.enabled) return []
    const plugin = index.get(id)
    return plugin ? chosenIds(plugin, choice) : choice.tools
  })).filter(key => !key.startsWith('openconnector/'))
}

export function setPluginEnabled(selection, plugin, enabled) {
  const current = selection[plugin.id]
  if(enabled&&plugin.migrationOnly)return selection
  if (current?.enabled === enabled) return selection
  if (enabled && !plugin.available && !current?.tools.length) return selection
  const choice = current ? normalizeChoice(current) : { enabled: false, mode: plugin.origin === 'unassigned' ? 'custom' : 'all', tools: availableIds(plugin) }
  return withChoice(selection, plugin.id, { ...choice, enabled })
}

export function pluginBroadeningCount(plugin, selection) {
  const choice = selection[plugin.id]
  const selected = new Set(choice?.tools || [])
  return plugin.origin === 'unassigned' ? 0 : availableIds(plugin).filter(id => !selected.has(id)).length
}

export function proposePluginMode(selection, plugin, mode) {
  const current = selection[plugin.id] || emptyChoice()
  if(plugin.migrationOnly)return {selection,pending:null}
  if (mode === current.mode || plugin.origin === 'unassigned') return { selection, pending: null }
  if (mode === 'all') {
    const selected = new Set(current.tools)
    const toolIds = availableIds(plugin).filter(id => !selected.has(id))
    if (toolIds.length) return { selection, pending: { pluginId: plugin.id, pluginIds: [plugin.id], count: toolIds.length, toolIds } }
  }
  return { selection: setPluginMode(selection, plugin, mode, { confirmed: true }), pending: null }
}

export function setPluginMode(selection, plugin, mode, options = {}) {
  const current = selection[plugin.id] || emptyChoice()
  if (plugin.migrationOnly || mode === current.mode || plugin.origin === 'unassigned' || !['all', 'custom'].includes(mode)) return selection
  if (mode === 'all' && !options.confirmed && pluginBroadeningCount(plugin, selection)) return selection
  const tools = mode === 'all' ? unique([...availableIds(plugin), ...current.tools])
    : current.enabled ? chosenIds(plugin, current) : unique(current.tools)
  return withChoice(selection, plugin.id, { ...current, mode, tools })
}

export function togglePluginTool(selection, plugin, toolId, checked) {
  if(plugin.migrationOnly)return selection
  const current = selection[plugin.id] || emptyChoice()
  const chosen = chosenIds(plugin, current)
  if (chosen.includes(toolId) === checked) return selection
  const tool = plugin.tools.find(tool => tool.id === toolId)
  if (checked && !tool?.available && !current.tools.includes(toolId)) return selection
  const tools = checked ? [...chosen, toolId] : chosen.filter(id => id !== toolId)
  return withChoice(selection, plugin.id, { enabled: tools.length > 0, mode: 'custom', tools: unique(tools) })
}

const officialPlugins = catalog => catalog.filter(plugin => plugin.origin === 'official' && plugin.available)
export function officialBundleState(catalog, selection) {
  const plugins = officialPlugins(catalog)
  const selected = catalog.filter(plugin => plugin.origin === 'official' && selection[plugin.id]?.enabled)
  if (!selected.length) return 'none'
  return selected.every(plugin => plugin.available) && plugins.every(plugin => selection[plugin.id]?.enabled && selection[plugin.id]?.mode === 'all') ? 'all' : 'partial'
}

export function proposeOfficialBundle(selection, catalog, enabled) {
  if (!enabled) return { selection: setOfficialBundle(selection, catalog, false), pending: null }
  const pluginIds = []
  for (const plugin of officialPlugins(catalog)) {
    const choice = selection[plugin.id]
    // New plugin enablement is the action the user requested. Confirm only when
    // an existing exact subset would expand to the entire plugin.
    if (choice?.mode === 'custom' && choice.tools.length) {
      const selected = new Set(choice.tools)
      const added = availableIds(plugin).filter(id => !selected.has(id))
      if (added.length) pluginIds.push(plugin.id)
    }
  }
  const candidate = setOfficialBundle(selection, catalog, true, { confirmed: true })
  if (!pluginIds.length) return { selection: candidate, pending: null }
  // The confirmation describes the whole user action, including newly enabled
  // plugins, rather than undercounting only the subsets that triggered it.
  const previous = new Set(flattenPluginSelection(selection, catalog))
  const toolIds = flattenPluginSelection(candidate, catalog).filter(id => !previous.has(id))
  return { selection, pending: { count: toolIds.length, toolIds, pluginIds } }
}

export function setOfficialBundle(selection, catalog, enabled, options = {}) {
  if (enabled && !options.confirmed && proposeOfficialBundle(selection, catalog, true).pending) return selection
  let next = selection
  for (const plugin of catalog.filter(plugin => plugin.origin === 'official')) {
    if (!enabled) next = setPluginEnabled(next, plugin, false)
    else if (plugin.available) {
      next = setPluginEnabled(next, plugin, true)
      next = setPluginMode(next, plugin, 'all', { confirmed: true })
    }
  }
  return next
}

export function summarizePluginSelection(selection, catalog) {
  const tools = flattenPluginSelection(selection, catalog)
  const index = new Map(catalog.map(plugin => [plugin.id, plugin]))
  const unavailable = new Set()
  for (const [id, choice] of Object.entries(selection)) {
    if (!choice.enabled) continue
    const plugin = index.get(id)
    for (const tool of plugin ? chosenPluginTools(plugin, selection) : choice.tools.map(id => missingTool(id))) if (!tool.available) unavailable.add(tool.id)
  }
  const plugins = catalog.filter(plugin => plugin.origin !== 'unassigned' && selection[plugin.id]?.enabled).length
  return { plugins, tools: tools.length, availableTools: tools.length - unavailable.size, unavailable: unavailable.size,
    unassigned: (selection[UNASSIGNED]?.enabled ? selection[UNASSIGNED].tools.length : 0) }
}

/** UI-compatible argument order. */
export function pluginSelectionSummary(catalog, selection) { return summarizePluginSelection(selection, catalog) }
