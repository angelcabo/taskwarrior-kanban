import { motion } from 'motion/react'
import { useStore } from '../lib/store'
import { Kbd } from './ui'

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['c'], desc: 'new task' },
  { keys: ['/'], desc: 'focus search' },
  { keys: ['b'], desc: 'manage boards & filters' },
  { keys: ['s'], desc: 'toggle swimlanes' },
  { keys: ['t'], desc: 'cycle theme · dark / light / system' },
  { keys: ['drag'], desc: 'move task between states' },
  { keys: ['⌘', 'click'], desc: 'select for batch edit' },
  { keys: ['↵'], desc: 'open / create' },
  { keys: ['esc'], desc: 'clear selection · close panel' },
  { keys: ['?'], desc: 'this help' },
]

export function Help() {
  const close = () => useStore.getState().setHelpOpen(false)
  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-abyss/55 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <motion.div
        className="fixed left-1/2 top-1/2 z-40 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      >
        <div className="rounded-[7px] border border-line-strong bg-ink/95 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-phosphor glow-soft">▌</span>
            <span className="text-[12px] uppercase tracking-[0.22em] text-fg-dim">keyboard</span>
          </div>
          <div className="space-y-2.5">
            {SHORTCUTS.map((s) => (
              <div key={s.desc} className="flex items-center justify-between">
                <span className="text-[12.5px] text-fg-dim">{s.desc}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-line pt-3 text-[10.5px] leading-relaxed text-fg-faint">
            this board is a live view of your taskwarrior db — moves you make here and changes from
            your agents or terminal sync both ways in realtime.
          </div>
        </div>
      </motion.div>
    </>
  )
}
