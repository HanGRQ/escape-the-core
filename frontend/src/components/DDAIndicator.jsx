import { motion, AnimatePresence } from 'framer-motion'

const STATE_CONFIG = {
  FLOW:       { color: '#00FF88', label: 'FLOW',       pulse: false },
  CONFUSED:   { color: '#F39C12', label: 'CONFUSED',   pulse: true  },
  STRUGGLING: { color: '#E67E22', label: 'STRUGGLING', pulse: true  },
  STUCK:      { color: '#C0392B', label: 'STUCK',      pulse: true  },
}

export function DDAIndicator({ status = 'FLOW', attempts = 0, consecutiveErrors = 0 }) {
  const cfg = STATE_CONFIG[status] || STATE_CONFIG.FLOW

  return (
    <div className="flex items-center gap-2 px-3 py-1.5"
      style={{ border: `1px solid ${cfg.color}33`, background: `${cfg.color}08` }}
    >
      <motion.div
        className="w-2 h-2 rounded-full"
        style={{ background: cfg.color }}
        animate={cfg.pulse ? { opacity: [1, 0.3, 1], scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <span className="font-display text-xs tracking-widest" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
      {consecutiveErrors > 0 && (
        <span className="font-mono text-xs opacity-50" style={{ color: cfg.color }}>
          ×{consecutiveErrors}
        </span>
      )}
    </div>
  )
}
