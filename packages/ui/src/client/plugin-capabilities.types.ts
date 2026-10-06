/** Durable plugin intent; tools[] remains the resolved preview and legacy contract. */
export type PluginMode = 'all' | 'custom'
export type PluginOrigin = 'official' | 'custom' | 'unassigned'
export interface PluginTool {
  id: string
  key: string
  name: string
  description: string
  label?: string
  available: boolean
  unavailable?: string
  reasonKey?: string
  requiresContext?: string
}
export interface PluginCapability {
  id: string
  packageName: string
  name: string
  nameKey: string
  description: string
  descriptionKey: string
  origin: PluginOrigin
  tools: readonly PluginTool[]
  available: boolean
  reason?: string
  reasonKey?: string
  unavailable?: string
  requiresContext?: string
  relatedSkills?: readonly string[]
  requiredPlugins?: readonly string[]
  version?: string
  installed?: boolean
  discovery: 'known-registration' | 'host-registry' | 'unassigned'
  unifiedLibrary?: boolean
  migrationOnly?: boolean
}
export interface PluginChoice {
  enabled: boolean
  mode: PluginMode
  /** Exact selected identities; also retains unavailable tools from a previous resolution. */
  tools: string[]
}
export type PluginSelection = Record<string, PluginChoice>
export interface PluginSelectionSummary {
  plugins: number
  tools: number
  unavailable: number
  availableTools: number
  unassigned: number
}
export interface PendingPluginBroadening {
  count: number
  toolIds: string[]
  pluginId?: string
  pluginIds: string[]
}
export interface ProposedPluginSelection {
  selection: PluginSelection
  pending: PendingPluginBroadening | null
}
export interface CatalogToolRow {
  id?: string
  name: string
  description: string
  source?: string
  unavailable?: string
  requiresContext?: string
  label?: string
  /** null is an authoritative declaration that ownership cannot be attributed. */
  pluginId?: string | null
  pluginVersion?: string
}
export interface InstalledBundle {
  packageName?: string
  name?: string
  version?: string
  // Normalized absence/presence, never rc.2 BundleInfo.installed (profile ownership).
  installed?: boolean
  enabled?: boolean
  reason?: string
  error?: string | { code: string; diagnostic?: string }
}
export interface PluginCatalogOptions {
  /** Supply only metadata actually returned by the Host; absence means installation is unknown. */
  installedBundles?: readonly (InstalledBundle | string)[]
  unavailable?: readonly { provider: string; reason: string }[]
  capabilityBindings?: boolean
  /** Preserve missing selections under their recorded owner, never a new owner with the same name. */
  selection?: PluginSelection
}
