/** The official rc.2 conversation rail, adapted to an editable half-width pane.
 * No conversation slot with this name is publicly exported in that release.
 * Appearance follows ui-chat/TurnNavigator; attribution is in THIRD_PARTY_NOTICES.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { TrialPaneProps } from './TrialPane.tsx'
import css from './TrialNavigator.module.css'

export interface TrialNavigationItem {
  turn: number
  label: string
  text: string
  messageId: string
}
export function TrialNavigator({ items, activeTurn, onNavigate, t }: {
  items: readonly TrialNavigationItem[]
  activeTurn: number | null
  onNavigate: (item: TrialNavigationItem) => void
  t: TrialPaneProps['t']
}) {
  const [preview, setPreview] = useState<{ turn: number; center: number } | null>(null)
  const frame = useRef<HTMLElement>(null), scroller = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  const id = useId()
  const reveal = (button: HTMLButtonElement, turn: number) => {
    const bounds = frame.current?.getBoundingClientRect()
    if (bounds) setPreview({ turn, center: button.getBoundingClientRect().top + button.offsetHeight / 2 - bounds.top })
  }
  useEffect(() => {
    const el = scroller.current
    const mark = el?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!el || !mark || pointerInside.current) return
    if (mark.offsetTop < el.scrollTop || mark.offsetTop + mark.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = mark.offsetTop - el.clientHeight / 2
    }
  }, [activeTurn, items.length])
  if (items.length < 2) return null
  const current = items.find(item => item.turn === preview?.turn)
  return <div className={css.slot}>
    <nav className={css.frame} ref={frame} aria-label={t('messageNavigation')}
      onPointerEnter={() => { pointerInside.current = true }}
      onPointerLeave={() => { pointerInside.current = false; setPreview(null) }}
      onKeyDown={event => { if (event.key === 'Escape') setPreview(null) }}>
      <div className={css.scroller} ref={scroller} onScroll={() => setPreview(null)}>
        <div className={css.marks}>
          {items.map(item => <button key={item.messageId} type="button"
            className={css.mark} aria-label={t('jumpMessage', { number: item.turn })}
            aria-current={item.turn === activeTurn ? 'true' : undefined}
            aria-describedby={item.turn === current?.turn ? id : undefined}
            data-preview={item.turn === current?.turn || undefined}
            onPointerMove={event => reveal(event.currentTarget, item.turn)}
            onFocus={event => reveal(event.currentTarget, item.turn)}
            onBlur={() => setPreview(null)}
            onClick={() => onNavigate(item)} />)}
        </div>
      </div>
      {current && <div id={id} role="tooltip" className={css.preview}
        style={{ '--turn-preview-center': `${preview!.center}px` } as CSSProperties}>
        <div className={css.previewPrompt}>{current.label}</div>
        {current.text && <div className={css.previewResponse}>{current.text}</div>}
      </div>}
    </nav>
  </div>
}
