import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './ui.css'

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block, className = '', ...rest }, ref,
) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className,
  ].filter(Boolean).join(' ')
  return <button ref={ref} type="button" className={cls} {...rest} />
})

type ChipTone = 'neutral' | 'measured' | 'solid' | 'advisory' | 'inferred' | 'critical'

export function Chip({
  tone = 'neutral', children, title, onClick, on, className = '',
}: {
  tone?: ChipTone
  children: ReactNode
  title?: string
  onClick?: () => void
  on?: boolean
  className?: string
}) {
  const cls = [
    'chip', `chip--${tone}`, onClick ? 'chip--btn' : '', on ? 'chip--on' : '', className,
  ].filter(Boolean).join(' ')
  if (onClick) {
    return <button type="button" className={cls} title={title} onClick={onClick}>{children}</button>
  }
  return <span className={cls} title={title}>{children}</span>
}

export function Segmented<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string; disabled?: boolean; title?: string }>
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          title={o.title}
          aria-selected={o.value === value}
          disabled={o.disabled}
          className={`seg__item${o.value === value ? ' seg__item--on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ToggleRow({
  on, label, count, disabled, onToggle, colour, title, action,
}: {
  on: boolean
  label: string
  count?: ReactNode
  disabled?: boolean
  onToggle: () => void
  colour?: string
  title?: string
  action?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        className={`toggle${on ? ' toggle--on' : ''}`}
        disabled={disabled}
        onClick={onToggle}
        title={title}
        aria-pressed={on}
      >
        <span
          className={`toggle__box${on ? ' toggle__box--on' : ''}`}
          style={colour ? { color: colour } : undefined}
        />
        <span>{label}</span>
        {count !== undefined && <span className="toggle__count">{count}</span>}
      </button>
      {action}
    </div>
  )
}

/** Stacked distribution bar — three numbers read worse than one shape. */
export function StackedBar({
  segments, height = 4,
}: {
  segments: Array<{ value: number; colour: string; title?: string }>
  height?: number
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div className="meter" style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={i}
          className="meter__seg"
          title={s.title}
          style={{ width: `${(s.value / total) * 100}%`, background: s.colour }}
        />
      ))}
    </div>
  )
}

export function MicroBar({
  value, colour = 'var(--measured)', width = 28, height = 3, title,
}: {
  value: number
  colour?: string
  width?: number
  height?: number
  title?: string
}) {
  return (
    <span className="microbar" title={title} style={{ width, height, display: 'inline-block' }}>
      <span
        className="microbar__fill"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: colour }}
      />
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className="kv__v">{v}</span>
    </div>
  )
}

export function Notice({
  tone = 'neutral', title, children,
}: {
  tone?: 'neutral' | 'advisory' | 'inferred' | 'measured'
  title?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={`notice${tone !== 'neutral' ? ` notice--${tone}` : ''}`}>
      {title && <div className="notice__title">{title}</div>}
      {children}
    </div>
  )
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div className="eyebrow" style={style}>{children}</div>
}
