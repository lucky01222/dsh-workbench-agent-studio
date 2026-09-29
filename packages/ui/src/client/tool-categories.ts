/** Presentation groups never alter the Host catalog or runtime tool policy. */
export const TOOL_CATEGORIES = ['categoryFiles', 'categoryCommands', 'categoryWeb', 'categoryAgents',
  'categoryTasks', 'categoryWorkbench', 'categoryDocuments', 'categoryPrototype', 'categoryCollector', 'categoryOther'] as const
/** Locale-owned category identifiers. */
export type ToolCategory = typeof TOOL_CATEGORIES[number]
const advancedTools = new Map([
  ['cordis/cordis_inspect_list', 'cordis_inspect_list'],
  ['cordis/cordis_inspect_query', 'cordis_inspect_query'],
  ['cordis/cordis_inspect_self', 'cordis_inspect_self'],
  ['cordis/cordis_define', 'cordis_define'],
  ['cordis/cordis_run', 'cordis_run'],
  ['cordis/cordis_stop', 'cordis_stop'],
  ['cordis/cordis_undefine', 'cordis_undefine'],
  ['delegation/workflow', 'workflow'],
  ['delegation/ralph', 'ralph'],
  ['host/univer_lint', 'univer_lint'],
  ['host/univer_compile_svg', 'univer_compile_svg'],
])
/** Identify optional development, orchestration and slide tools for progressive disclosure.
 * @param tool - Catalog identity, or a legacy name without a provider-qualified identity.
 * @returns Whether the picker places this implementation in Advanced tools.
 */
export function isAdvancedTool(tool: { id?: string; name: string }): boolean {
  if (tool.id) return advancedTools.has(tool.id)
  return advancedTools.has(tool.name) || [...advancedTools.values()].includes(tool.name)
}
const groups: Partial<Record<ToolCategory, readonly string[]>> = {
  categoryFiles: ['read', 'write', 'edit', 'glob', 'grep', 'read_image'],
  categoryCommands: ['bash', 'job_output', 'job_list', 'job_kill'],
  categoryWeb: ['web_search', 'web_fetch'],
  categoryAgents: ['send_message', 'interrupt_agent', 'list_agents', 'subagent_fork', 'workflow', 'ralph'],
  categoryTasks: ['skill', 'get_goal', 'create_goal', 'update_goal', 'ask_user_question', 'todo_write', 'exit_plan_mode'],
}
/** Assign a display group while retaining unfamiliar tools in Other.
 * @param name - Exact name returned by the Host.
 * @returns A localized group identifier.
 */
export function toolCategory(name: string): ToolCategory {
  if (name.startsWith('univer_')) return 'categoryDocuments'
  if (name.startsWith('prototype_')) return 'categoryPrototype'
  if (name.startsWith('collector_')) return 'categoryCollector'
  if (name.startsWith('workbench_')) return 'categoryWorkbench'
  return TOOL_CATEGORIES.find(category => groups[category]?.includes(name)) ?? 'categoryOther'
}
