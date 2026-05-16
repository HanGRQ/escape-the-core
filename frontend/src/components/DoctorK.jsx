import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTypewriter } from '../hooks/useTypewriter'

// Persona → visual tint mapping (GDD §5.6)
const PERSONA_STYLES = {
  cold:          { accent: '#C0392B', label: 'DOCTOR K // SECURITY AI', glow: 'rgba(192,57,43,0.3)' },
  collaborative: { accent: '#E67E22', label: 'DOCTOR K // COLLABORATIVE MODE', glow: 'rgba(230,126,34,0.3)' },
  caring:        { accent: '#F39C12', label: 'DOCTOR K // CARING PROTOCOL', glow: 'rgba(243,156,18,0.3)' },
  ally:          { accent: '#5DADE2', label: 'DOCTOR K // ALLY MODE', glow: 'rgba(93,173,226,0.3)' },
  full_unlock:   { accent: '#00FF88', label: 'DOCTOR K // FULLY UNLOCKED', glow: 'rgba(0,255,136,0.3)' },
}

export function DoctorK({ message, persona = 'cold', onTypingDone }) {
  const style = PERSONA_STYLES[persona] || PERSONA_STYLES.cold
  const { displayed, done, skip } = useTypewriter(message, 22, !!message)

  useEffect(() => {
    if (done && onTypingDone) onTypingDone()
  }, [done, onTypingDone])

  if (!message) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative flex items-start gap-4"
    >
      {/* Avatar hologram */}
      <div className="flex-shrink-0 relative">
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="w-14 h-14 rounded border flex items-center justify-center"
          style={{
            borderColor: style.accent + '88',
            boxShadow: `0 0 20px ${style.glow}, inset 0 0 20px ${style.glow}`,
            background: `radial-gradient(circle, ${style.accent}15 0%, transparent 70%)`,
          }}
        >
          {/* Stylised K glyph */}
          <span
            className="font-display text-2xl font-bold"
            style={{ color: style.accent, textShadow: `0 0 10px ${style.accent}` }}
          >
            K
          </span>
        </motion.div>
        {/* Vertical connector line */}
        <div
          className="absolute left-1/2 -bottom-full w-px h-full opacity-30"
          style={{ background: `linear-gradient(${style.accent}, transparent)` }}
        />
      </div>

      {/* Dialogue box */}
      <div className="flex-1 min-w-0">
        {/* Header bar */}
        <div
          className="flex items-center gap-2 px-3 py-1 mb-2"
          style={{ borderBottom: `1px solid ${style.accent}44` }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: style.accent, boxShadow: `0 0 6px ${style.accent}` }}
          />
          <span
            className="font-display text-xs tracking-widest"
            style={{ color: style.accent }}
          >
            {style.label}
          </span>
        </div>

        {/* Message text */}
        <div
          className="px-3 py-2 rounded relative cursor-pointer"
          style={{ background: `${style.accent}08`, border: `1px solid ${style.accent}22` }}
          onClick={skip}
          title="Click to skip"
        >
          <p className="font-mono text-sm text-system-white leading-relaxed">
            {displayed}
            {!done && (
              <span
                className="inline-block w-2 h-4 ml-0.5 align-middle animate-pulse"
                style={{ background: style.accent }}
              />
            )}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
