/** Inline authoring extends the existing prompt editor without covering the trial document. */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Button, DiffBlock, Pill, IconSparkle16, IconLoadingOutline16, IconCloseOutline16 } from './primitives.tsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditorSnapshot } from './controller.ts'
import type { PromptController } from './prompt-controller.ts'
import type {} from './prompt.locale.ts'
import css from './PromptWriter.module.css'
import workbench from './AgentStudio.module.css'

/** Existing editor labels stay with its locale; authoring owns only its added controls. */
export interface PromptWriterProps extends PropsLocale<'agentStudioPrompt'> {
  writer: PromptController
  editor: EditorSnapshot
  label: string
  hint?: string
  placeholder: string
  onChange: (value: string) => void
}
/** Render original text plus a separate reviewable candidate. */
export function PromptWriter({ writer, editor, label, hint, placeholder, onChange, t }: PromptWriterProps) {
  const state = useSyncExternalStore(writer.subscribe, writer.getSnapshot), id = useId()
  const [compare, setCompare] = useState(false), [reviewed, setReviewed] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null), trigger = useRef<HTMLSpanElement>(null)
  const prompt = editor.draft?.systemPrompt ?? '', readOnly = editor.document?.readOnly === true
  const running = state.status === 'running', conflict = !!state.candidate && state.base !== prompt
  const changed = writer.capabilitiesChanged()
  useEffect(() => { if (state.open) input.current?.focus() }, [state.open])
  useEffect(() => { setReviewed(null); if (conflict) setCompare(true) }, [state.candidate, prompt, conflict])
  const close = () => { writer.change({ open: false }); trigger.current?.querySelector('button')?.focus() }
  const hasModel = editor.draft?.modelSelection === 'global' ? !!editor.models?.default.model : !!editor.draft?.model
  const modelLabel = hasModel ? t('follow') : t('choose')
  const currentModel = editor.draft?.modelSelection === 'global' ? editor.models?.default : editor.draft
  const modelGroup = editor.models?.groups.find(group => group.id === currentModel?.provider)
  const followName = modelGroup?.models.find(model => model.id === currentModel?.model)?.name ?? currentModel?.model
  return <div className={workbench.prompt}>
    <div className={css.heading}><label htmlFor={`${id}-original`}>{label}</label>
      {!readOnly && <span ref={trigger}><Button size="sm" shape="rounded" variant="ghost" icon={<IconSparkle16 />} aria-expanded={state.open} aria-controls={`${id}-panel`} onClick={() => { writer.change({ open: !state.open }) }}>{t('open')}</Button></span>}
    </div>
    {state.open && !readOnly && <section className={css.panel} id={`${id}-panel`} aria-label={t('title')} aria-busy={running}>
      <div className={css.panelHeading}><p>{t('hint')}</p><Button size="sm" shape="rounded" icon={<IconCloseOutline16 />} aria-label={t('close')} title={t('close')} onClick={close} /></div>
      <div className={css.model}><label htmlFor={`${id}-model`}>{t('model')}</label>
        <select className={workbench.select} id={`${id}-model`} value={state.model} disabled={running} onChange={(event) => { writer.change({ model: event.currentTarget.value }) }}>
          <option value="">{modelLabel}{hasModel && followName ? ` · ${followName}` : ''}</option>
          {editor.models?.groups.map(group => <optgroup key={group.id} label={group.name}>
            {group.models.map(model => <option key={model.id} value={JSON.stringify({ provider: group.id, model: model.id })}>
              {model.name}</option>)}
          </optgroup>)}
        </select>
      </div>
      <label className={css.label} htmlFor={`${id}-instruction`}>{t('instruction')}</label>
      <textarea ref={input} id={`${id}-instruction`} className={css.instruction} disabled={running} value={state.instruction}
        placeholder={t(state.candidate ? 'refinePlaceholder' : 'placeholder')} maxLength={20000}
        onChange={(event) => { writer.change({ instruction: event.currentTarget.value }) }}
        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void writer.start() } }} />
      <div className={css.actions}><p className={css.hint}>{t('capabilityHint', { tools: editor.draft?.tools.length ?? 0, skills: editor.draft?.skills.length ?? 0 })}</p>
        {running ? <Button size="sm" shape="rounded" variant="outline" onClick={writer.stop}>{t('stop')}</Button> : <Button size="sm" shape="rounded" variant={state.candidate ? 'outline' : 'primary'} disabled={!state.instruction.trim()} onClick={() => { void writer.start() }}>{t(state.candidate && !changed ? 'refine' : 'generate')}</Button>}
      </div>
      {state.error && <div className={css.notice} role="alert"><p>{t(state.error === 'model-required' ? 'modelRequired' : 'failed')}</p>{state.error !== 'model-required' && <details><summary>{t('details')}</summary><pre>{state.error}</pre></details>}</div>}
      {state.status === 'cancelled' && <p className={css.hint} role="status">{t('stopped')}</p>}
      {(running || state.candidate) && <div className={css.result}>
        <div className={css.resultHeading}>{running ? <span className={css.progress} role="status"><IconLoadingOutline16 />{t('generating')}</span> : <nav aria-label={t('candidate')}><Pill active={!compare} onClick={() => { setCompare(false) }}>{t('candidate')}</Pill><Pill active={compare} onClick={() => { setCompare(true) }}>{t('compare')}</Pill></nav>}</div>
        {!running && compare ? <DiffBlock diffs={[{ path: label, oldText: prompt || null, newText: state.candidate }]} labels={{ copy: t('copy'), copied: t('copied'), collapseAria: t('collapse'), collapse: t('collapse'), expandAria: count => t('expand', { count }), expand: count => t('expand', { count }), files: count => t('files', { count }) }} maxLines={20} />
          : <pre className={css.candidate} tabIndex={0} aria-label={t('candidate')}>{running ? state.preview || t('pending') : state.candidate}</pre>}
        {!running && changed && <p className={css.notice} role="status">{t('capabilitiesChanged')}</p>}
        {!running && conflict && !changed && <div className={css.notice}><p>{t('conflict')}</p><label className={css.confirm}><input type="checkbox" checked={reviewed === prompt} onChange={(event) => { setReviewed(event.currentTarget.checked ? prompt : null) }} />{t('reviewed')}</label></div>}
        {!running && <div className={css.footer}><Button size="sm" shape="rounded" variant="ghost" onClick={() => { writer.discard(); trigger.current?.querySelector('button')?.focus() }}>{t('discard')}</Button><Button size="sm" shape="rounded" variant="primary" disabled={changed || conflict && reviewed !== prompt} onClick={() => { if (writer.apply(prompt)) trigger.current?.querySelector('button')?.focus() }}>{t('apply')}</Button></div>}
      </div>}
    </section>}
    {state.applied === prompt && state.previous !== null && <div className={css.applied}><span role="status">{t('applied')}</span><Button size="sm" shape="rounded" onClick={writer.restore}>{t('restore')}</Button></div>}
    {state.open && !readOnly && <span className={css.label}>{t('original')}</span>}
    <textarea readOnly={readOnly} id={`${id}-original`} spellCheck={false} placeholder={placeholder} value={prompt} onChange={(event) => { onChange(event.currentTarget.value) }} />
    {hint && <p className={workbench.hint}>{hint}</p>}
  </div>
}
