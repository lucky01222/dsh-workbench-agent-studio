/** Real trial snapshots and persisted, manually authored A/B evaluations. */
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  StudioEvaluation, StudioEvaluationRequest, StudioRubric, StudioRun, StudioRunId,
} from '@deepseek-ai/dsh-api-agent-studio-controller/types'
import { Button, Input } from './primitives.tsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
const randomUUID = () => crypto.randomUUID()
import type { HistoryKey } from './history.locale.ts'
import css from './history.module.css'

/** Parent-owned records and persistence; result strings must end at each run's outputEndSeq. */
export interface HistoryPaneProps extends PropsLocale<'agent-studio-history'> {
  runs: readonly StudioRun[]
  evaluations: readonly StudioEvaluation[]
  selectedRunIds: readonly string[]
  results: Readonly<Record<string, string | undefined>>
  loading?: boolean
  resultsLoading?: boolean
  error?: string | null
  onOpenRun: (id: StudioRunId) => void
  onSelectRun: (id: StudioRunId, selected: boolean) => void
  onSelectRuns: (ids: readonly StudioRunId[]) => void
  onSaveEvaluation: (request: StudioEvaluationRequest) => Promise<StudioEvaluation>
  onRefresh?: () => void
}

const verdicts = ['leftBetter', 'rightBetter', 'tie', 'pass', 'fail'] as const
const scoreValues = [1, 2, 3, 4, 5] as const
const terminal = new Set<StudioRun['status']>(['succeeded', 'failed', 'cancelled', 'interrupted', 'waiting-tools'])
type T = HistoryPaneProps['t']
type DraftScores = Record<string, { left?: number; right?: number }>
type DraftRubric = { name: string; criteria: { id: string; name: string; description: string }[] }

function samePair(evaluation: StudioEvaluation, ids: readonly string[]): boolean {
  return ids.length === 2 && ids.includes(evaluation.leftRunId) && ids.includes(evaluation.rightRunId)
}

function copyRubric(rubric: StudioRubric): DraftRubric {
  return { name: rubric.name, criteria: rubric.criteria.map(criterion => ({ ...criterion })) }
}

function emptyCriterion() {
  return { id: randomUUID(), name: '', description: '' }
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function ErrorDetails({ error, t }: { error: string; t: T }) {
  return <details className={css.errorDetails}>
    <summary>{t('history.errorDetails')}</summary>
    <pre>{error}</pre>
  </details>
}

function RunMeta({ run, t }: { run: StudioRun; t: T }) {
  return <div className={css.meta}>
    <span className={css.status} data-status={run.status}>{t(`status.${run.status}`)}</span>
    <span>{(run.configuration ?? run.document.definition).model}</span>
    <span>{t('history.revision', { revision: run.document.revision })}</span>
    <time dateTime={run.createdAt}>{timeLabel(run.createdAt)}</time>
  </div>
}

/**
 * Show captured trial records and compare two runs without reading a live editor or Session.
 * @param props - Records, bounded result text, translations, and parent-owned navigation/persistence.
 * @returns The inline history or comparison pane for the Agent Studio application.
 */
export function HistoryPane(props: HistoryPaneProps) {
  const { runs, evaluations, selectedRunIds, loading, error, onSelectRun, onSelectRuns, onOpenRun, onRefresh, t } = props
  const [comparing, setComparing] = useState(false)
  const [openedEvaluationId, setOpenedEvaluationId] = useState<string>()
  const compareButton = useRef<HTMLSpanElement>(null)
  const backButton = useRef<HTMLSpanElement>(null)
  const previousView = useRef(false)
  useEffect(() => {
    if (comparing) backButton.current?.querySelector('button')?.focus()
    else if (previousView.current) compareButton.current?.querySelector('button')?.focus()
    previousView.current = comparing
  }, [comparing])
  const orderedRuns = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const orderedEvaluations = [...evaluations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const selected = selectedRunIds.flatMap((id) => {
    const run = runs.find(item => item.id === id)
    return run && terminal.has(run.status) ? [run] : []
  })
  const evaluation = openedEvaluationId
    ? evaluations.find(item => item.id === openedEvaluationId && samePair(item, selectedRunIds))
    : orderedEvaluations.find(item => samePair(item, selectedRunIds))
  const left = evaluation ? runs.find(run => run.id === evaluation.leftRunId) : selected[0]
  const right = evaluation ? runs.find(run => run.id === evaluation.rightRunId) : selected[1]

  const compareSelected = () => {
    setOpenedEvaluationId(evaluation?.id)
    if (evaluation) onSelectRuns([evaluation.leftRunId, evaluation.rightRunId])
    setComparing(true)
  }

  return <section className={css.pane} aria-label={t(comparing ? 'compare.title' : 'history.title')}>
    <div className={css.toolbar}>
      <h2>{t(comparing ? 'compare.title' : 'history.title')}</h2>
      {comparing
        ? <span ref={backButton}><Button size="sm" onClick={() => { setComparing(false) }}>{t('compare.back')}</Button></span>
        : onRefresh && <Button size="sm" disabled={loading} onClick={onRefresh}>{t('history.refresh')}</Button>}
    </div>
    {error && <div className={css.error} role="alert">{error}</div>}
    {comparing && left && right ? <>
      <p className={css.hint}>{t('compare.snapshotHint')}</p>
      <div className={css.comparison}>
        {[left, right].map((run, index) => <section key={run.id} className={css.comparisonSide} aria-label={t('compare.run', { side: t(index === 0 ? 'compare.left' : 'compare.right') })}>
          <div className={css.sideHeader}>
            <h3>{t('compare.run', { side: t(index === 0 ? 'compare.left' : 'compare.right') })}</h3>
            <Button size="sm" onClick={() => { onOpenRun(run.id) }}>{t('history.open')}</Button>
          </div>
          <RunMeta run={run} t={t} />
          <SnapshotText title={t('compare.systemPrompt')} text={run.document.definition.systemPrompt} empty={t('compare.noPrompt')} />
          <SnapshotText title={t('compare.lastUser')} text={run.input} />
          <SnapshotText title={t('compare.result')} text={props.results[run.id]} empty={t(props.resultsLoading ? 'compare.loadingResult' : 'compare.noResult')} />
          {run.error && <ErrorDetails error={run.error} t={t} />}
        </section>)}
      </div>
      <EvaluationForm key={`${left.id}/${right.id}/${evaluation?.id ?? 'new'}`} left={left} right={right} evaluation={evaluation} evaluations={evaluations} onSave={props.onSaveEvaluation} t={t} />
    </> : <>
      <p className={css.hint}>{t('history.selectHint')}</p>
      <div className={css.selectionBar}>
        <span className={css.hint}>{t('history.selected', { count: selected.length })}</span>
        <Button size="sm" disabled={selected.length === 0} onClick={() => { onSelectRuns([]) }}>{t('history.clear')}</Button>
        <span ref={compareButton}>
          <Button size="sm" variant="primary" disabled={selected.length !== 2} onClick={compareSelected}>{t('history.compare')}</Button>
        </span>
      </div>
      {loading && <p className={css.hint} role="status">{t('history.loading')}</p>}
      {!loading && orderedRuns.length === 0 && <div className={css.empty}>
        <h3>{t('history.empty')}</h3><p>{t('history.emptyHint')}</p>
      </div>}
      <ul className={css.runList}>
        {orderedRuns.map(run => <li key={run.id} className={css.runRow} data-selected={selectedRunIds.includes(run.id)}>
          <input type="checkbox" className={css.checkbox} checked={terminal.has(run.status) && selectedRunIds.includes(run.id)} disabled={!terminal.has(run.status) || (selected.length >= 2 && !selectedRunIds.includes(run.id))} aria-label={t('history.selectRun', { input: run.input })} onChange={(event) => { setOpenedEvaluationId(undefined); onSelectRun(run.id, event.currentTarget.checked) }} />
          <div className={css.runContent}>
            <button className={css.runTitle} onClick={() => { onOpenRun(run.id) }}>{run.input}</button>
            <RunMeta run={run} t={t} />
            {run.error && <ErrorDetails error={run.error} t={t} />}
          </div>
          <Button className={css.openRun} size="sm" onClick={() => { onOpenRun(run.id) }}>{t('history.open')}</Button>
        </li>)}
      </ul>
      <section className={css.savedSection} aria-label={t('history.savedTitle')}>
        <h3>{t('history.savedTitle')}</h3>
        {orderedEvaluations.length === 0 && <p className={css.hint}>{t('history.savedEmpty')}</p>}
        <ul className={css.savedList}>
          {orderedEvaluations.map((item) => {
            const a = runs.find(run => run.id === item.leftRunId)
            const b = runs.find(run => run.id === item.rightRunId)
            return <li key={item.id}>
              <button className={css.savedRow} disabled={!a || !b} aria-label={t('history.openEvaluation', { left: a?.input ?? t('history.missingRun'), right: b?.input ?? t('history.missingRun') })} onClick={() => {
                setOpenedEvaluationId(item.id)
                onSelectRuns([item.leftRunId, item.rightRunId])
                setComparing(true)
              }}>
                <span className={css.savedVerdict}>{t(`evaluation.${item.verdict}`)}</span>
                <span className={css.savedSummary}>{item.note || item.rubric?.name || `${a?.input ?? t('history.missingRun')} / ${b?.input ?? t('history.missingRun')}`}</span>
                <time className={css.savedTime} dateTime={item.updatedAt}>{timeLabel(item.updatedAt)}</time>
              </button>
            </li>
          })}
        </ul>
      </section>
    </>}
  </section>
}

function SnapshotText({ title, text, empty }: { title: string; text: string | undefined; empty?: string }) {
  return <div className={css.snapshot}>
    <h4>{title}</h4>
    {text ? <pre tabIndex={0}>{text}</pre> : <p className={css.hint}>{empty}</p>}
  </div>
}

function EvaluationForm({ left, right, evaluation, evaluations, onSave, t }: {
  left: StudioRun
  right: StudioRun
  evaluation: StudioEvaluation | undefined
  evaluations: readonly StudioEvaluation[]
  onSave: HistoryPaneProps['onSaveEvaluation']
  t: T
}) {
  const formId = useId()
  const [verdict, setVerdict] = useState<StudioEvaluation['verdict'] | ''>(evaluation?.verdict ?? '')
  const [note, setNote] = useState(evaluation?.note ?? '')
  const [rubric, setRubric] = useState<DraftRubric | undefined>(() => evaluation?.rubric && copyRubric(evaluation.rubric))
  const [rubricSource, setRubricSource] = useState(evaluation?.rubric ? 'custom' : 'none')
  const [editingRubric, setEditingRubric] = useState(false)
  const [scores, setScores] = useState<DraftScores>(() => Object.fromEntries(
    evaluation?.scores?.map(score => [score.criterionId, { left: score.left, right: score.right }]) ?? [],
  ))
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<HistoryKey>()
  const [saveFailed, setSaveFailed] = useState(false)
  const [saved, setSaved] = useState<StudioEvaluation | undefined>(evaluation)
  const [isDirty, setIsDirty] = useState(false)
  const finished = terminal.has(left.status) && terminal.has(right.status)
  const rubricSnapshots = evaluations.flatMap(item => item.rubric ? [{ id: item.id, rubric: item.rubric }] : [])
  const savedRubrics = rubricSnapshots.filter((item, index) =>
    rubricSnapshots.findIndex(other => JSON.stringify(other.rubric) === JSON.stringify(item.rubric)) === index)
  const dirty = () => { setIsDirty(true); setValidation(undefined); setSaveFailed(false) }
  const changeRubric = (next: DraftRubric) => { setRubric(next); setRubricSource('custom'); dirty() }
  const changeCriterion = (index: number, patch: Partial<DraftRubric['criteria'][number]>) => {
    if (rubric) changeRubric({
      ...rubric,
      criteria: rubric.criteria.map((criterion, itemIndex) => itemIndex === index ? { ...criterion, ...patch } : criterion),
    })
  }
  const moveCriterion = (index: number, offset: -1 | 1) => {
    if (!rubric) return
    const criteria = [...rubric.criteria]
    const [criterion] = criteria.splice(index, 1)
    if (!criterion) return
    criteria.splice(index + offset, 0, criterion)
    changeRubric({ ...rubric, criteria })
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !finished) return
    if (!verdict) { setValidation('evaluation.verdictRequired'); return }
    if (rubric && (
      !rubric.name.trim() || rubric.criteria.length < 2 || rubric.criteria.length > 6
      || rubric.criteria.some(criterion => !criterion.name.trim())
      || new Set(rubric.criteria.map(criterion => criterion.name.trim())).size !== rubric.criteria.length
    )) {
      setValidation('rubric.required'); return
    }
    const rubricScores = rubric?.criteria.flatMap((criterion) => {
      const score = scores[criterion.id]
      return score?.left && score.right ? [{ criterionId: criterion.id, left: score.left, right: score.right }] : []
    }) ?? []
    if (rubric && rubricScores.length !== rubric.criteria.length) {
      setValidation('evaluation.scoresRequired'); return
    }
    const id = saved?.id ?? evaluation?.id
    const request: StudioEvaluationRequest = {
      ...(id ? { id } : {}),
      leftRunId: left.id, rightRunId: right.id, verdict, note,
      ...(rubric ? {
        rubric: { name: rubric.name.trim(), criteria: rubric.criteria.map(criterion => ({ ...criterion, name: criterion.name.trim() })) },
        scores: rubricScores,
      } : {}),
    }
    setSaving(true)
    setSaveFailed(false)
    setValidation(undefined)
    try { setSaved(await onSave(request)); setIsDirty(false) }
    catch { setSaveFailed(true) } // Persistence failure leaves the user's entire draft editable for retry.
    finally { setSaving(false) }
  }

  return <form className={css.evaluation} onSubmit={(event) => { void submit(event) }} aria-label={t('evaluation.title')}>
    <h3>{t('evaluation.title')}</h3>
    <p className={css.hint}>{t('evaluation.hint')}</p>
    <fieldset className={css.formFields} disabled={saving}>
      <div className={css.field}>
        <label htmlFor={`${formId}-rubric`}>{t('rubric.label')}</label>
        <div className={css.rubricPicker}>
          <select id={`${formId}-rubric`} className={css.select} value={rubricSource} onChange={(event) => {
            const value = event.currentTarget.value
            dirty()
            setScores({})
            setRubricSource(value === 'create' ? 'custom' : value)
            if (value === 'none') { setRubric(undefined); setEditingRubric(false) }
            else if (value === 'create') { setRubric({ name: '', criteria: [emptyCriterion(), emptyCriterion()] }); setEditingRubric(true) }
            else {
              const source = evaluations.find(item => item.id === value)?.rubric
              if (source) { setRubric(copyRubric(source)); setEditingRubric(false) }
            }
          }}>
            <option value="none">{t('rubric.none')}</option>
            <option value="create">{t('rubric.create')}</option>
            {rubricSource === 'custom' && <option value="custom">{rubric?.name || t('rubric.custom')}</option>}
            {savedRubrics.map(item => <option key={item.id} value={item.id}>{t('rubric.saved', { name: item.rubric.name })}</option>)}
          </select>
          {rubric && <Button size="sm" aria-expanded={editingRubric} onClick={() => { setEditingRubric(!editingRubric) }}>{t(editingRubric ? 'rubric.collapse' : 'rubric.edit')}</Button>}
        </div>
      </div>
      {rubric && editingRubric && <div className={css.rubricEditor}>
        <div className={css.field}>
          <label htmlFor={`${formId}-name`}>{t('rubric.name')}</label>
          <Input id={`${formId}-name`} maxLength={80} placeholder={t('rubric.namePlaceholder')} value={rubric.name} onChange={(event) => { changeRubric({ ...rubric, name: event.currentTarget.value }) }} />
        </div>
        <div className={css.criteriaHeading}><h4>{t('rubric.criteria')}</h4><p className={css.hint}>{t('rubric.criteriaHint')}</p></div>
        {rubric.criteria.map((criterion, index) => <div className={css.criterionEditor} key={criterion.id}>
          <div className={css.field}>
            <label htmlFor={`${formId}-${criterion.id}-name`}>{t('rubric.criterionName', { number: index + 1 })}</label>
            <Input id={`${formId}-${criterion.id}-name`} maxLength={80} value={criterion.name} onChange={(event) => { changeCriterion(index, { name: event.currentTarget.value }) }} />
          </div>
          <div className={css.field}>
            <label htmlFor={`${formId}-${criterion.id}-description`}>{t('rubric.criterionDescription', { number: index + 1 })}</label>
            <textarea id={`${formId}-${criterion.id}-description`} className={css.textarea} rows={2} maxLength={240} placeholder={t('rubric.descriptionPlaceholder')} value={criterion.description} onChange={(event) => { changeCriterion(index, { description: event.currentTarget.value }) }} />
          </div>
          <div className={css.criterionActions}>
            <Button size="sm" disabled={index === 0} onClick={() => { moveCriterion(index, -1) }}>{t('rubric.moveUp', { number: index + 1 })}</Button>
            <Button size="sm" disabled={index === rubric.criteria.length - 1} onClick={() => { moveCriterion(index, 1) }}>{t('rubric.moveDown', { number: index + 1 })}</Button>
            <Button size="sm" disabled={rubric.criteria.length <= 2} onClick={() => { changeRubric({ ...rubric, criteria: rubric.criteria.filter(item => item.id !== criterion.id) }) }}>{t('rubric.remove', { number: index + 1 })}</Button>
          </div>
        </div>)}
        <Button size="sm" variant="outline" disabled={rubric.criteria.length >= 6} onClick={() => { changeRubric({ ...rubric, criteria: [...rubric.criteria, emptyCriterion()] }) }}>{t('rubric.add')}</Button>
      </div>}
      {rubric && <div className={css.scoring}>
        <p className={css.hint}>{t('score.range')}</p>
        {rubric.criteria.map((criterion, index) => <div className={css.criterionScore} key={criterion.id}>
          <div className={css.scoreDescription}><h4>{criterion.name || t('rubric.criterionFallback', { number: index + 1 })}</h4>{criterion.description && <p className={css.hint}>{criterion.description}</p>}</div>
          <div className={css.scoreColumns}>{(['left', 'right'] as const).map(side => <fieldset className={css.scoreGroup} key={side} aria-label={t('score.group', { side: t(`compare.${side}`), criterion: criterion.name || t('rubric.criterionFallback', { number: index + 1 }) })}>
            <legend>{t(`compare.${side}`)}</legend>
            <div className={css.scoreOptions}>{scoreValues.map(value => <label className={css.scoreOption} key={value}>
              <input type="radio" name={`${formId}-${criterion.id}-${side}`} value={value} checked={scores[criterion.id]?.[side] === value} aria-label={t('score.label', { side: t(`compare.${side}`), criterion: criterion.name || t('rubric.criterionFallback', { number: index + 1 }), score: value })} onChange={() => { setScores(current => ({ ...current, [criterion.id]: { ...current[criterion.id], [side]: value } })); dirty() }} />
              <span>{value}</span>
            </label>)}</div>
          </fieldset>)}</div>
        </div>)}
      </div>}
      <fieldset className={css.verdictGroup}>
        <legend>{t('evaluation.verdict')}</legend>
        <div className={css.verdictOptions}>{verdicts.map(value => <label className={css.verdictOption} key={value}>
          <input type="radio" name={`${formId}-verdict`} value={value} checked={verdict === value} onChange={() => { setVerdict(value); dirty() }} />
          <span>{t(`evaluation.${value}`)}</span>
        </label>)}</div>
      </fieldset>
      <div className={css.field}>
        <label htmlFor={`${formId}-note`}>{t('evaluation.note')}</label>
        <textarea id={`${formId}-note`} className={css.textarea} rows={3} maxLength={10000} placeholder={t('evaluation.notePlaceholder')} value={note} onChange={(event) => { setNote(event.currentTarget.value); dirty() }} />
      </div>
      {validation && <p className={css.error} role="alert">{t(validation)}</p>}
      {saveFailed && <p className={css.error} role="alert">{t('evaluation.saveError')}</p>}
      {!finished && <p className={css.hint}>{t('evaluation.waitForFinish')}</p>}
      <div className={css.saveBar}>
        {saved && !isDirty && <span className={css.hint} role="status">{t('evaluation.saved', { time: timeLabel(saved.updatedAt) })}</span>}
        <Button size="sm" variant="primary" type="submit" disabled={saving || !finished}>{t(saving ? 'evaluation.saving' : 'evaluation.save')}</Button>
      </div>
    </fieldset>
  </form>
}
