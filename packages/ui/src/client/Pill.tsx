// Pill: small rounded label chip (view switcher tabs, filters, badges).

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { IconCloseOutline16 } from './icons.tsx'
import css from './Pill.module.css'

/**
 * Render a pill chip. Interactive when onClick is supplied (renders a button);
 * otherwise a static span.
 * @param props.active - selected/active visual state.
 * @param props.appearance - pill by default; tag is a neutral capability label.
 * @param props.removal - optional separate removal action with a localized accessible label.
 * @returns pill element.
 */
export function Pill({ active = false, appearance = 'pill', removal, className, children, onClick, ...rest }: {
  active?: boolean
  appearance?: 'pill' | 'tag'
  removal?: { onRemove: () => void; label: string; title?: string }
  // `| undefined` so a caller can forward an optional class straight through
  // under exactOptionalPropertyTypes (a CSS-module lookup is string|undefined).
  className?: string | undefined
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = clsx(css.pill, active && css.active, appearance === 'tag' && css.tag, className)
  if (removal) {
    return <span className={clsx(classes, css.removable)}>
      {onClick ? <button type="button" className={css.name} onClick={onClick} {...rest}>{children}</button> : <span className={css.name}>{children}</span>}
      <button type="button" className={css.remove} disabled={rest.disabled} aria-label={removal.label} title={removal.title ?? removal.label} onClick={removal.onRemove}>
        <IconCloseOutline16 size={12} />
      </button>
    </span>
  }
  if (!onClick) {
    return <span className={classes}>{children}</span>
  }
  return (
    <button
      type="button"
      className={clsx(classes, css.interactive)}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  )
}
