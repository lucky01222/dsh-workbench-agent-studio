/** A continuous editable message document following LLM Space's playground structure. */
import { useLayoutEffect, useRef, useState } from 'react'
import type { StudioRunSettings, StudioRunState } from '@deepseek-ai/dsh-api-agent-studio-controller/types'
const randomUUID = () => crypto.randomUUID()
import { Button, Modal, MarkdownText, IconPlayOutline16, IconStopFill16, IconPlusOutline16, IconUserOutline16, IconAgentPresetOutline16, IconTrashOutline16, IconChevronDownOutline14, IconInspectOutline12 } from './primitives.tsx'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { StudioInjected } from './contracts.ts'
import type { PlaygroundMessage } from './playground.ts'
import type {} from './trial-locales.ts'
import css from './TrialPane.module.css'
import { TrialNavigator } from './TrialNavigator.tsx'

/** Draft and native execution callbacks; data ownership stays in the controller. */
export interface TrialPaneOwnerProps {
  readonly runState?: StudioRunState | undefined
  readonly traceRunState?: StudioRunState | undefined
  readonly loadImage?: StudioInjected['loadImage']
  readonly conversationReady?: boolean
  readonly pendingApproval?: boolean
  readonly settings: StudioRunSettings
  readonly input: string
  readonly inputMessages?: readonly string[] | undefined
  readonly onMessagesChange?: (messages: readonly string[]) => void
  readonly messages?: readonly PlaygroundMessage[]
  readonly onChangeMessages?: (messages: readonly PlaygroundMessage[]) => void
  readonly busy: boolean
  readonly error?: string | undefined
  readonly canRun: boolean
  readonly toolsRunning?: boolean
  readonly showRunAction?: boolean
  readonly onInputChange: (input: string) => void
  readonly onSettingsChange: (settings: StudioRunSettings) => void
  readonly onRun: (id?: string) => void
  readonly onStop: () => void
  readonly onContinue: (messageId: string) => void
  readonly executingToolIds?: readonly string[]
  readonly onExecuteTools: (messageId: string, callIds: readonly string[]) => void
  readonly onShowHistory: () => void
  readonly onClear: () => void
  readonly onRetryConversation?: () => void
}
/** Locale and authorized shared conversation/navigation outlets. */
export type TrialPaneProps = TrialPaneOwnerProps & PropsRenderSlots<'conversation' | 'conversation.playground.images'> & PropsLocale<'agentStudioTrial'>

/** Native multiline editing preserves IME composition and browser selection while growing to the viewport. */
function TextEditor({ value, label, placeholder, readOnly, onChange, onRun }: {
  value: string
  label: string
  placeholder?: string
  readOnly: boolean
  onChange: (value: string) => void
  onRun?: () => void
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const resize = () => {
      const top = el.scrollTop
      el.style.height = '0px'
      el.style.height = `${Math.max(38, Math.min(el.scrollHeight, window.innerHeight * .5))}px`
      el.scrollTop = top
    }
    resize()
    let width = el.clientWidth
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      if (width !== el.clientWidth) { width = el.clientWidth; resize() }
    })
    observer?.observe(el)
    window.addEventListener('resize', resize)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize) }
  }, [value])
  return <textarea ref={area} aria-label={label} spellCheck={false} value={value} readOnly={readOnly} placeholder={placeholder}
    onChange={(event) => { onChange(event.target.value) }} onKeyDown={(event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && !readOnly && onRun) { event.preventDefault(); onRun() }
    }} />
}

/** Global run action changes to Stop while the native trial is active. */
export function TrialRunAction({ runState, busy, canRun, toolsRunning, onRun, onStop, t, hidden = false }: Pick<TrialPaneProps, 'runState' | 'input' | 'busy' | 'canRun' | 'toolsRunning' | 'onRun' | 't'> & { readonly hidden?: boolean; readonly onStop?: () => void }) {
  const active = toolsRunning || runState !== undefined && ['preparing', 'running'].includes(runState.run.status)
  return hidden ? null : <Button className={css.runButton} size="sm" variant="primary" icon={active ? <IconStopFill16 /> : <IconPlayOutline16 />} disabled={busy || (!active && !canRun)} onClick={() => { if (active) onStop?.(); else onRun() }}>{t(active ? 'stop' : 'run')}</Button>
}

function MessageCard({ message, index, count, locked, canRun, onChange, onInsert, onRemove,
  onMove, onRun, onContinue, executingToolIds, onExecuteTools, renderSlot, SessionProvider, loadImage, imageSessionId, t }: {
    message: PlaygroundMessage
    index: number
    count: number
    locked: boolean
    canRun: boolean
    onChange: (message: PlaygroundMessage) => void
    onInsert: () => void
    onRemove: () => void
    onMove: (from: number, to: number) => void
    onRun: () => void
    onContinue: () => void
    executingToolIds: readonly string[]
    onExecuteTools: TrialPaneOwnerProps['onExecuteTools']
    renderSlot: TrialPaneProps['renderSlot']
    imageSessionId?: string | undefined
    SessionProvider: TrialPaneProps['SessionProvider']
    loadImage: StudioInjected['loadImage'] | undefined
  } & PropsLocale<'agentStudioTrial'>) {
  const [collapsed, setCollapsed] = useState(false), [preview, setPreview] = useState(false)
  const images = (content: PlaygroundMessage['content']) => {
    const origin = message.origin
    if (!origin || !loadImage || !content?.some(block => block.type === 'image')) return null
    return <SessionProvider {...imageSessionId ? { sessionId: imageSessionId } : {}}>{renderSlot('conversation.playground.images', {
      images: content.flatMap(block => block.type === 'image' ? [{ attachment: block.attachment }] : []),
      loadImage: attachment => loadImage(origin.runId, attachment), align: 'start', compact: true,
    })}</SessionProvider>
  }
  const role = t(message.role === 'user' ? 'userRole' : 'assistantRole')
  return <article className={css.messageCard} data-playground-message={message.id}
    data-collapsed={collapsed || undefined} data-role={message.role} data-streaming={message.streaming || undefined}
    onDragOver={(event) => { if (!locked) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('application/x-studio-message') || '-1'); if (Number.isInteger(from) && from >= 0 && from < count) onMove(from, index) }}>
    <div className={css.insertLine}><button type="button" title={t('insertMessage')} aria-label={t('insertMessage')} disabled={locked} onClick={onInsert}><IconPlusOutline16 /></button></div>
    <header className={css.messageHeader}>
      <Button className={css.roleBadge} size="sm" variant="outline" disabled={locked} title={t('toggleRole')} aria-label={t('toggleRole')} onClick={() => { onChange({ id: message.id, role: message.role === 'user' ? 'assistant' : 'user', text: message.text, ...(message.content ? { content: message.content.filter(block => block.type === 'image' || block.type === 'file') } : {}) }) }} icon={message.role === 'user' ? <IconUserOutline16 /> : <IconAgentPresetOutline16 />}>{role}</Button>
      {message.durationMs !== undefined && <span className={css.messageStats}>{t('duration', { seconds: (message.durationMs / 1000).toFixed(1) })}</span>}
      <button type="button" className={css.collapseArea} aria-label={t(collapsed ? 'expandMessage' : 'collapseMessage')} onClick={() => { setCollapsed(!collapsed) }}>{collapsed ? message.text || message.tools?.map(tool => tool.name).join(', ') : ''}</button>
      <button type="button" className={css.dragHandle} draggable={!locked} disabled={locked} title={t('reorderHint')} aria-label={t('reorderHint')}
        onDragStart={(event) => { event.dataTransfer.setData('application/x-studio-message', String(index)); event.dataTransfer.effectAllowed = 'move' }}
        onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onMove(index, Math.max(0, Math.min(count - 1, index + (event.key === 'ArrowUp' ? -1 : 1)))) } }}><span /></button>
      <div className={css.messageActions}>
        <Button size="sm" title={t('previewMessage')} aria-label={t('previewMessage')} disabled={!message.text} onClick={() => { setPreview(true) }} icon={<IconInspectOutline12 />} />
        {(message.role === 'user' || !!message.tools?.length) && <Button size="sm" title={t('runFromMessage')} aria-label={t('runFromMessage')} disabled={locked || !canRun || executingToolIds.length > 0} onClick={onRun} icon={<IconPlayOutline16 />} />}
        <Button size="sm" title={t('removeMessage')} aria-label={t('removeMessage')} disabled={locked} onClick={onRemove} icon={<IconTrashOutline16 />} />
        <Button size="sm" title={t(collapsed ? 'expandMessage' : 'collapseMessage')} aria-label={t(collapsed ? 'expandMessage' : 'collapseMessage')} aria-expanded={!collapsed} onClick={() => { setCollapsed(!collapsed) }} icon={<IconChevronDownOutline14 />} />
      </div>
    </header>
    {!collapsed && <div className={css.messageBody}>
      {message.thinking && <details className={css.thinking}><summary>{t('thinking')}</summary><TextEditor value={message.thinking} label={t('thinking')} readOnly={locked} onChange={(thinking) => { onChange({ ...message, thinking }) }} /></details>}
      <TextEditor label={index === 0 ? t('input') : t('numberedInput', { number: index + 1 })} value={message.text} readOnly={locked}
        placeholder={t(message.role === 'user' ? 'inputPlaceholder' : 'assistantPlaceholder')} onChange={(text) => { onChange({ ...message, text }) }}
        {...(canRun && !executingToolIds.length ? { onRun } : {})} />
      {images(message.content)}
      {message.streaming && !message.text && <span className={css.streaming} role="status">{t('running')}</span>}
      {message.tools?.map((tool) => {
        const executing = executingToolIds.includes(tool.id)
        const patch = (change: Partial<typeof tool>) => { onChange({ ...message,
          tools: (message.tools ?? []).map(item => item.id === tool.id ? { ...item, ...change } : item),
        }) }
        return <section className={css.toolTrace} key={tool.id} aria-label={tool.name} data-tool-state={executing ? 'running' : tool.result === undefined ? 'pending' : tool.error ? 'failed' : 'completed'}>
          <div className={css.toolRow}><code>{tool.name}</code><span role="status">{t(executing ? 'running' : tool.result === undefined ? 'pendingTool' : tool.error ? 'failed' : 'succeeded')}</span>
            <Button size="sm" variant="outline" disabled={locked || executingToolIds.length > 0 || !message.origin} onClick={() => { onExecuteTools(message.id, [tool.id]) }}>{t(tool.result === undefined ? 'execute' : 'executeAgain')}</Button></div>
          <div className={css.toolSection}><span>{t('arguments')}</span><TextEditor label={`${tool.name} ${t('arguments')}`} value={tool.arguments} readOnly={locked || executing} onChange={argumentsValue => patch({ arguments: argumentsValue })}/></div>
          <div className={css.toolSection}><span>{t('toolResult')}</span><TextEditor label={`${tool.name} ${t('toolResult')}`} value={tool.result ?? ''}
            placeholder={t('resultPlaceholder')} readOnly={locked || executing} onChange={(result) => { patch({ result }) }}
            {...(canRun && !executingToolIds.length ? { onRun: onContinue } : {})} /></div>
          {images(tool.resultContent)}
          <label className={css.errorFlag}><input type="checkbox" checked={tool.error ?? false} disabled={locked || executing} onChange={(event) => { patch({ result: tool.result ?? '', error: event.target.checked }) }} />{t('resultIsError')}</label>
        </section> })}
      {!!message.tools?.length && <div className={css.toolActions}>
        <Button size="sm" variant="outline" disabled={locked || executingToolIds.length > 0 || !message.origin} onClick={() => { onExecuteTools(message.id, message.tools?.map(tool => tool.id) ?? []) }}>{t('executeAll')}</Button>
        <Button size="sm" variant="primary" icon={<IconPlayOutline16 />} disabled={locked || !canRun || executingToolIds.length > 0} onClick={onContinue}>{t('continue')}</Button>
      </div>}
    </div>}
    <Modal open={preview} title={t('previewMessage')} closeLabel={t('close')} onClose={() => { setPreview(false) }}><div className={css.previewText}><MarkdownText text={message.text} labels={{ code: { copyLabel: t('copyCode'), copiedLabel: t('copied') }, footnotes: t('footnotes') }} /></div></Modal>
  </article>
}

/**
 * Editable inputs and streamed outputs share one scroll container and one Add message action.
 * @param props - Trial document, execution state and native outlets.
 * @returns The continuous message editor.
 */
export function TrialPane(props: TrialPaneProps) {
  const { runState, busy, canRun, t, renderSlot } = props
  const run = runState?.run, trace = (props.traceRunState ?? runState)?.run
  const locked = busy || !!props.toolsRunning || !!run && ['preparing', 'running'].includes(run.status)
  const messages: readonly PlaygroundMessage[] = props.messages
    ?? (props.inputMessages ?? [props.input]).map((text, index) => ({ id: String(index), role: 'user' as const, text }))
  const focusMessage = useRef<string | null>(null)
  const followTail = useRef(true)
  const scroller = useRef<HTMLDivElement>(null), [activeTurn, setActiveTurn] = useState<number | null>(1)
  useLayoutEffect(() => {
    if (locked && followTail.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [messages, locked])
  useLayoutEffect(() => {
    if (!focusMessage.current) return
    const card = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-playground-message]') ?? [])].find(el => el.dataset.playgroundMessage === focusMessage.current)
    card?.querySelector('textarea')?.focus({ preventScroll: true }); card?.scrollIntoView({ block: 'nearest' }); focusMessage.current = null
  }, [messages])
  const change = (next: readonly PlaygroundMessage[]) => {
    if (props.onChangeMessages) props.onChangeMessages(next)
    else if (props.onMessagesChange) props.onMessagesChange(next.map(item => item.text))
    else props.onInputChange(next.map(item => item.text).join('\n\n'))
  }
  const insert = (index: number) => { const next = [...messages], id = randomUUID(); focusMessage.current = id; next.splice(index, 0, { id, role: 'user', text: '' }); change(next) }
  const move = (from: number, to: number) => {
    if (locked || props.executingToolIds?.length || from === to) return
    const next = [...messages]
    const [item] = next.splice(from, 1)
    if (item) { next.splice(to, 0, item); change(next) }
  }
  const rail = messages.map((message, index) => ({ turn: index + 1, messageId: message.id,
    label: `${t(message.role === 'user' ? 'userRole' : 'assistantRole')} · ${t('numberedInput', { number: index + 1 })}`,
    text: (message.text || message.tools?.map(tool => tool.name).join(', ') || '').slice(0, 300) }))
  const runError = props.error ?? run?.error
  return <section className={css.pane} aria-label={t('title')}>
    <TrialNavigator items={rail} activeTurn={Math.min(activeTurn ?? 1, messages.length)} t={t} onNavigate={item => {
      const el = scroller.current
      const card = [...(el?.querySelectorAll<HTMLElement>('[data-playground-message]') ?? [])].find(node => node.dataset.playgroundMessage === item.messageId)
      if (el && card) el.scrollTo({ top: el.scrollTop + card.getBoundingClientRect().top - el.getBoundingClientRect().top - 14, behavior: 'auto' })
      setActiveTurn(item.turn)
    }} />
    <div ref={scroller} className={css.messageEditor} data-playground-scroll="true" onScroll={() => { const el = scroller.current; if (!el) return; followTail.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; const top = el.getBoundingClientRect().top; const cards = [...el.querySelectorAll<HTMLElement>('[data-playground-message]')]; const index = cards.findIndex(card => card.getBoundingClientRect().bottom > top + 40); setActiveTurn(el.scrollHeight - el.scrollTop - el.clientHeight <= 1 ? messages.length : Math.max(1, index + 1)) }}>
      <div className={css.messageList}>
        {messages.map((message, index) => <MessageCard key={message.id} message={message} index={index} count={messages.length}
          renderSlot={renderSlot} SessionProvider={props.SessionProvider} loadImage={props.loadImage} imageSessionId={trace?.sessionId}
          locked={locked || !!message.tools?.some(tool => props.executingToolIds?.includes(tool.id))}
          canRun={canRun} t={t} executingToolIds={props.executingToolIds ?? []} onExecuteTools={props.onExecuteTools}
          onContinue={() => { props.onContinue(message.id) }}
          onChange={(next) => { change(messages.map(item => item.id === message.id ? next : item)) }}
          onInsert={() => { insert(index) }} onRemove={() => { change(messages.filter(item => item.id !== message.id)) }}
          onMove={move} onRun={() => { props.onRun(message.id) }} />)}
        <Button className={css.addMessage} icon={<IconPlusOutline16 />} disabled={locked || messages.length >= 128} onClick={() => { insert(messages.length) }}>{t('addMessage')}</Button>
        {locked && !messages.some(message => message.streaming) && <div className={css.runStatus} role="status">{t(run?.status ?? 'preparing')}</div>}
        {runError && <details className={css.error}><summary>{t('error')}</summary><pre>{runError}</pre></details>}
        {trace && <details className={css.nativeTrace} open={props.pendingApproval || undefined}><summary>{t('nativeTrace')}</summary><div data-trial-message-cards="true" className={css.transcript}>{props.conversationReady === false ? <Button size="sm" onClick={props.onRetryConversation}>{t('retryConversation')}</Button> : <props.SessionProvider sessionId={trace.sessionId}>{renderSlot('conversation', { presentation: 'embedded', ...(props.traceRunState || trace.outputEndSeq === undefined ? {} : { outputEndSeq: trace.outputEndSeq }) })}</props.SessionProvider>}</div></details>}
      </div>
    </div>
  </section>
}
