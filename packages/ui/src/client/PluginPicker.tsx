/** Transactional extension of the approved compact plugin selector; native controls own geometry and focus. */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, Input, Modal, IconCloseOutline16, IconSearchOutline16, IconCordisPluginOutline14, IconChevronDownOutline14, IconChevronUpOutline14, IconChevronLeftOutline14, IconChevronRightOutline14, IconCheckOutline16, IconWarningOutline16, IconLoadingOutline16 } from './primitives.tsx'
import { clonePluginSelection, chosenPluginTools, pluginSelectionSummary, setPluginEnabled, setPluginMode, togglePluginTool, officialBundleState, setOfficialBundle, proposePluginMode, proposeOfficialBundle,isLegacyLibraryChoice } from './plugin-capabilities.mjs'
import type { PendingPluginBroadening, PluginCapability, PluginMode, PluginSelection, PluginTool } from './plugin-capabilities.types.ts'
import { pluginCapabilitiesZh } from './plugin-capabilities.locale.ts'
import css from './PluginPicker.module.css'

export interface PluginPickerProps {
  open: boolean
  catalog: readonly PluginCapability[]
  selection: PluginSelection
  readOnly?: boolean
  loading?: boolean
  error?: string | null
  /** Catalog changes update the view without replacing the active transaction. */
  generation?: string | number
  initialPluginId?: string | null
  selectedSkills?: readonly string[]
  t: (key: string, vars?: Record<string, string | number>) => string
  onComplete: (selection: PluginSelection) => void
  onClose: () => void
  onRefresh?: () => void
}

type SourceFilter = 'all' | 'custom' | 'official' | 'selected'
type Confirmation = PendingPluginBroadening & { kind: 'plugin' | 'bundle' }

/** Plugin configuration is copied on entry, committed on Done and discarded on every close path. */
export function PluginPicker({ open, catalog, selection, readOnly = false, loading = false, error, initialPluginId, selectedSkills = [], t, onComplete, onClose, onRefresh }: PluginPickerProps) {
  const [draft, setDraft] = useState<PluginSelection>(() => clonePluginSelection(selection))
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [query, setQuery] = useState('')
  const [officialExpanded, setOfficialExpanded] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [pending, setPending] = useState<Confirmation | null>(null)
  const wasOpen = useRef(false)
  const detailRef = useRef<HTMLElement | null>(null)
  const catalogRef = useRef<HTMLElement | null>(null)
  const backRef = useRef<HTMLButtonElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const filterRefs = useRef(new Map<SourceFilter, HTMLButtonElement>())
  const pendingListFocus = useRef<string | null>(null)
  const active = catalog.find(plugin => plugin.id === activeId) ?? catalog[0]
  const nameOf = (plugin: PluginCapability) => plugin.nameKey ? t(plugin.nameKey) : plugin.name
  const descriptionOf = (plugin: PluginCapability) => plugin.descriptionKey ? t(plugin.descriptionKey) : plugin.description
  const labelOf = (tool: PluginTool) => {
    if (tool.label) return tool.label
    const key = `pluginTool_${tool.name}`
    return Object.hasOwn(pluginCapabilitiesZh, key) ? t(key) : tool.name
  }
  const reasonOf = (item: PluginCapability | PluginTool) => ('reason' in item && item.reason) || item.unavailable || (item.reasonKey ? t(item.reasonKey) : '')

  useEffect(() => {
    if (open && !wasOpen.current) {
      const chosen = catalog.find(plugin => plugin.id === initialPluginId)
        ?? catalog.find(plugin => selection[plugin.id]?.enabled)
        ?? catalog.find(plugin => plugin.origin === 'custom' && plugin.available)
        ?? catalog.find(plugin => plugin.available) ?? catalog[0]
      setDraft(clonePluginSelection(selection)); setFilter('all'); setQuery('')
      setActiveId(chosen?.id ?? null); setPending(null)
      setOfficialExpanded(chosen?.origin === 'official')
      setMobileDetail(!!initialPluginId)
      if (detailRef.current) detailRef.current.scrollTop = 0
      if (catalogRef.current) catalogRef.current.scrollTop = 0
    }
    wasOpen.current = open
  }, [open, catalog, selection, initialPluginId])

  useEffect(() => {
    if (!open || !mobileDetail || !window.matchMedia('(max-width:600px)').matches) return
    backRef.current?.focus({ preventScroll: true })
  }, [open, mobileDetail, active?.id])
  useEffect(() => {
    if (!open || pendingListFocus.current === null) return
    const target = rowRefs.current.get(pendingListFocus.current) ?? filterRefs.current.get('selected')
    pendingListFocus.current = null
    target?.focus({ preventScroll: true })
  }, [open, draft])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchesText = (value: string) => value.toLocaleLowerCase().includes(normalizedQuery)
  const matchedTools = (plugin: PluginCapability) => normalizedQuery
    ? plugin.tools.filter(tool => matchesText(`${labelOf(tool)} ${tool.name} ${tool.description}`)) : []
  const shown = catalog.filter(plugin => {
    if (plugin.origin === 'unassigned' && plugin.tools.length === 0 && !draft[plugin.id]?.tools.length) return false
    const sourceMatches = filter === 'all' || filter === plugin.origin || filter === 'selected' && draft[plugin.id]?.enabled
    return sourceMatches && (!normalizedQuery || matchesText(`${nameOf(plugin)} ${descriptionOf(plugin)} ${plugin.packageName}`) || matchedTools(plugin).length > 0)
  })
  const official = useMemo(() => catalog.filter(plugin => plugin.origin === 'official'), [catalog])
  const summary = pluginSelectionSummary(catalog, draft)
  const bundleState = officialBundleState(catalog, draft)
  const showBundle = official.length > 0 && filter !== 'custom' && !normalizedQuery
  const currentChoice = active ? draft[active.id] : undefined
  const chosen = active ? chosenPluginTools(active, draft) as PluginTool[] : []
  const chosenIds = new Set(chosen.map(tool => tool.id))
  const detailTools = active ? [...active.tools, ...chosen.filter(tool => !active.tools.some(current => current.id === tool.id))] : []

  const selectPlugin = (plugin: PluginCapability) => {
    setActiveId(plugin.id); setMobileDetail(true); setPending(null)
    if (detailRef.current) detailRef.current.scrollTop = 0
  }
  const changeEnabled = (plugin: PluginCapability, enabled: boolean) => {
    if (readOnly) return
    if (!enabled && filter === 'selected') {
      const index = shown.findIndex(item => item.id === plugin.id)
      pendingListFocus.current = shown[index + 1]?.id ?? shown[index - 1]?.id ?? ''
    }
    setPending(null); setDraft(value => setPluginEnabled(value, plugin, enabled))
  }
  const changeMode = (plugin: PluginCapability, mode: PluginMode) => {
    if (readOnly || !draft[plugin.id]?.enabled) return
    const next = proposePluginMode(draft, plugin, mode)
    setPending(next.pending ? { ...next.pending, kind: 'plugin' } : null)
    if (!next.pending) setDraft(next.selection)
  }
  const changeBundle = (enabled: boolean) => {
    if (readOnly) return
    const next = proposeOfficialBundle(draft, catalog, enabled)
    setPending(next.pending ? { ...next.pending, kind: 'bundle' } : null)
    if (!next.pending) setDraft(next.selection)
  }
  const confirm = () => {
    if (readOnly || !pending) return
    if (pending.kind === 'bundle') setDraft(value => setOfficialBundle(value, catalog, true, { confirmed: true }))
    else {
      const plugin = catalog.find(item => item.id === pending.pluginId)
      if (plugin) setDraft(value => setPluginMode(value, plugin, 'all', { confirmed: true }))
    }
    setPending(null)
  }
  const confirmation = (kind: Confirmation['kind']) => pending?.kind === kind && <div className={css.confirmation} role="status">
    <p>{t(kind === 'bundle' ? 'pluginPickerBundleBroaden' : 'pluginPickerBroaden', { count: pending.count })}</p>
    <div className={css.confirmActions}>
      <Button size="sm" shape="rounded" variant="primary" disabled={readOnly} onClick={confirm}>{t(kind === 'bundle' ? 'pluginPickerConfirmBundle' : 'pluginPickerConfirmAll')}</Button>
      <Button size="sm" shape="rounded" onClick={() => { setPending(null) }}>{t('pluginPickerKeepScope')}</Button>
    </div>
  </div>

  const pluginRow = (plugin: PluginCapability) => {
    const choice = draft[plugin.id], tools = chosenPluginTools(plugin, draft), hits = matchedTools(plugin)
    const reason = reasonOf(plugin)
    return <div key={plugin.id} className={clsx(css.pluginRow, active?.id === plugin.id && css.activeRow)}>
      {plugin.origin !== 'unassigned' && <input type="checkbox" className={css.checkbox} aria-label={t('pluginPickerEnable', { name: nameOf(plugin) })} checked={choice?.enabled ?? false} disabled={readOnly || plugin.migrationOnly || !plugin.available && !choice?.tools.length} title={!plugin.available ? reason || t('pluginCapabilityNotInCatalog') : undefined} onChange={event => { changeEnabled(plugin, event.currentTarget.checked) }} />}
      <button type="button" ref={element => { if (element) rowRefs.current.set(plugin.id, element); else rowRefs.current.delete(plugin.id) }} className={css.pluginOpen} aria-current={active?.id === plugin.id ? 'true' : undefined} onClick={() => { selectPlugin(plugin) }}>
        <IconCordisPluginOutline14 size={16} />
        <span className={css.pluginText}><strong>{nameOf(plugin)}</strong><small>{descriptionOf(plugin)}</small>
          {reason && <small className={plugin.origin === 'unassigned' ? undefined : css.conditionText}>{reason}</small>}
          {!!hits.length && <small>{t('pluginPickerMatchedTools', { tools: hits.slice(0, 2).map(tool => tool.name).join('、') })}{hits.length > 2 && ` · ${t('pluginPickerMoreMatches', { count: hits.length })}`}</small>}
        </span>
        <span className={css.rowCount}>{choice?.enabled ? t('pluginPickerSelectedCount', { selected: tools.length, total: plugin.tools.length }) : t('pluginPickerToolCount', { count: plugin.tools.length })}</span>
        <IconChevronRightOutline14 className={css.rowChevron} />
      </button>
    </div>
  }
  const group = (origin: PluginCapability['origin'], key: string) => {
    const rows = shown.filter(plugin => plugin.origin === origin)
    if (!rows.length || origin === 'official' && !(officialExpanded || normalizedQuery || filter === 'selected' || filter === 'official')) return null
    return <div className={css.group}><div className={css.groupHeading}><span>{t(key)}</span><span>{rows.length}</span></div>{rows.map(pluginRow)}</div>
  }

  return <Modal open={open} headless title={t('pluginPickerTitle')} className={css.dialog} onClose={onClose}>
    <div className={css.shell} data-plugin-picker>
      <header className={css.header}><div><h2>{t('pluginPickerTitle')}</h2><p>{t('pluginPickerHint')}</p></div><Button size="sm" shape="rounded" className={css.closeButton} icon={<IconCloseOutline16 />} aria-label={t('pluginPickerClose')} onClick={onClose} /></header>
      <div className={css.toolbar}>
        <nav className={css.filters} aria-label={t('pluginPickerFilterLabel')}>{(['all', 'custom', 'official', 'selected'] as const).map(source => <button key={source} type="button" ref={element => { if (element) filterRefs.current.set(source, element); else filterRefs.current.delete(source) }} aria-pressed={filter === source} className={css.filter} onClick={() => { setFilter(source); if (source === 'official') setOfficialExpanded(true); setMobileDetail(false) }}>{t(({ all: 'pluginPickerAll', custom: 'pluginPickerCustom', official: 'pluginPickerOfficial', selected: 'pluginPickerSelected' } as const)[source])}</button>)}</nav>
        <Input data-modal-autofocus className={css.search} icon={<IconSearchOutline16 />} aria-label={t('pluginPickerSearch')} placeholder={t('pluginPickerSearch')} value={query} onChange={event => { setQuery(event.currentTarget.value); setMobileDetail(false) }} />
      </div>
      {error && <div className={css.error} role="alert"><span>{t('pluginPickerError')}</span><details><summary>{t('pluginPickerErrorDetails')}</summary><pre>{error}</pre></details></div>}
      <div className={css.body} data-detail={mobileDetail || undefined}>
        <section ref={catalogRef} className={css.catalog} aria-label={t('pluginPickerCatalog')}>
          {showBundle && <><div className={css.bundle}>
            <input type="checkbox" className={css.checkbox} aria-label={t('pluginPickerOfficialEnable')} checked={bundleState === 'all'} ref={element => { if (element) element.indeterminate = bundleState === 'partial' }} disabled={readOnly || !official.some(plugin => plugin.available)} title={!official.some(plugin => plugin.available) ? t('pluginCapabilityNotInCatalog') : undefined} onChange={event => { changeBundle(event.currentTarget.checked) }} />
            <div className={css.bundleContent}><strong>{t('pluginPickerOfficialBundle')}</strong><small>{t('pluginPickerBundleCount', { plugins: official.length, tools: official.reduce((count, plugin) => count + plugin.tools.length, 0) })}{bundleState === 'partial' && ` · ${t('pluginPickerBundlePartial')}`}</small>
              <button className={css.bundleExpand} type="button" aria-expanded={officialExpanded} onClick={() => { setOfficialExpanded(value => !value) }}>{t(officialExpanded ? 'pluginPickerCollapseOfficial' : 'pluginPickerExpandOfficial', { count: official.length })}{officialExpanded ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}</button>
            </div><IconCordisPluginOutline14 size={18} />
          </div>{confirmation('bundle')}</>}
          {loading && <p className={css.empty} role="status"><IconLoadingOutline16 />{t('pluginPickerLoading')}</p>}
          {group('custom', 'pluginPickerCustomGroup')}{group('official', 'pluginPickerOfficialGroup')}{group('unassigned', 'pluginPickerUnassignedGroup')}
          {!shown.length && !loading && <p className={css.empty}>{t(normalizedQuery ? 'pluginPickerNoMatches' : filter === 'selected' ? 'pluginPickerNoSelected' : 'pluginPickerNoPlugins')}</p>}
        </section>
        <section ref={detailRef} className={css.detail} aria-label={t('pluginPickerDetail')}>
          {active ? <>
            <button ref={backRef} type="button" className={css.back} onClick={() => { setMobileDetail(false); requestAnimationFrame(() => { rowRefs.current.get(active.id)?.focus({ preventScroll: true }) }) }}><IconChevronLeftOutline14 />{t('pluginPickerBack')}</button>
            <div className={css.detailHeading}><IconCordisPluginOutline14 size={18} /><h3>{nameOf(active)}</h3><span className={css.detailCount}>{t('pluginPickerToolCount', { count: active.tools.length })}</span></div>
            <p className={css.description}>{descriptionOf(active)}</p>
            {(reasonOf(active) || active.requiresContext) && <div className={clsx(css.requirement, active.origin === 'unassigned' && css.neutralRequirement)}>
              <IconWarningOutline16 />
              <div>{active.origin !== 'unassigned' && <strong>{t('pluginPickerUnavailableHint')}</strong>}{reasonOf(active) && <p>{reasonOf(active)}</p>}{active.requiresContext && <p>{t('pluginPickerContext', { context: active.requiresContext })}</p>}</div>
            </div>}
            {active.origin !== 'unassigned' ? <>
              <label className={css.enable}><input type="checkbox" className={css.checkbox} checked={currentChoice?.enabled ?? false} disabled={readOnly || active.migrationOnly || !active.available && !currentChoice?.tools.length} title={!active.available ? reasonOf(active) || t('pluginCapabilityNotInCatalog') : undefined} onChange={event => { changeEnabled(active, event.currentTarget.checked) }} /><span>{t('pluginPickerEnableDetail')}</span></label>
              <div className={css.modes} role="group" aria-label={t('pluginPickerScope')}>{(['all', 'custom'] as const).map(mode => <Button key={mode} size="sm" shape="rounded" aria-pressed={(currentChoice?.mode ?? 'all') === mode} disabled={readOnly || active.migrationOnly || !currentChoice?.enabled} onClick={() => { changeMode(active, mode) }}>{t(mode === 'all' ? 'pluginPickerAllTools' : 'pluginPickerCustomTools')}</Button>)}</div>
              <p className={css.scopeHint}>{t(active.migrationOnly||active.unifiedLibrary&&isLegacyLibraryChoice(currentChoice)?'pluginLibrarySavedScope':(currentChoice?.mode ?? 'all') === 'all' ? 'pluginPickerAllHint' : 'pluginPickerCustomHint')}</p>
              {pending?.pluginId === active.id && confirmation('plugin')}
            </> : <p className={css.scopeHint}>{t('pluginPickerUnassignedHint')}</p>}
            {!!active.requiredPlugins?.length && <p className={css.related}>{t('pluginPickerDependencies', { plugins: active.requiredPlugins.map(id => { const plugin = catalog.find(item => item.id === id); return plugin ? nameOf(plugin) : id }).join('、') })}</p>}
            {!!active.relatedSkills?.length && <p className={css.related}>{t('pluginPickerRelatedSkills', { skills: active.relatedSkills.join('、') })}<br />{t('pluginPickerSkillsIndependent')}{selectedSkills.some(skill => active.relatedSkills?.includes(skill)) && <IconCheckOutline16 size={12} />}</p>}
            {currentChoice?.enabled && currentChoice.mode === 'custom' && chosen.length === 0 && active.origin !== 'unassigned' && <p className={css.scopeHint} role="status">{t('pluginPickerEmptyCustom')}</p>}
            <div className={css.toolHeading}><span>{t('pluginPickerToolHeading')}</span><span>{chosen.length} / {detailTools.length}</span></div>
            <div>{detailTools.map(tool => {
              const editable = currentChoice?.mode === 'custom' || active.origin === 'unassigned'
              const condition = reasonOf(tool)
              return <div className={css.toolRow} key={tool.id}>
                {editable ? <input type="checkbox" className={css.checkbox} aria-label={t('pluginPickerChooseTool', { name: tool.name })} checked={chosenIds.has(tool.id)} disabled={readOnly || active.migrationOnly || active.origin !== 'unassigned' && !currentChoice?.enabled || !tool.available && !chosenIds.has(tool.id)} title={!tool.available ? condition || t('pluginPickerNotInCatalog') : undefined} onChange={event => { const checked = event.currentTarget.checked; setPending(null); setDraft(value => togglePluginTool(value, active, tool.id, checked)) }} /> : <span className={clsx(css.toolMark, !chosenIds.has(tool.id) && css.disabledMark)} aria-hidden="true">{chosenIds.has(tool.id) && <IconCheckOutline16 size={14} />}</span>}
                <div className={css.toolText}><strong>{labelOf(tool) !== tool.name ? <>{labelOf(tool)}<code>{tool.name}</code></> : <code>{tool.name}</code>}</strong><small>{tool.description}</small>{condition && <small className={css.conditionText}>{condition}</small>}{tool.requiresContext && <small>{t('pluginPickerContext', { context: tool.requiresContext })}</small>}</div>
              </div>
            })}</div>
            <details className={css.technical}><summary>{t('pluginPickerInfo')}</summary>{active.packageName && <code>{active.packageName}</code>}{active.version && <p>{t('pluginPickerVersion', { version: active.version })}</p>}<p>{t(active.discovery === 'unassigned' ? 'pluginPickerUnassignedRegistration' : 'pluginPickerKnownRegistration')}</p></details>
          </> : <p className={css.empty}>{t('pluginPickerNoDetail')}</p>}
        </section>
      </div>
      <footer className={css.footer}><div className={css.summary} role="status"><strong>{t('pluginPickerSummary', { plugins: summary.plugins, tools: summary.tools })}</strong>{summary.unavailable > 0 && <small className={css.conditionText}>{t('pluginPickerPendingCount', { count: summary.unavailable })}</small>}{summary.unassigned > 0 && <small>{t('pluginPickerUnassignedSummary', { count: summary.unassigned })}</small>}</div>
        {onRefresh && <Button size="sm" shape="rounded" className={css.refresh} disabled={loading} onClick={onRefresh}>{t('pluginPickerRefresh')}</Button>}
        <Button variant="outline" onClick={onClose}>{t('pluginPickerCancel')}</Button><Button variant="primary" onClick={() => { onComplete(clonePluginSelection(draft)) }}>{t('pluginPickerComplete')}</Button>
      </footer>
    </div>
  </Modal>
}
