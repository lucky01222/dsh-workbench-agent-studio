import { clonePluginSelection } from './plugin-capabilities.mjs'

const toolsOf = document => Array.isArray(document?.definition?.tools)
  ? [...new Set(document.definition.tools)].sort() : []
const selectionKey = selection => JSON.stringify(Object.entries(clonePluginSelection(selection || {}))
  .filter(([, choice]) => choice.enabled)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, choice]) => [id, choice.mode, [...choice.tools].sort()]))
const bindingKey = definition => definition?.pluginBindings === undefined ? null
  : JSON.stringify(Object.entries(clonePluginSelection(definition.pluginBindings)).sort(([a],[b]) => a.localeCompare(b))
    .map(([id,choice]) => [id,choice.enabled,choice.mode,[...choice.tools].sort()]))

/** Compare intent rather than object order or disabled catalog presentation. */
export const samePluginSelection = (a, b) => selectionKey(a) === selectionKey(b)

export function samePluginBaseline(a, b) {
  return !!a && !!b && a.id === b.id && a.revision === b.revision
    && JSON.stringify(toolsOf(a)) === JSON.stringify(toolsOf(b))
    && bindingKey(a.definition) === bindingKey(b.definition)
}

function validSelection(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).length <= 1000
    && Object.entries(value).every(([id, choice]) => id.length > 0 && id.length < 1000
      && choice && typeof choice === 'object' && typeof choice.enabled === 'boolean'
      && ['all', 'custom'].includes(choice.mode) && Array.isArray(choice.tools)
      && choice.tools.length <= 500 && choice.tools.every(tool => typeof tool === 'string' && tool.length > 0))
}

/**
 * Migration bridge for Hosts/documents without durable plugin bindings.
 * Server bindings take precedence whenever present. Records are accepted only
 * against the same server revision and tool set, never as authority over a newer
 * document supplied by another window or client.
 */
export class PluginChoiceStore {
  constructor({ storage = () => globalThis.localStorage, origin = () => globalThis.location?.origin || 'local' } = {}) {
    this.storage = storage
    this.origin = origin
  }

  key(workspace, id) {
    return ['wb-studio-plugin-choices-v1', this.origin(), workspace || '', id]
      .map(value => encodeURIComponent(String(value))).join(':')
  }

  read(document, workspace) {
    if (!document || document.readOnly || document.definition?.pluginBindings !== undefined) return null
    try {
      const record = JSON.parse(this.storage()?.getItem(this.key(workspace, document.id)) || 'null')
      if (!record || record.schemaVersion !== 1 || record.agentId !== document.id
        || record.workspace !== workspace || record.origin !== this.origin()
        || record.revision !== document.revision || !Array.isArray(record.tools)
        || JSON.stringify(record.tools) !== JSON.stringify(toolsOf(document))
        || !validSelection(record.selection)) return null
      return clonePluginSelection(record.selection)
    } catch { return null }
  }

  write(document, workspace, selection) {
    if (!document || document.readOnly || !validSelection(selection)) return false
    try {
      const storage = this.storage()
      if (!storage) return false
      storage.setItem(this.key(workspace, document.id), JSON.stringify({
        schemaVersion: 1, origin: this.origin(), workspace, agentId: document.id,
        revision: document.revision, tools: toolsOf(document), selection: clonePluginSelection(selection),
      }))
      return true
    } catch { return false }
  }

  remove(workspace, id) {
    try { this.storage()?.removeItem(this.key(workspace, id)) } catch { /* Host deletion is already complete. */ }
  }
}
