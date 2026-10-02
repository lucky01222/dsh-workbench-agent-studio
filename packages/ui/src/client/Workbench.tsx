/** Approved Agent IDE layout, composed with native controls and the native Conversation outlet. */
import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { Button, Input, Menu, Modal, Pill, IconEllipsisOutline16, IconCloseOutline16, IconPlusOutline16, IconPanelLeftOutline16, IconAgentPresetOutline16, IconCopyOutline16, IconTrashOutline16, IconRefreshOutline16, IconCheckOutline16, IconLoadingOutline16 } from './primitives.tsx'
import type { WorkbenchProps } from './contracts.ts'
import type {} from './locales.ts'
import { TOOL_CATEGORIES, isAdvancedTool, toolCategory, type ToolCategory } from './tool-categories.ts'
const contextKey = (context: { id: string }) => context.id
import { ConnectorPicker } from './ConnectorPanel.tsx'
import { PromptWriter } from './PromptWriter.tsx'
import { TrialPane } from './TrialPane.tsx'
import { TrialToolbar } from './TrialToolbar.tsx'
import { HistoryPane } from './HistoryPane.tsx'
import { RecordsPane } from './RecordsPane.tsx'
import css from './Workbench.module.css'
import { PluginPicker } from './PluginPicker.tsx'
import { PluginCapabilitySummary } from './PluginCapabilitySummary.tsx'
import { buildPluginCatalog, clonePluginSelection, selectionFromTools, chosenPluginTools, summarizePluginSelection } from './plugin-capabilities.mjs'
import type { PluginCapability, PluginSelection } from './plugin-capabilities.types.ts'
import type { Key } from './locales.ts'

type Dialog = 'create' | 'tools' | 'skills' | 'plugins' | 'capability-check' | 'delete' | 'reload' | null

function OperationError({ error, t }: { error: string | null; t: WorkbenchProps['t'] }) {
  return error ? <div className={css.dialogError} role="alert"><span>{t('errorTitle')}</span>
    <details><summary>{t('errorDetails')}</summary><pre>{error}</pre></details>
  </div> : null
}
/** Render the managed Agent editor with framework-derived state and actions. */
export function Workbench(props: WorkbenchProps & { pluginCatalog?: readonly PluginCapability[]; changePluginSelection?: (selection: PluginSelection) => void }) {
  const state = props.useEditor(s => s), view = props.useStore(s => s), records = props.useRecords(s => s), { t } = props
  const [pluginDetailId, setPluginDetailId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null), [search, setSearch] = useState(''), [newName, setNewName] = useState('')
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [startingConversation, setStartingConversation] = useState(false), [actionError, setActionError] = useState<string | null>(null)
  const [toolSource, setToolSource] = useState<'local' | 'openconnector'>('local')
  const [category, setCategory] = useState<ToolCategory | 'all' | 'selected' | 'advanced'>('all')
  const splitRef = useRef<HTMLDivElement>(null), rootRef = useRef<HTMLDivElement>(null), id = useId()
  const pendingTabFocus = useRef(false)
  useEffect(() => {
    if (!pendingTabFocus.current || state.busy) return
    const target = rootRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]:not(:disabled)')
      ?? (state.openIds.length === 0 ? rootRef.current?.querySelector<HTMLButtonElement>('[data-studio-library-toggle]') : null)
    if (target) { pendingTabFocus.current = false; target.focus() }
  }, [state.openIds, state.document?.agentPreset, state.busy])
  const closeTab = (agent: string) => { pendingTabFocus.current = true; props.closeAgent(agent) }
  const diagnostic = state.toolRunState ?? state.runState
  const pendingInteraction = props.useSessionPendingInteraction(s => diagnostic ? s.get(diagnostic.run.sessionId) : undefined)
  const draft = state.draft
  const readOnly = state.document?.readOnly === true, runtime = state.document?.runtime
  const plugins = props.pluginCatalog ?? buildPluginCatalog(state.catalog?.tools ?? [])
  const pluginSelection: PluginSelection = state.pluginSelection ?? selectionFromTools(draft?.tools ?? [], plugins)
  const pluginT = (key: string, values?: Record<string, string | number>) => t(key as Key, values)
  const pluginSummary = summarizePluginSelection(pluginSelection, plugins)
  const openPlugins = (pluginId?: string) => { setPluginDetailId(pluginId); openDialog('plugins') }
  const changePlugins = (selection: PluginSelection) => { if (props.changePluginSelection) props.changePluginSelection(selection) }
  const removePlugins = (ids: readonly string[]) => { const next = clonePluginSelection(pluginSelection); for (const pluginId of ids) if (next[pluginId]) next[pluginId].enabled = false; changePlugins(next) }
  const groups = [{ label: 'agents' as const, rows: state.roster.presets.filter(row => row.managed) },
    { label: 'builtinAgents' as const, rows: state.roster.presets.filter(row => row.builtIn) }]
  const canRunModel = draft?.modelSelection === 'global' ? !!state.models?.default : !!draft?.provider && !!draft.model
  const model = state.models?.groups.find(group => group.id === draft?.provider)?.models.find(item => item.id === draft?.model)
  const invoke = (work: Promise<unknown>) => { void work.catch(() => {}) } // Controller retains actionable errors and unsaved edits.
  const open = (agent: string) => {
    setAgentMenuOpen(false)
    props.actions.update({ libraryHistory: false, selectedRunIds: [], rightTab: 'trial',
      ...(rootRef.current && rootRef.current.clientWidth <= 950 ? { sidebarOpen: false } : {}),
    })
    invoke(props.openAgent(agent))
  }
  const openDialog = (next: Dialog) => {
    props.clearError(); setSearch(''); setCategory('all'); setDialog(next)
    if ((next === 'tools' || next === 'skills' || next === 'plugins') && !state.catalog && !state.catalogLoading) invoke(props.refreshCatalog())
  }
  const selectRuns = (ids: readonly import('@deepseek-ai/dsh-api-agent-studio-controller/types').StudioRunId[]) => { props.actions.update({ selectedRunIds: [...ids] }); invoke(props.loadResults(ids)) }
  const shown = dialog === 'skills' ? state.catalog?.skills : state.catalog?.tools.filter(tool => tool.source !== 'openconnector')
  const selected = dialog === 'skills' ? draft?.skills ?? [] : draft?.tools ?? []
  const optionId = (item: { id?: string; name: string }) => item.id ?? item.name
  const catalogNames = new Set(shown?.map(optionId))
  const allOptions: readonly { id?: string; name: string; description: string; source?: string; unavailable?: string; requiresContext?: string }[] = [...(shown ?? []), ...selected.filter(name => !name.startsWith('openconnector/') && !catalogNames.has(name)).map(name => ({ name, description: t('missingCapability') }))]
  const query = search.trim().toLowerCase()
  const matching = allOptions.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query))
  const commonOptions = allOptions.filter(item => !isAdvancedTool(item))
  const advancedOptions = matching.filter(isAdvancedTool)
  const selectedOptions = matching.filter(item => selected.includes(optionId(item)))
  const categories = TOOL_CATEGORIES.filter(key => commonOptions.some(item => toolCategory(item.name) === key))
  const activeCategory = category === 'selected' || category === 'advanced' || categories.includes(category as ToolCategory) ? category : 'all'
  const defaultOptions = query ? matching : matching.filter(item => !isAdvancedTool(item))
  const options = dialog !== 'tools' ? matching : activeCategory === 'selected' ? selectedOptions
    : activeCategory === 'advanced' ? advancedOptions : activeCategory === 'all' ? defaultOptions
      : matching.filter(item => !isAdvancedTool(item) && toolCategory(item.name) === activeCategory)
  const toggle = (name: string, checked: boolean) => {
    const next = checked ? [...selected, name] : selected.filter(value => value !== name)
    props.changeDefinition(dialog === 'skills' ? { skills: next } : { tools: next })
  }
  return <div ref={rootRef} className={css.root} data-agent-studio="true">
    {view.sidebarOpen && <button className={css.sidebarBackdrop} aria-label={t('close')} onClick={() => { props.actions.update({ sidebarOpen: false }) }} />}
    {view.sidebarOpen && <aside className={css.sidebar} aria-label={t('agentLibrary')}>
      <div className={css.sidebarHeading}><IconAgentPresetOutline16 /><strong>{t('agentLibrary')}</strong>
        <Button size="sm" shape="rounded" className={css.iconButton} icon={<IconRefreshOutline16 />} aria-label={t('refresh')} title={t('refresh')} disabled={state.loading} onClick={() => { invoke(props.refresh()) }} />
        <Button className={clsx(css.iconButton, css.sidebarClose)} size="sm" shape="rounded" icon={<IconCloseOutline16 />} aria-label={t('close')} onClick={() => { props.actions.update({ sidebarOpen: false }) }} />
      </div>
      <Button variant="outline" icon={<IconPlusOutline16 />} disabled={!state.roster.authorable || state.busy} onClick={() => { openDialog('create') }}>{t('create')}</Button>
      <div className={css.agentList}>{groups.map(group => <nav className={css.agentGroup} key={group.label} aria-label={t(group.label)}>
        <div className={css.groupHeading}><span>{t(group.label)}</span><span className={css.count}>{group.rows.length}</span></div>
        {group.rows.map(row => <button key={row.id} className={css.agentRow} aria-current={state.document?.agentPreset === row.id ? 'page' : undefined} disabled={state.busy} onClick={() => { open(row.id) }}><IconAgentPresetOutline16 /><span><strong>{row.name || row.id}</strong>{row.builtIn && <small>{row.id} · {t('builtinReadOnly')}</small>}{row.description && <small title={row.description}>{row.description}</small>}{row.broken && <small>{t('broken')}</small>}</span></button>)}
      </nav>)}</div>
    </aside>}
    <main className={css.main}>
      <div className={css.documentBar}>
        <Button size="sm" shape="rounded" variant="ghost" className={css.iconButton} data-studio-library-toggle icon={<IconPanelLeftOutline16 />} aria-label={t('toggleSidebar')} title={t('toggleSidebar')} onClick={() => { props.actions.update({ sidebarOpen: !view.sidebarOpen }) }} />
        {state.openIds.length > 0 && <nav className={css.tabs} data-dsw-document-tabs role="tablist" aria-label={t('openAgents')}>
          {state.openIds.map(agent => {
            const name = state.roster.presets.find(row => row.id === agent)?.name || agent
            const active = agent === state.document?.agentPreset
            const disabled = state.busy || state.executingToolIds.length > 0
            return <div key={agent} className={css.documentTab} data-dsw-document-tab data-active={active || undefined}>
              <button type="button" className={css.tabSelect} role="tab" aria-selected={active} title={name}
                tabIndex={active ? 0 : -1} disabled={disabled} onClick={() => { open(agent) }}
                onAuxClick={event => { if(event.button === 1 && !disabled){event.preventDefault();closeTab(agent)} }}
                onKeyDown={event => {
                  const index = state.openIds.indexOf(agent)
                  const target = event.key === 'ArrowRight' ? (index + 1) % state.openIds.length
                    : event.key === 'ArrowLeft' ? (index + state.openIds.length - 1) % state.openIds.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? state.openIds.length - 1 : -1
                  if(target >= 0){event.preventDefault();pendingTabFocus.current = true;const tab = event.currentTarget.closest('nav')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target];tab?.focus();open(state.openIds[target])}
                  else if(event.key === 'Delete'){event.preventDefault();closeTab(agent)}
                }}><IconAgentPresetOutline16 size={16}/><span>{name}</span>{active && state.status !== 'saved' && <i className={css.unsavedDot} aria-label={t('save')}/>}</button>
              <button type="button" className={css.tabClose} aria-label={t('close') + ' ' + name} title={t('close')}
                disabled={disabled} onClick={() => { closeTab(agent) }}><IconCloseOutline16 size={14}/></button>
            </div>
          })}
          <Button size="sm" shape="rounded" variant="ghost" className={css.newTab} icon={<IconPlusOutline16/>} aria-label={t('create')} title={t('create')} disabled={!state.roster.authorable || state.busy} onClick={() => { openDialog('create') }}/>
        </nav>}
        <Button size="sm" shape="rounded" onClick={() => { props.actions.update({ libraryHistory: true }); void props.refreshRecords().catch(() => {}) }}>{props.recordsT('title')}</Button>
      </div>

      {actionError && <div className={css.error} role="alert"><span>{t('errorTitle')}</span><details><summary>{t('errorDetails')}</summary><pre>{actionError}</pre></details><Button size="sm" onClick={() => { setActionError(null) }}>{t('dismiss')}</Button></div>}
      {state.error && dialog === null && <div className={css.error} role="alert"><span>{t(state.error === 'agent-studio/add-user-message' ? 'addUserMessage' : state.error === 'agent-studio/model-required' ? 'modelRequired' : 'errorTitle')}</span><details><summary>{t('errorDetails')}</summary><pre>{state.error}</pre></details><Button size="sm" onClick={props.clearError}>{t('dismiss')}</Button></div>}
      {state.status === 'conflict' && <div className={css.conflict}><span>{t('conflictHint')}</span><Button size="sm" onClick={() => { openDialog('reload') }}>{t('reload')}</Button></div>}
      {view.libraryHistory ? <div className={css.recordsRoot}>
        <RecordsPane state={records} agents={state.roster.presets} t={props.recordsT}
          onRefresh={(query, more) => { void props.refreshRecords(query, more) }} onOpen={(item) => { void props.openRecord(item) }}
          onList={props.closeRecord} onBack={() => { props.actions.update({ libraryHistory: false }) }} />
        {records.detail?.sessionReady && records.detail.item.sessionId && <details className={css.recordDiagnostic} key={records.detail.item.id}><summary>{props.recordsT('trace')}</summary><section className={css.recordTrace} aria-label={props.recordsT('trace')}>
          <props.SessionProvider sessionId={records.detail.item.sessionId}>
            {props.renderSlot('conversation', { presentation: 'embedded', ...(records.detail.trial?.run.outputEndSeq === undefined ? {} : { outputEndSeq: records.detail.trial.run.outputEndSeq }) })}
          </props.SessionProvider>
        </section></details>}
      </div> : !draft ? <div className={css.empty}><IconAgentPresetOutline16 /><h1>{t(state.loading ? 'loading' : 'empty')}</h1><p>{t('emptyHint')}</p><Button variant="primary" disabled={!state.roster.authorable || state.busy} onClick={() => { openDialog('create') }}>{t('create')}</Button>{!state.loading && !state.roster.authorable && <p>{t('readonly')}</p>}</div> : <>
        <div className={css.mobileTabs}><Pill active={view.panel === 'config'} onClick={() => { props.actions.update({ panel: 'config' }) }}>{t('config')}</Pill><Pill active={view.panel === 'trial'} onClick={() => { props.actions.update({ panel: 'trial' }) }}>{t('trial')}</Pill></div>
        <div ref={splitRef} className={css.split} style={{ '--agent-split': `${view.split}%` } as CSSProperties} data-panel={view.panel}>
          <section className={css.config} aria-label={t('config')}>
            <header className={css.paneHeader}>
              <strong className={css.heading} title={draft.name}>{draft.name}</strong>
              <Button size="sm" shape="rounded" disabled={startingConversation || state.busy || !canRunModel || state.status === 'conflict'} onClick={() => {
                if (startingConversation) return
                setStartingConversation(true); setActionError(null)
                void props.startConversation().catch((error: unknown) => { setActionError(String(error)) }).finally(() => { setStartingConversation(false) })
              }}>{t('startConversation')}</Button>
              {readOnly && <><span className={clsx(css.saveStatus, css.readOnlyStatus)}>{t('builtinReadOnly')}</span><Button size="sm" shape="rounded" variant="outline" icon={<IconCopyOutline16 />} disabled={state.busy || !state.roster.authorable} onClick={() => { invoke(props.duplicateAgent(t('copyName', { name: draft.name }))) }}>{t('copyToMine')}</Button></>}
              {!readOnly && <div className={css.saveControl}>
                {(state.status === 'error' || state.status === 'conflict') && <span className={css.saveStatus} data-status={state.status} role="status">{t(state.status)}</span>}
                <span role="status"><Button size="sm" shape="rounded" variant="outline" className={css.saveButton} data-saved={state.status === 'saved'}
                  icon={state.status === 'saving' ? <IconLoadingOutline16 /> : <IconCheckOutline16 />}
                  disabled={state.busy || state.status === 'saved' || state.status === 'saving' || state.status === 'conflict'} onClick={() => { invoke(props.save()) }}>
                  {t(state.status === 'saved' || state.status === 'saving' ? state.status : 'save')}
                </Button></span>
              </div>}
              {!readOnly && <Menu open={agentMenuOpen} portal align="end" compact onClose={() => { setAgentMenuOpen(false) }}
                anchor={<Button size="sm" shape="rounded" className={css.iconButton} icon={<IconEllipsisOutline16 />} aria-label={t('agentActions')} title={t('agentActions')} aria-haspopup="menu" aria-expanded={agentMenuOpen} onClick={() => { setAgentMenuOpen(!agentMenuOpen) }} />}
                items={[{ id: 'duplicate', label: t('duplicate'), icon: <IconCopyOutline16 />, disabled: state.busy || !state.roster.authorable }, { id: 'separator', type: 'separator' }, { id: 'delete', label: t('delete'), icon: <IconTrashOutline16 />, danger: true, disabled: state.busy }]}
                onSelect={(action) => { setAgentMenuOpen(false); if (action === 'duplicate') invoke(props.duplicateAgent(t('copyName', { name: draft.name }))); else openDialog('delete') }} />}
            </header>
            <div className={css.configScroll}>
              {readOnly && <p className={css.hint}>{t('builtinHint')}</p>}
              {runtime && <details className={css.metadata}><summary>{t('runtimeRules')}</summary><p className={css.hint}>{t('runtimeSource', { source: runtime.source })}</p>{runtime.toolPresentation && <p className={css.hint}>{t(runtime.toolPresentation === 'ptc' ? 'runtimePtc' : runtime.toolPresentation === 'both' ? 'runtimeBoth' : 'runtimeNative')}</p>}<p className={css.hint}>{t('promptComposed')}</p></details>}
              <div className={css.field}><label htmlFor={`${id}-model`}>{t('model')}</label><select disabled={readOnly} id={`${id}-model`} className={css.select} value={draft.modelSelection === 'unset' || draft.modelSelection === 'global' ? draft.modelSelection : JSON.stringify([draft.provider, draft.model])} onChange={(event) => {
                const value = event.currentTarget.value
                if (value === 'unset' || value === 'global') {
                  props.changeDefinition({ modelSelection: value, provider: '', model: '', reasoningEffort: undefined })
                }
                else { const [provider, modelId] = JSON.parse(value) as [string,string]; props.changeDefinition({ modelSelection: 'explicit', provider, model: modelId, reasoningEffort: undefined }) }
              }}>
                <option value="unset">{t('chooseModel')}</option>
                <option value="global">{t('globalModel')}</option>
                {!model && !!draft.model && <option value={JSON.stringify([draft.provider, draft.model])}>
                  {draft.provider} / {draft.model}
                </option>}
                {state.models?.groups.map(group => <optgroup label={group.name} key={group.id}>
                  {group.models.map(item => <option key={item.id} value={JSON.stringify([group.id, item.id])}>{item.name}</option>)}
                </optgroup>)}
              </select></div>
              {!canRunModel && <p className={css.hint}>{t('modelRequired')}</p>}
              {draft.modelSelection === 'global' && state.models?.default && <p className={css.hint}>{state.models.default.provider} / {state.models.default.model}</p>}
              {model?.reasoning && <div className={css.field}><label htmlFor={`${id}-effort`}>{t('reasoning')}</label><select disabled={readOnly} id={`${id}-effort`} className={css.select} value={draft.reasoningEffort ?? ''} onChange={(event) => { props.changeDefinition({ reasoningEffort: event.currentTarget.value || undefined }) }}><option value="">{t('defaultEffort')}</option>{model.reasoning.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}</select></div>}
              <div className={css.capabilities}>
                <div className={css.capability}><label>{t('pluginCapabilitiesLabel')}</label><div>
                  <PluginCapabilitySummary catalog={plugins} selection={pluginSelection} readOnly={readOnly} loading={state.catalogLoading}
                    t={pluginT} onOpen={openPlugins} onRemove={removePlugins} />
                  {!readOnly && <p className={css.hint}>{t('pluginFrontendHint')}</p>}
                  {state.pluginStorageWarning && <p className={css.hint} role="status">{t('pluginStorageWarning')}</p>}
                  {state.pluginDirectoryError && <details className={css.pluginWarning}><summary>{t('pluginDirectoryWarning')}</summary><p>{state.pluginDirectoryError}</p></details>}
                </div></div>
                <div className={css.capability}><label>{t('skills')}</label><div className={css.chips}>
                  {draft.skills.length ? draft.skills.map(name => <Pill appearance="tag" key={name} title={name} onClick={() => { openDialog('skills') }}
                    {...!readOnly ? { removal: { label: t('removeSkill', { name }), onRemove: () => { props.changeDefinition({ skills: draft.skills.filter(value => value !== name) }) } } } : {}}>{name}</Pill>) : <span className={css.muted}>{t('none')}</span>}
                  <Button size="sm" icon={readOnly ? undefined : <IconPlusOutline16 />} onClick={() => { openDialog('skills') }}>{t(readOnly ? 'viewCapabilities' : 'add')}</Button>
                </div></div>
                {(draft.tools.some(name => name.startsWith('openconnector/')) || state.catalog?.tools.some(tool => tool.source === 'openconnector')) && <div className={css.capability}><label>{t('connectorTab')}</label><div className={css.chips}>
                  <span className={css.muted}>{t('pluginExternalSummary', { count: draft.tools.filter(name => name.startsWith('openconnector/')).length })}</span>
                  <Button size="sm" onClick={() => { setToolSource('openconnector'); openDialog('tools') }}>{t(readOnly ? 'viewCapabilities' : 'add')}</Button>
                </div></div>}
              </div>
              <PromptWriter writer={props.promptWriter} editor={state} label={t(runtime ? 'rolePrompt' : 'prompt')} hint={t(runtime ? 'presetPromptHint' : 'promptHint')} placeholder={t('promptPlaceholder')} t={props.promptT} onChange={(systemPrompt) => { props.changeDefinition({ systemPrompt }) }} />
              <details className={css.metadata}><summary>{t('agentDetails')}</summary>
                <div className={css.field}><label htmlFor={`${id}-name`}>{t('name')}</label><Input readOnly={readOnly} id={`${id}-name`} maxLength={120} value={draft.name} onChange={(event) => { props.changeDefinition({ name: event.currentTarget.value }) }} /></div>
                <div className={css.field}><label htmlFor={`${id}-description`}>{t('description')}</label><Input readOnly={readOnly} id={`${id}-description`} maxLength={1000} value={draft.description} onChange={(event) => { props.changeDefinition({ description: event.currentTarget.value }) }} /></div>
                {!readOnly && state.autoInvocationAvailable && <div className={css.autoInvocation}>
                  <label><input type="checkbox" checked={draft.allowAutoInvocation === true} disabled={!draft.description.trim() && !draft.allowAutoInvocation}
                    onChange={(event) => { props.changeDefinition({ allowAutoInvocation: event.currentTarget.checked }) }} />{t('allowAutoInvocation')}</label>
                  <p className={css.hint}>{t(draft.description.trim() ? 'autoInvocationHint' : 'autoInvocationDescription')}</p>
                </div>}
              </details>
              <details className={css.location}><summary>{t('context')}</summary><label className={css.srOnly} htmlFor={`${id}-context`}>{t('context')}</label>{state.contexts.length > 0 && <select className={css.select} id={`${id}-context`} value={state.contextKey} onChange={(event) => { invoke(props.changeContext(event.currentTarget.value)) }}><option value="">{t('generalContext')}</option>{state.contexts.map(context => <option key={contextKey(context)} value={contextKey(context)}>{context.projectName} / {context.collectorName}</option>)}</select>}<label htmlFor={`${id}-cwd`}>{t('directory')}</label><Input id={`${id}-cwd`} value={state.cwd} readOnly={!!state.contextKey} onChange={(event) => { props.changeCwd(event.currentTarget.value) }} onBlur={() => { if (!state.contextKey) invoke(props.refreshCatalog()) }} /><Button size="sm" disabled={state.catalogLoading || !state.cwd.trim()} onClick={() => { invoke(props.refreshCatalog()) }}>{t(state.catalogLoading ? 'catalogLoading' : 'refreshCatalog')}</Button></details>

            </div>
          </section>
          <div className={css.separator} role="separator" tabIndex={0} aria-label={t('resize')} aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={view.split} title={t('resizeHint', { percent: Math.round(view.split) })} onDoubleClick={() => { props.actions.update({ split: 50 }) }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); props.actions.update({ split: Math.max(30, Math.min(70, view.split + (event.key === 'ArrowRight' ? 2 : -2))) }) } }} onPointerDown={(event) => { if(event.button !== 0)return;event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.dataset.dragging='true' }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const rect = splitRef.current?.getBoundingClientRect(); if (rect) props.actions.update({ split: Math.max(30, Math.min(70, (event.clientX - rect.left) / rect.width * 100)) }) } }} onPointerUp={(event) => { delete event.currentTarget.dataset.dragging;if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onLostPointerCapture={event=>{delete event.currentTarget.dataset.dragging}} onPointerCancel={event=>{delete event.currentTarget.dataset.dragging}} />
          <section className={css.right}>
            <header className={css.paneHeader}><strong className={css.heading}>{t(view.rightTab === 'history' ? 'history' : 'trial')}</strong><Button size="sm" disabled={!draft} onClick={() => { setDialog('capability-check') }}>{t('pluginCheckAction')}</Button>
              <TrialToolbar toolsRunning={state.executingToolIds.length > 0} runState={state.runState} input={state.input} busy={state.busy} canRun={!state.executingToolIds.length && state.status !== 'conflict' && canRunModel && !!state.cwd.trim()} onRun={() => { props.actions.update({ rightTab: 'trial', panel: 'trial' }); invoke(props.startRun()) }} onStop={() => { invoke(props.stopRun()) }} t={props.trialT} settings={state.settings} onSettingsChange={props.changeSettings} undoable={state.undoable} redoable={state.redoable} onUndo={props.undoMessages} onRedo={props.redoMessages} onClear={props.clearRun} onShowHistory={() => { props.actions.update({ rightTab: 'history' }); invoke(props.refreshHistory()) }} />
            </header>
            <nav className={css.rightTabs} hidden={view.rightTab === 'trial'}><Pill active={view.rightTab === 'trial'} onClick={() => { props.actions.update({ rightTab: 'trial' }) }}>{t('trial')}</Pill><Pill active={view.rightTab === 'history'} onClick={() => { props.actions.update({ rightTab: 'history' }); invoke(props.refreshHistory()) }}>{t('history')}</Pill></nav>
            <div className={css.paneSlot} hidden={view.rightTab !== 'trial'}><TrialPane toolsRunning={state.executingToolIds.length > 0} SessionProvider={props.SessionProvider} loadImage={props.loadImage} traceRunState={state.toolRunState} pendingApproval={!!pendingInteraction} messages={[...state.messages, ...state.output]} onChangeMessages={props.changePlayground} inputMessages={state.inputMessages} onMessagesChange={props.changeMessages} showRunAction={false} t={props.trialT} renderSlot={props.renderSlot} runState={state.runState} conversationReady={!!diagnostic && diagnostic.run.sessionId === state.sessionReadyId} onRetryConversation={() => { invoke(props.restoreSession()) }} settings={state.settings} input={state.input} busy={state.busy} canRun={!state.executingToolIds.length && state.status !== 'conflict' && canRunModel && !!state.cwd.trim()} onInputChange={props.changeInput} onSettingsChange={props.changeSettings} onRun={(id) => { invoke(props.startRun(id)) }} onStop={() => { invoke(props.stopRun()) }} executingToolIds={[...state.executingToolIds, ...state.runState?.executingToolIds ?? []]} onContinue={(id) => { invoke(props.continueRun(id)) }} onExecuteTools={(id, calls) => { invoke(props.executeTools(id, calls)) }} onClear={props.clearRun} onShowHistory={() => { props.actions.update({ rightTab: 'history' }); invoke(props.refreshHistory()) }} /></div><div className={css.paneSlot} hidden={view.rightTab !== 'history'}><HistoryPane key={state.document?.agentPreset} t={props.historyT} runs={state.runs} evaluations={state.evaluations} results={state.results} selectedRunIds={view.selectedRunIds} loading={state.loading} resultsLoading={state.resultsLoading} onSelectRuns={selectRuns} onSelectRun={(runId, selected) => { selectRuns(selected ? [...view.selectedRunIds, runId].slice(0,2) : view.selectedRunIds.filter(id => id !== runId)) }} onOpenRun={(runId) => { props.actions.update({ rightTab: 'trial' }); invoke(props.openRun(runId)) }} onSaveEvaluation={props.saveEvaluation} onRefresh={() => { invoke(props.refreshHistory()) }} /></div>
          </section>
        </div>
      </>}
    </main>
    <Modal open={dialog === 'create'} title={t('create')} closeLabel={t('close')} onClose={() => { setDialog(null) }}><form className={css.dialogBody} onSubmit={(event) => { event.preventDefault(); void props.createAgent(newName.trim()).then(() => { setDialog(null); setNewName('') }).catch(() => {}) }}><p className={css.hint}>{t('createHint')}</p><label htmlFor={`${id}-new-name`}>{t('name')}</label><Input id={`${id}-new-name`} autoFocus required maxLength={120} value={newName} onChange={(event) => { setNewName(event.currentTarget.value) }} /><OperationError error={state.error} t={t} /><div className={css.dialogActions}><Button onClick={() => { setDialog(null) }}>{t('cancel')}</Button><Button type="submit" variant="primary" disabled={state.busy || !newName.trim()}>{t('createAction')}</Button></div></form></Modal>
    <PluginPicker open={dialog === 'plugins'} catalog={plugins} selection={pluginSelection} readOnly={readOnly}
      loading={state.catalogLoading} error={state.error} initialPluginId={pluginDetailId} selectedSkills={draft?.skills ?? []}
      t={pluginT} onRefresh={() => { invoke(props.refreshCatalog()) }} onClose={() => { setDialog(null) }}
      onComplete={selection => { changePlugins(selection); setDialog(null) }} />
    <Modal open={dialog === 'capability-check'} title={t('pluginCheckTitle')} closeLabel={t('close')} onClose={() => { setDialog(null) }}
      footer={<Button variant="primary" onClick={() => { setDialog(null) }}>{t('close')}</Button>}>
      <div className={css.pluginCheck}><p className={css.hint}>{t('pluginCheckHint')}</p><p className={css.hint}>{t('pluginPickerSummary', { plugins: pluginSummary.plugins, tools: pluginSummary.tools })}</p>
        {plugins.filter(plugin => pluginSelection[plugin.id]?.enabled).map(plugin => <section key={plugin.id} className={css.pluginCheckRow}>
          <strong>{pluginT(plugin.nameKey)}</strong><span>{t('pluginPickerToolCount', { count: chosenPluginTools(plugin, pluginSelection).length })}</span>
          {plugin.reasonKey && <p className={css.hint}>{pluginT(plugin.reasonKey)}</p>}
          {plugin.requiresContext && <p className={css.hint}>{t('pluginPickerContext', { context: plugin.requiresContext })}</p>}
          <details><summary>{t('pluginCheckTools')}</summary><pre>{chosenPluginTools(plugin, pluginSelection).map(tool => tool.name).join('\n')}</pre></details>
        </section>)}
      </div>
    </Modal>
    <Modal open={dialog === 'tools' || dialog === 'skills'} className={clsx(dialog === 'tools' ? css.catalogDialog : css.skillsDialog)} {...dialog === 'tools' ? { contentClassName: css.catalogContent } : {}} footer={<>{!(dialog === 'tools' && toolSource === 'openconnector') && <Button disabled={state.catalogLoading || !state.cwd.trim()} onClick={() => { void props.refreshCatalog().catch(() => {}) }}>{t('refreshCatalog')}</Button>}<Button variant="primary" onClick={() => { setDialog(null) }}>{t('close')}</Button></>} title={t(dialog === 'skills' ? 'selectSkills' : 'selectTools')} description={t(dialog === 'skills' ? 'skillsHint' : 'selectHint')} closeLabel={t('close')} onClose={() => { setDialog(null) }}>
      <div className={css.dialogBody}>
        {state.connectorAvailable && dialog === 'tools' && <nav className={css.connectorActions} aria-label={t('toolSource', { source: '' })}><Pill active={toolSource === 'local'} onClick={() => { setToolSource('local') }}>{t('localToolsTab')}</Pill><Pill active={toolSource === 'openconnector'} onClick={() => { setToolSource('openconnector') }}>{t('connectorTab')}</Pill></nav>}
        {dialog === 'tools' && toolSource === 'openconnector' ? <ConnectorPicker t={t} useConnector={props.useConnector} connectorLoad={props.connectorLoad} connectorSearch={props.connectorSearch} connectorRestart={props.connectorRestart} connectorConsole={props.connectorConsole} draft={draft} readOnly={readOnly} toggle={props.connectorToggle} bind={props.connectorBind} /> : <div className={dialog === 'tools' ? css.catalogLayout : css.dialogBody}>
          <aside className={dialog === 'tools' ? css.catalogSidebar : css.skillSearch}>
            <Input aria-label={t('search')} placeholder={t('search')} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setCategory('all') }} />
            {dialog === 'tools' && <nav className={css.categoryNav} aria-label={t('toolCategories')}>
              <button aria-pressed={activeCategory === 'all'} onClick={() => { setCategory('all') }}>
                <span>{t(query ? 'searchResults' : 'commonTools')}</span>{' '}<span className={css.count}>{defaultOptions.length}</span>
              </button>
              <button aria-pressed={activeCategory === 'selected'} onClick={() => { setCategory('selected') }}>
                <span>{t('selectedTools')}</span>{' '}<span className={css.count}>{selectedOptions.length}</span>
              </button>
              {allOptions.some(isAdvancedTool) && <button aria-pressed={activeCategory === 'advanced'} onClick={() => { setCategory('advanced') }}>
                <span>{t('advancedTools')}</span>{' '}<span className={css.count}>{advancedOptions.length}</span>
              </button>}
              {categories.map(key => <button key={key} aria-pressed={activeCategory === key} onClick={() => { setCategory(key) }}>
                <span>{t(key)}</span>{' '}<span className={css.count}>{matching.filter(item => !isAdvancedTool(item) && toolCategory(item.name) === key).length}</span>
              </button>)}
            </nav>}
          </aside>
          <div className={css.catalogResults}>
            {dialog === 'skills' && state.catalog && <p className={css.hint}>{t('skillCount', { count: matching.length, selected: selected.length })}</p>}
            {!state.cwd.trim() && <p>{t('catalogNeedsDirectory')}</p>}
            {!!state.cwd.trim() && !state.catalog && !state.catalogLoading && !state.error && <p>{t('catalogMissing')}</p>}
            {state.catalogLoading && <p role="status">{t('catalogLoading')}</p>}
            {dialog === 'tools' && activeCategory === 'advanced' && <p className={css.hint}>{t('advancedToolsHint')}</p>}
            <div className={clsx(css.optionList, dialog === 'tools' && css.groupedOptions)}>{options.map(option => <label key={optionId(option)} className={clsx(css.option, selected.includes(optionId(option)) && css.optionSelected)}>
              <span><strong>{option.name}</strong><small title={option.description}>{option.description}</small>
                {option.source && <small>{t('toolSource', { source: option.source })}</small>}
                {option.requiresContext && <small>{t('requiresContext', { context: option.requiresContext })}</small>}
                {option.unavailable && <small title={option.unavailable}>{t('dependencyUnavailable')}</small>}</span>
              <input disabled={readOnly} type="checkbox" checked={selected.includes(optionId(option))} onChange={(event) => { toggle(optionId(option), event.currentTarget.checked) }} />
            </label>)}</div>
            {!options.length && !state.catalogLoading && state.catalog && <p>{t(query ? 'noMatches'
              : dialog === 'skills' ? 'noSkills' : activeCategory === 'selected' ? 'noSelectedTools'
                : activeCategory !== 'all' ? 'noMatches' : advancedOptions.length ? 'noCommonTools' : 'noTools')}</p>}
          </div>
        </div>}
        <OperationError error={state.error} t={t} />

      </div>
    </Modal>
    <Modal open={dialog === 'delete' || dialog === 'reload'} title={t(dialog === 'delete' ? 'delete' : 'reload')} closeLabel={t('close')} onClose={() => { setDialog(null) }}><div className={css.dialogBody}><p>{dialog === 'delete' ? t('deleteConfirm', { name: draft?.name ?? '' }) : t('reloadConfirm')}</p><OperationError error={state.error} t={t} /><div className={css.dialogActions}><Button onClick={() => { setDialog(null) }}>{t('cancel')}</Button><Button variant="primary" {...dialog === 'delete' ? { tone: 'danger' as const } : {}} disabled={state.busy} onClick={() => { void (dialog === 'delete' ? props.deleteAgent() : props.reload()).then(() => { setDialog(null) }).catch(() => {}) }}>{t(dialog === 'delete' ? 'delete' : 'reload')}</Button></div></div></Modal>
  </div>
}
