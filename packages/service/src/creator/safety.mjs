/**
 * Trial-run tool safety. Harness tools carry no read-only metadata, so trials
 * execute only tools known to read, and record every other call unexecuted.
 * Unknown tools default to "record only".
 */
const READ_ONLY = new Set([
  'read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch', 'skill',
  'job_list', 'job_output', 'get_goal', 'list_agents', 'cordis_inspect_list', 'cordis_inspect_query',
  'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource',
  'library_list', 'library_search', 'library_read', 'library_evidence', 'library_graph', 'library_locate',
  'library_entities', 'library_relations', 'library_get', 'library_operation', 'library_sources',
  'univer_status', 'univer_inspect', 'univer_api', 'univer_resources', 'univer_lint',
  'media_read_project', 'agent_studio_catalog', 'agent_studio_check',
])
// A verb that changes something anywhere in the name wins over a reading verb.
const WRITES = /(^|_)(write|set|create|delete|update|remove|add|put|patch|move|rename|kill|execute|exec|run|send|ingest|correct|undo|save|import|export|new|edit|apply|install|grant|revoke|commit|propose)(_|$)/i
const READS = /^(read|get|list|search|find|query|inspect|status|glob|grep|lookup|describe|stat|tree|ls|browse|view)(_|$)/i

export function isReadOnlyTool(name) {
  if (READ_ONLY.has(name)) return true
  // MCP tools are namespaced as mcp__server__tool; judge the tool part.
  const local = name.includes('__') ? name.slice(name.lastIndexOf('__') + 2) : ''
  return !!local && !WRITES.test(local) && READS.test(local)
}

export const UNEXECUTED = '[试跑未执行]'
export const unexecutedResult = name => ({ text: `${UNEXECUTED} ${name} 可能写入或修改数据，这次试跑没有执行它。不要假设它的结果；在回答里说明这一步需要真实执行。`, error: false })
