import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LOG_ENTRIES, USE_CASE_SLOTS } from '../data/act1Data'

// Simple drag state (no dnd-kit needed for this layout)
function useDragDrop(onDrop) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)

  const onDragStart = (e, logId) => {
    setDragging(logId)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e, slotId) => {
    e.preventDefault()
    setOver(slotId)
  }
  const onDragLeave = () => setOver(null)
  const onDropSlot = (e, slotId) => {
    e.preventDefault()
    setOver(null)
    if (dragging) onDrop(dragging, slotId)
    setDragging(null)
  }
  const onDragEnd = () => { setDragging(null); setOver(null) }

  return { dragging, over, onDragStart, onDragOver, onDragLeave, onDropSlot, onDragEnd }
}

/**
 * Act1Task — drag-and-drop use-case matching task.
 *
 * onHint(text) is called whenever a wrong drop occurs, so the parent scene
 * can push it into Doctor K's unified conversation feed (per the new
 * "everything is dialogue" layout) instead of rendering a separate local
 * hint panel.
 */
export function Act1Task({ onAttempt, onComplete, onHint, ddaStatus }) {
  // slotFills: { slotId -> logId }
  const [slotFills, setSlotFills]   = useState({})
  // slotState: { slotId -> 'idle'|'correct'|'incorrect' }
  const [slotState, setSlotState]   = useState({})
  // locked logIds (correctly placed)
  const [locked, setLocked]         = useState(new Set())
  const [completed, setCompleted]   = useState(false)

  // Remaining unplaced entries
  const remaining = LOG_ENTRIES.filter(e => !locked.has(e.id))

  const handleDrop = useCallback((logId, slotId) => {
    const entry = LOG_ENTRIES.find(e => e.id === logId)
    if (!entry || locked.has(logId)) return

    const isCorrect = entry.correctSlot === slotId

    setSlotFills(prev => ({ ...prev, [slotId]: logId }))
    setSlotState(prev => ({ ...prev, [slotId]: isCorrect ? 'correct' : 'incorrect' }))

    // Notify parent for DDA tracking
    onAttempt(isCorrect, entry.text)

    if (isCorrect) {
      setLocked(prev => new Set([...prev, logId]))
      // Clear slot state after glow settles
      setTimeout(() => {
        setSlotState(prev => ({ ...prev, [slotId]: 'correct' }))
      }, 600)
    } else {
      // Route the hint into Doctor K's conversation feed
      onHint?.(entry.hint)
      // Remove incorrect fill after shake
      setTimeout(() => {
        setSlotFills(prev => { const n = { ...prev }; delete n[slotId]; return n })
        setSlotState(prev => ({ ...prev, [slotId]: 'idle' }))
      }, 800)
    }
  }, [locked, onAttempt, onHint])

  // Check completion
  useEffect(() => {
    if (locked.size === LOG_ENTRIES.length && !completed) {
      setCompleted(true)
      setTimeout(() => onComplete(), 1200)
    }
  }, [locked.size, completed, onComplete])

  // STRUGGLING/STUCK: reduce to 3 options
  const visibleEntries = ddaStatus === 'STRUGGLING' || ddaStatus === 'STUCK'
    ? remaining.slice(0, 3)
    : remaining

  const { dragging, over, onDragStart, onDragOver, onDragLeave, onDropSlot, onDragEnd }
    = useDragDrop(handleDrop)

  return (
    <div className="flex gap-4 h-full">

      {/* LEFT — Log entries (draggable) */}
      <div className="w-[42%] flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-4 bg-act1-amber" />
          <span className="font-display text-xs tracking-widest text-act1-amber">
            NETWIZ COMMUNICATION LOG
          </span>
        </div>

        <AnimatePresence>
          {visibleEntries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12, scale: 0.95 }}
              transition={{ delay: i * 0.06 }}
              draggable
              onDragStart={e => onDragStart(e, entry.id)}
              onDragEnd={onDragEnd}
              className="px-3 py-2.5 rounded cursor-grab active:cursor-grabbing select-none"
              style={{
                background: dragging === entry.id ? '#F39C1210' : '#1E0E0E',
                border: `1px solid ${dragging === entry.id ? '#F39C12' : '#C0392B44'}`,
                boxShadow: dragging === entry.id ? '0 0 16px #F39C1240' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-act1-red font-display text-xs mt-0.5 opacity-60">
                  LOG_{String(i + 1).padStart(2, '0')}
                </span>
                <p className="font-mono text-xs text-system-white leading-relaxed">
                  {entry.text}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {remaining.length === 0 && !completed && (
          <div className="text-center py-4 font-display text-xs text-terminal-green tracking-widest">
            ALL ENTRIES DISPATCHED
          </div>
        )}
      </div>

      {/* RIGHT — Use-case slots (drop targets) */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-4 bg-cold-cyan" />
          <span className="font-display text-xs tracking-widest text-cold-cyan">
            USE-CASE CHANNELS
          </span>
        </div>

        {USE_CASE_SLOTS.map(slot => {
          const state    = slotState[slot.id] || 'idle'
          const filledId = slotFills[slot.id]
          const entry    = LOG_ENTRIES.find(e => e.id === filledId)
          const isLocked = locked.has(filledId)

          return (
            <motion.div
              key={slot.id}
              onDragOver={e => onDragOver(e, slot.id)}
              onDragLeave={onDragLeave}
              onDrop={e => onDropSlot(e, slot.id)}
              animate={state === 'incorrect' ? { x: [0, -4, 4, -4, 0] } : {}}
              transition={{ duration: 0.3 }}
              className={`slot-target rounded px-3 py-2 min-h-[46px] flex items-center gap-3 ${
                over === slot.id ? 'over' : ''
              } ${state === 'correct' ? 'correct' : ''} ${state === 'incorrect' ? 'incorrect' : ''}`}
            >
              {/* Slot label */}
              <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center"
                style={{
                  background: isLocked ? '#00FF8815' : '#1A0A0A',
                  border: `1px solid ${isLocked ? '#00FF8888' : '#C0392B33'}`,
                }}
              >
                <span className="font-display text-xs"
                  style={{ color: isLocked ? '#00FF88' : '#C0392B' }}>
                  {slot.shortLabel}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-display text-xs tracking-wider"
                  style={{ color: isLocked ? '#00FF88' : '#E8F4FD99' }}>
                  {slot.label}
                </div>
                {entry && (
                  <p className="font-mono text-xs opacity-60 truncate mt-0.5">
                    {entry.text}
                  </p>
                )}
                {!entry && (
                  <p className="font-mono text-xs opacity-30 mt-0.5">
                    — drag log entry here —
                  </p>
                )}
              </div>

              {isLocked && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: '#00FF8822', border: '1px solid #00FF8888' }}
                >
                  <span style={{ color: '#00FF88', fontSize: '8px' }}>✓</span>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
