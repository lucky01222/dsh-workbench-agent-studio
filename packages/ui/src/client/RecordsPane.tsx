/** Compact history controls reuse the Studio list, form and snapshot presentation. */
import { useId } from 'react'
import { Button } from './primitives.tsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { StudioHistoryItem, StudioHistoryRequest } from '@deepseek-ai/dsh-api-agent-studio-controller/types'
import type { StudioRecordsSnapshot } from './records.ts'
import css from './history.module.css'

interface Props extends PropsLocale<'agent-studio-records'> {
  state: StudioRecordsSnapshot
  agents: readonly { id: string; name?: string }[]
  onRefresh(this: void, query?: StudioHistoryRequest, more?: boolean): void
  onOpen(this: void, item: StudioHistoryItem): void
  onList(this: void): void
  onBack(this: void): void
}
const statuses = ['preparing', 'running', 'waiting-tools', 'waiting-model', 'succeeded', 'failed', 'cancelled', 'interrupted'] as const

/** Render history filters and captured content.
 * @param props - Host-backed history and navigation callbacks.
 * @returns Read-only history controls.
 */
export function RecordsPane({ state, agents, onRefresh, onOpen, onList, onBack, t }: Props) {
  const id = useId(), query = state.query, detail = state.detail
  const rows = [...new Map([...(state.page.agents ?? []), ...agents].map(agent => [agent.id, agent])).values()]
  const agentName = (item: StudioHistoryItem) => item.agentName === item.agentPreset
    ? agents.find(agent => agent.id === item.agentPreset)?.name ?? item.agentName : item.agentName
  const change = (patch: Partial<StudioHistoryRequest>) => { const next = { ...query, ...patch }; delete next.cursor; onRefresh(next) }
  const status = (value: string) => statuses.includes(value as typeof statuses[number]) ? t(value as typeof statuses[number]) : value
  return <section className={css.pane} aria-label={t('title')}>
    <header className={css.toolbar}><h2>{t('title')}</h2><Button size="sm" onClick={onBack}>{t('back')}</Button></header>
    <p className={css.hint}>{t('hint')}</p>
    {state.error && <div role="alert" className={css.error}><span>{t('error')}</span><details><summary>{t('errorDetails')}</summary><pre>{state.error}</pre></details></div>}
    {state.opening && <p role="status">{t('loading')}</p>}
    {state.snapshot ? <>
      <div className={css.selectionBar}><h3>{state.snapshot.definition.name}</h3><span>{t('revision', { revision: state.snapshot.revision })}</span></div>
      <p className={css.hint}>{t('readOnly')}</p>
      {[[t('model'), `${state.snapshot.definition.provider} / ${state.snapshot.definition.model}`],
        [t('tools'), state.snapshot.definition.tools.join('\n')], [t('skills'), state.snapshot.definition.skills.join('\n')],
        [t('promptLabel'), state.snapshot.definition.systemPrompt]].map(([label, value]) => <div className={css.snapshot} key={label}><h4>{label}</h4><pre tabIndex={0}>{value || t('none')}</pre></div>)}
    </> : detail ? <>
      <div className={css.selectionBar}><Button size="sm" onClick={onList}>{t('list')}</Button><strong>{agentName(detail.item)}</strong>
        <span className={css.hint}>{t(detail.item.kind)} · {status(detail.item.status)}{detail.item.revision ? ` · ${t('revision', { revision: detail.item.revision })}` : ''}</span></div>
      <p className={css.hint}>{t('readOnly')}</p>
      {detail.prompt && <>{[[t('instruction'), detail.prompt.request.instruction], [t('original'), detail.prompt.request.original],
        [t('candidate'), detail.prompt.text || t('noCandidate')]].map(([label, text]) => <div className={css.snapshot} key={label}><h4>{label}</h4><pre tabIndex={0}>{text}</pre></div>)}</>}
    </> : <>
      <div className={css.recordFilters}>
        <label htmlFor={`${id}-agent`}>{t('agent')}<select id={`${id}-agent`} value={query.agentPreset ?? ''} onChange={(event) => { const next = { ...query }; if (event.target.value) next.agentPreset = event.target.value; else delete next.agentPreset; onRefresh(next) }}><option value="">{t('allAgents')}</option>{rows.map(agent => <option key={agent.id} value={agent.id}>{agent.name ?? agent.id}</option>)}</select></label>
        <label htmlFor={`${id}-kind`}>{t('kind')}<select id={`${id}-kind`} value={query.kind ?? ''} onChange={(event) => { const next = { ...query }; if (event.target.value) next.kind = event.target.value as 'trial' | 'prompt'; else delete next.kind; onRefresh(next) }}><option value="">{t('allKinds')}</option><option value="trial">{t('trial')}</option><option value="prompt">{t('prompt')}</option></select></label>
        <label htmlFor={`${id}-status`}>{t('status')}<select id={`${id}-status`} value={query.status ?? ''} onChange={(event) => { const next = { ...query }; if (event.target.value) next.status = event.target.value; else delete next.status; onRefresh(next) }}><option value="">{t('allStatuses')}</option>{statuses.map(value => <option value={value} key={value}>{t(value)}</option>)}</select></label>
        <Button size="sm" disabled={state.loading} onClick={() => { change({}) }}>{t('refresh')}</Button>
      </div>
      {state.loading && <p role="status" className={css.hint}>{t('loading')}</p>}
      {!state.loading && !state.page.items.length && <p className={css.empty}>{t('empty')}</p>}
      <ul className={css.runList}>{state.page.items.map(item => <li className={css.runRow} key={`${item.kind}:${item.id}`}><div className={css.runContent}>
        <button className={css.runTitle} onClick={() => { onOpen(item) }}>{item.preview || agentName(item)}</button>
        <div className={css.meta}><span>{agentName(item)}</span><span>{t(item.kind)}</span><span>{status(item.status)}</span>{item.revision && <span>{t('revision', { revision: item.revision })}</span>}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
      </div><Button size="sm" disabled={state.opening} onClick={() => { onOpen(item) }}>{t('open')}</Button></li>)}</ul>
      {state.page.nextCursor && <Button size="sm" disabled={state.loading} onClick={() => { onRefresh(query, true) }}>{t('more')}</Button>}
    </>}
  </section>
}
