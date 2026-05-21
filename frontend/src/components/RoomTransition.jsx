import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Each room has its own color identity
const ROOM_THEMES = {
  room_1: { bg: '#0D0404', accent: '#C0392B', label: 'ACT I',   name: 'COMMUNICATION HUB',   tagline: 'Language comprehension layer restored.' },
  room_2: { bg: '#020810', accent: '#3498DB', label: 'ACT II',  name: 'SERVER ROOM',          tagline: 'Routing to model classification sector.' },
  room_3: { bg: '#03080D', accent: '#27AE60', label: 'ACT III', name: 'PROMPT LAB',           tagline: 'Accessing watsonx engineering terminal.' },
  quiz:   { bg: '#080408', accent: '#9B59B6', label: 'FINALE',  name: 'CERTIFICATION CHAMBER', tagline: 'Initiating final evaluation protocol.' },
}

/**
 * RoomTransition — full-screen overlay shown between rooms.
 * Props:
 *   from       room id leaving
 *   to         room id entering
 *   onDone     called when transition completes
 */
export function RoomTransition({ from, to, onDone }) {
  const fromTheme = ROOM_THEMES[from] || ROOM_THEMES.room_1
  const toTheme   = ROOM_THEMES[to]   || ROOM_THEMES.room_2
  const [phase, setPhase] = useState('flash')  // flash → label → done

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('label'), 400)
    const t2 = setTimeout(() => setPhase('exit'),  2200)
    const t3 = setTimeout(() => onDone?.(),        2800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: phase === 'exit' ? 0.6 : 0.25 }}
      style={{ background: toTheme.bg }}
    >
      {/* Animated grid */}
      <motion.div
        className="absolute inset-0 opacity-[0.06]"
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        transition={{ duration: 2.4 }}
        style={{
          backgroundImage: `linear-gradient(${toTheme.accent} 1px, transparent 1px), linear-gradient(90deg, ${toTheme.accent} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Radial flash */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        style={{ background: `radial-gradient(ellipse at center, ${toTheme.accent}44 0%, transparent 65%)` }}
      />

      {/* Unlock line sweep */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${toTheme.accent}, transparent)`, top: '50%' }}
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: [1, 1, 0] }}
        transition={{ duration: 0.6, delay: 0.1, times: [0, 0.8, 1] }}
      />

      {/* Content */}
      <AnimatePresence>
        {phase === 'label' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 text-center"
          >
            <div className="font-display text-xs tracking-[0.5em] mb-3 opacity-50"
              style={{ color: toTheme.accent }}>
              {toTheme.label} — UNLOCKED
            </div>
            <div className="font-display text-4xl tracking-[0.25em] mb-4"
              style={{ color: toTheme.accent, textShadow: `0 0 40px ${toTheme.accent}` }}>
              {toTheme.name}
            </div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="h-px mx-auto mb-4"
              style={{ background: `linear-gradient(90deg, transparent, ${toTheme.accent}, transparent)`, maxWidth: '320px' }}
            />
            <div className="font-mono text-sm opacity-60" style={{ color: toTheme.accent }}>
              {toTheme.tagline}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corner decorations */}
      {['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'].map(pos => (
        <motion.div key={pos} className={`absolute ${pos} w-6 h-6`}
          initial={{ opacity: 0 }} animate={{ opacity: 0.4 }}
          style={{
            borderTop: pos.includes('bottom') ? 'none' : `1px solid ${toTheme.accent}`,
            borderBottom: pos.includes('top') ? 'none' : `1px solid ${toTheme.accent}`,
            borderLeft: pos.includes('right') ? 'none' : `1px solid ${toTheme.accent}`,
            borderRight: pos.includes('left') ? 'none' : `1px solid ${toTheme.accent}`,
          }} />
      ))}
    </motion.div>
  )
}

// Export themes for use in scene backgrounds
export { ROOM_THEMES }
