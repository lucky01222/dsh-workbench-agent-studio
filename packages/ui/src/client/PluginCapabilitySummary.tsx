import { Button, IconAgentPresetOutline16, IconCloseOutline16, IconPlusOutline16 } from './primitives.tsx'
import { chosenPluginTools, officialBundleState, summarizePluginSelection,isLegacyLibraryChoice } from './plugin-capabilities.mjs'
import type { PluginCapability, PluginSelection } from './plugin-capabilities.types.ts'
import css from './PluginCapabilitySummary.module.css'

interface Props {
  catalog: readonly PluginCapability[]
  selection: PluginSelection
  readOnly?: boolean
  loading?: boolean
  t: (key: string, values?: Record<string, string | number>) => string
  onOpen: (pluginId?: string) => void
  onRemove: (pluginIds: readonly string[]) => void
}

/** Compact configuration projection; every displayed row leads to its exact tools. */
export function PluginCapabilitySummary({ catalog, selection, readOnly, loading, t, onOpen, onRemove }: Props) {
  const selected = catalog.filter(plugin => selection[plugin.id]?.enabled)
  const official = selected.filter(plugin => plugin.origin === 'official')
  const remaining = selected.filter(plugin => plugin.origin !== 'official')
  const summary = summarizePluginSelection(selection, catalog)
  const renderRow = (name: string, hint: string, tools: number, ids: readonly string[]) => (
    <div className={css.row} key={ids.join('|')}>
      <IconAgentPresetOutline16 />
      <button type="button" className={css.title} onClick={() => { onOpen(ids[0]) }}>
        <strong>{name}</strong><small>{hint}</small>
      </button>
      <span className={css.count}>{t('pluginPickerToolCount', { count: tools })}</span>
      {!readOnly && <Button size="sm" shape="rounded" className={css.remove} icon={<IconCloseOutline16 />}
        aria-label={t('pluginRemove', { name })} title={t('pluginRemove', { name })}
        onClick={() => { onRemove(ids) }} />}
    </div>
  )
  return <div className={css.root}>
    <div className={css.heading}>
      <span aria-live="polite">{loading ? t('pluginSelectionLoading') : t('pluginPickerSummary', { plugins: summary.plugins, tools: summary.tools })}</span>
      <Button size="sm" variant="outline" shape="rounded" icon={readOnly ? undefined : <IconPlusOutline16 />}
        onClick={() => { onOpen() }}>{t(readOnly ? 'viewCapabilities' : 'pluginPickerTitle')}</Button>
    </div>
    <div className={css.rows}>
      {official.length > 0 && renderRow(
        t(officialBundleState(catalog, selection) === 'all' ? 'pluginPickerOfficialBundle' : 'pluginOfficialPartial'),
        t('pluginOfficialMode', { plugins: official.length }),
        official.reduce((count, plugin) => count + chosenPluginTools(plugin, selection).length, 0), official.map(plugin => plugin.id),
      )}
      {remaining.map(plugin => renderRow(
        plugin.nameKey ? t(plugin.nameKey) : plugin.name,
        plugin.migrationOnly||plugin.unifiedLibrary===true&&isLegacyLibraryChoice(selection[plugin.id])?t('pluginLibrarySavedScope'):selection[plugin.id].mode === 'all' && plugin.origin !== 'unassigned' ? t('pluginSummaryAll')
          : t('pluginSummaryCustom', { selected: chosenPluginTools(plugin, selection).length, total: plugin.tools.length }),
        chosenPluginTools(plugin, selection).length, [plugin.id],
      ))}
      {selected.length === 0 && <p className={css.empty}>{t('pluginSelectionEmpty')}</p>}
    </div>
    {summary.unavailable > 0 && <p className={css.warning}>{t('pluginPickerPendingCount', { count: summary.unavailable })}</p>}
  </div>
}
