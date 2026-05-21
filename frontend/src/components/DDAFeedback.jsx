import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const DDA_CONFIG = {
  FLOW:       { color: '#00FF88', bg: '#00FF8808', label: 'FLOW',       desc: 'On track.' },
  CONFUSED:   { color: '#F39C12', bg: '#F39C1215', label: 'CONFUSED',   desc: 'Take a moment — review the concepts.' },
  STRUGGLING: { color: '#E67E22', bg: '#E67E2218', label: 'STRUGGLING', desc: 'Two errors detected — Doctor K is providing guidance.' },
  STUCK:      { color: '#C0392B', bg: '#C0392B20', label: 'STUCK',      desc: 'Activating full knowledge scaffold.' },
}

/** Full-screen flash on wrong answer */
export function DDAFlash({ trigger, state }) {
  const [visible, setVisible] = useState(false)
  const cfg = DDA_CONFIG[state] || DDA_CONFIG.CONFUSED

  useEffect(() => {
    if (!trigger) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 500)
    return () => clearTimeout(t)
  }, [trigger])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 pointer-events-none z-50"
          style={{ background: `radial-gradient(ellipse at center, ${cfg.color}28 0%, transparent 70%)` }}
        />
      )}
    </AnimatePresence>
  )
}

/** Top status bar — big highlighted tag for STRUGGLING/STUCK */
export function DDAStatusBar({ status, consecutiveErrors }) {
  const cfg = DDA_CONFIG[status] || DDA_CONFIG.FLOW
  const prominent = status === 'STRUGGLING' || status === 'STUCK'

  return (
    <motion.div
      layout
      className="flex items-center gap-3 px-4 py-2"
      style={{
        background: prominent ? cfg.bg : 'transparent',
        border: prominent ? `1px solid ${cfg.color}55` : '1px solid transparent',
        borderRadius: '4px',
        transition: 'all 0.3s',
      }}
    >
      <motion.div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }}
        animate={prominent ? { opacity: [1, 0.2, 1], scale: [1, 1.4, 1] } : { opacity: 1 }}
        transition={{ duration: 0.9, repeat: prominent ? Infinity : 0 }}
      />
      <span
        className="font-display tracking-widest"
        style={{
          color: cfg.color,
          fontSize: prominent ? '13px' : '11px',
          fontWeight: prominent ? 600 : 400,
          textShadow: prominent ? `0 0 12px ${cfg.color}` : 'none',
        }}
      >
        {cfg.label}
      </span>
      {prominent && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="font-mono text-xs"
          style={{ color: cfg.color, opacity: 0.7 }}
        >
          — {cfg.desc}
        </motion.span>
      )}
      {consecutiveErrors > 0 && (
        <span className="font-mono text-xs ml-auto" style={{ color: cfg.color, opacity: 0.5 }}>
          ×{consecutiveErrors} errors
        </span>
      )}
    </motion.div>
  )
}

/** Sidebar DDA feedback banner — large, glowing, with Doctor K message */
export function DDAFeedbackBanner({ status, message, onDismiss }) {
  const cfg = DDA_CONFIG[status] || DDA_CONFIG.CONFUSED
  if (!message || status === 'FLOW') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded p-3 relative"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.color}66`,
        boxShadow: `0 0 24px ${cfg.color}33`,
      }}
    >
      {/* Label */}
      <div className="flex items-center gap-2 mb-2">
        <motion.div
          className="w-2 h-2 rounded-full"
          style={{ background: cfg.color }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span
          className="font-display text-xs tracking-widest"
          style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.color}` }}
        >
          DDA // {cfg.label}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-auto font-mono text-xs opacity-40 hover:opacity-80"
            style={{ color: cfg.color }}
          >
            ×
          </button>
        )}
      </div>
      {/* Message */}
      <p
        className="font-mono text-xs leading-relaxed"
        style={{ color: cfg.color, opacity: 0.9 }}
      >
        {message}
      </p>
    </motion.div>
  )
}
