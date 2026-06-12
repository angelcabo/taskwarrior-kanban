import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useStore, type Toast } from '../lib/store'
import { clamp } from '../lib/format'
import { hexA } from './ui'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[326px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ t }: { t: Toast }) {
  // Auto-dismiss must fire exactly once per toast. Keying on the stable id (and
  // calling the store directly) keeps the timer alive across the frequent
  // re-renders that realtime snapshots trigger — depending on a closure prop
  // here would reset the timer on every snapshot and toasts would never expire.
  useEffect(() => {
    const id = setTimeout(() => useStore.getState().dismissToast(t.id), 4200)
    return () => clearTimeout(id)
  }, [t.id])
  const onClick = () => t.uuid && useStore.getState().select(t.uuid)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -18, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -18, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={onClick}
      className="pointer-events-auto relative cursor-pointer overflow-hidden rounded-[5px] border bg-panel/95 px-3 py-2 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur"
      style={{ borderColor: hexA(t.accent, 0.4) }}
    >
      <div
        className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]"
        style={{ color: t.accent }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: t.accent, boxShadow: `0 0 6px ${t.accent}` }}
        />
        {t.detail}
      </div>
      {t.title && <div className="mt-1 text-[12px] leading-snug text-fg">{clamp(t.title, 76)}</div>}
      <span
        className="toast-bar absolute bottom-0 left-0 h-[2px] w-full"
        style={{ background: hexA(t.accent, 0.7) }}
      />
    </motion.div>
  )
}
