import clsx from 'clsx'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'

export const cx = clsx

/** Click-outside + Escape handler. */
export function useDismiss(active: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [active, onDismiss])
  return ref
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-line-strong bg-surface px-1 text-[10px] leading-none text-fg-dim">
      {children}
    </kbd>
  )
}

export function IconButton({
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-[4px] border px-2 text-[11px] transition-colors',
        'border-line bg-surface/60 text-fg-dim hover:border-line-strong hover:bg-panel-hi hover:text-fg',
        active && 'border-phosphor/40 !bg-phosphor/10 !text-phosphor',
        className,
      )}
    />
  )
}

export function Chip({
  accent,
  children,
  title,
  glyph,
  className,
  onClick,
}: {
  accent?: string
  children: ReactNode
  title?: string
  glyph?: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-[3px] border px-1.5 py-[2px] text-[10.5px] leading-none whitespace-nowrap',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        borderColor: accent ? hexA(accent, 0.32) : 'var(--color-line)',
        color: accent ?? 'var(--color-fg-dim)',
        background: accent ? hexA(accent, 0.08) : 'transparent',
      }}
    >
      {glyph}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-fg-faint">
        <span>{label}</span>
        {hint && <span className="text-fg-faint/70 normal-case tracking-normal">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputBase =
  'w-full rounded-[4px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-phosphor/45 focus:bg-panel'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, 'resize-none leading-relaxed', props.className)} />
}

export interface MenuItem {
  value: string
  label: string
  hint?: string
  accent?: string
  glyph?: ReactNode
}

/** A dark popover select. `value === null` shows placeholder. */
export function Menu({
  items,
  value,
  onChange,
  placeholder = 'select',
  trigger,
  align = 'left',
  width = 200,
  allowClear,
  searchable,
  placement = 'bottom',
  className,
}: {
  items: MenuItem[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  trigger?: (args: { open: boolean; selected: MenuItem | null }) => ReactNode
  align?: 'left' | 'right'
  width?: number
  allowClear?: boolean
  searchable?: boolean
  /** Which side of the trigger the popover opens toward. */
  placement?: 'bottom' | 'top'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const ref = useDismiss(open, () => setOpen(false))
  const selected = items.find((i) => i.value === value) ?? null
  // pop upward when there's no room below (e.g. the bottom-pinned selection bar)
  const offset = placement === 'top' ? 4 : -4

  // Reset + focus the filter each time the menu opens.
  useEffect(() => {
    if (!open) return
    setQ('')
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const shown =
    searchable && q.trim()
      ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
      : items

  return (
    <div className={cx('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-7 w-full items-center justify-between gap-2 rounded-[4px] border px-2 text-[11.5px] transition-colors',
          open
            ? 'border-phosphor/45 bg-panel text-fg'
            : 'border-line bg-surface/70 text-fg-dim hover:border-line-strong hover:text-fg',
        )}
      >
        {trigger ? (
          trigger({ open, selected })
        ) : (
          <span className="flex items-center gap-1.5 truncate" style={{ color: selected?.accent }}>
            {selected?.glyph}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
        )}
        <span className={cx('text-fg-faint transition-transform', open && 'rotate-180')}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: offset, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: offset, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cx(
              'absolute z-50 max-h-[280px] overflow-y-auto rounded-[5px] border border-line-strong bg-panel p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]',
              placement === 'top' ? 'bottom-full mb-1' : 'mt-1',
              align === 'right' ? 'right-0' : 'left-0',
            )}
            style={{ minWidth: width }}
          >
            {searchable && (
              <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b border-line bg-panel p-1">
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="type to filter…"
                  className="h-7 w-full rounded-[4px] border border-line bg-surface px-2 text-[11.5px] text-fg outline-none placeholder:text-fg-faint focus:border-phosphor/45"
                />
              </div>
            )}
            {allowClear && (
              <MenuRow
                label={<span className="text-fg-faint">— clear —</span>}
                selected={value === null}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              />
            )}
            {shown.map((it) => (
              <MenuRow
                key={it.value}
                accent={it.accent}
                glyph={it.glyph}
                hint={it.hint}
                label={it.label}
                selected={it.value === value}
                onClick={() => {
                  onChange(it.value)
                  setOpen(false)
                }}
              />
            ))}
            {shown.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-fg-faint">
                {searchable && q.trim() ? 'no matches' : 'no options'}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuRow({
  label,
  hint,
  accent,
  glyph,
  selected,
  onClick,
}: {
  label: ReactNode
  hint?: string
  accent?: string
  glyph?: ReactNode
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-[3px] px-2 py-1.5 text-left text-[12px] transition-colors',
        selected ? 'bg-phosphor/10 text-fg' : 'text-fg-dim hover:bg-panel-hi hover:text-fg',
      )}
    >
      <span className="flex items-center gap-2 truncate" style={{ color: accent }}>
        {glyph}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-center gap-2">
        {hint && <span className="text-[10px] text-fg-faint">{hint}</span>}
        {selected && <span className="text-phosphor">✓</span>}
      </span>
    </button>
  )
}

/** Small inline confirm used for destructive actions. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'confirm?',
  className,
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 2600)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-[4px] border px-2 text-[11px] transition-colors',
        armed
          ? 'border-rose/60 bg-rose/15 text-rose'
          : 'border-line bg-surface/60 text-fg-dim hover:border-rose/40 hover:text-rose',
        className,
      )}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

/**
 * Apply alpha to a color. Hex literals become `rgba()`; anything else — most
 * importantly a CSS custom property like `var(--color-phosphor)` — becomes a
 * `color-mix()`, so the same call themes correctly when the variable changes
 * (e.g. dark → light) without any re-render.
 */
export function hexA(color: string, a: number): string {
  const c = color.trim()
  if (/^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
    const h = c.replace('#', '')
    const full =
      h.length === 3
        ? h
            .split('')
            .map((x) => x + x)
            .join('')
        : h
    const n = parseInt(full, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
  }
  return `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`
}
