// Button: token-styled button atom. Variants map to the --dsw-alias-button-*
// fill families; no framework imports, all behavior via props.

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import css from './Button.module.css'

/** Visual variant, each backed by its --dsw-alias-button-* token family. */
export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

/**
 * Render a button.
 * @param props.variant - visual family (default 'ghost').
 * @param props.size - 'md' 36px capsule (figma Button) or 'sm' 28px compact.
 * @param props.icon - optional leading 16px icon node.
 * @param props.shape - capsule by default; rounded uses the shared compact command geometry.
 * @param props.tone - danger colors destructive actions without changing their emphasis.
 * @returns the button element; native button attributes pass through.
 */
export function Button({ variant = 'ghost', size = 'md', shape = 'capsule', tone, icon, className, children, ...rest }: {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  shape?: 'capsule' | 'rounded'
  tone?: 'danger'
  icon?: ReactNode
  className?: string | undefined
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={clsx(css.button, css[variant], css[size], shape === 'rounded' && css.rounded, tone === 'danger' && css.danger, className)} {...rest}>
      {icon != null && <span className={css.icon}>{icon}</span>}
      {children}
    </button>
  )
}
