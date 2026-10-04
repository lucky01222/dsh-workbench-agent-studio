import type { CatalogToolRow, PluginCapability, PluginCatalogOptions, PluginMode, PluginSelection, PluginSelectionSummary, PluginTool, ProposedPluginSelection } from './plugin-capabilities.types'
export const KNOWN_PLUGIN_CONTRACTS: readonly { id: string; packageName: string; names: readonly string[]; origin: 'official' | 'custom' }[]
export const LIBRARY_OWNER: 'dsh-workbench-library'
export const LEGACY_KNOWLEDGE_OWNER: 'dsh-library-knowledge'
export const UNIFIED_LIBRARY_TOOLS: readonly string[]
export function isUnifiedLibraryCatalog(rows?:readonly CatalogToolRow[]):boolean
export function isLegacyLibraryChoice(choice?:import('./plugin-capabilities.types').PluginChoice):boolean
export function hasLegacyLibraryBindings(selection?:PluginSelection):boolean
export function buildPluginCatalog(toolRows?: readonly CatalogToolRow[], options?: PluginCatalogOptions): PluginCapability[]
export function clonePluginSelection(selection?: PluginSelection): PluginSelection
export function selectionFromTools(tools?: readonly string[], catalog?: readonly PluginCapability[], persisted?: PluginSelection): PluginSelection
export function chosenPluginTools(plugin: PluginCapability, selection: PluginSelection): PluginTool[]
export function flattenPluginSelection(selection?: PluginSelection, catalog?: readonly PluginCapability[]): string[]
export function setPluginEnabled(selection: PluginSelection, plugin: PluginCapability, enabled: boolean): PluginSelection
export function pluginBroadeningCount(plugin: PluginCapability, selection: PluginSelection): number
export function proposePluginMode(selection: PluginSelection, plugin: PluginCapability, mode: PluginMode): ProposedPluginSelection
export function setPluginMode(selection: PluginSelection, plugin: PluginCapability, mode: PluginMode, options?: { confirmed?: boolean }): PluginSelection
export function togglePluginTool(selection: PluginSelection, plugin: PluginCapability, toolId: string, checked: boolean): PluginSelection
export function officialBundleState(catalog: readonly PluginCapability[], selection: PluginSelection): 'none' | 'partial' | 'all'
export function proposeOfficialBundle(selection: PluginSelection, catalog: readonly PluginCapability[], enabled: boolean): ProposedPluginSelection
export function setOfficialBundle(selection: PluginSelection, catalog: readonly PluginCapability[], enabled: boolean, options?: { confirmed?: boolean }): PluginSelection
export function summarizePluginSelection(selection: PluginSelection, catalog: readonly PluginCapability[]): PluginSelectionSummary
export function pluginSelectionSummary(catalog: readonly PluginCapability[], selection: PluginSelection): PluginSelectionSummary
