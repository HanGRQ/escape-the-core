import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { stripMarkdown } from '../utils/textFormat'

/**
 * TypewriterText — types out a single paragraph character by character.
 * Click anywhere on the paragraph to skip straight to the full text.
 */
function TypewriterText({ text, speed = 14, onDone }) {
  const [displayed, setDisplayed] = useState('')
  const idxRef  = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    setDisplayed('')
    idxRef.current = 0
    const tick = () => {
      if (idxRef.current < text.length) {
        setDisplayed(text.slice(0, idxRef.current + 1))
        idxRef.current++
        timerRef.current = setTimeout(tick, speed)
      } else {
        onDone?.()
      }
    }
    timerRef.current = setTimeout(tick, speed)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const skip = () => {
    clearTimeout(timerRef.current)
    setDisplayed(text)
    onDone?.()
  }

  return (
    <p
      onClick={skip}
      className="font-mono text-base leading-[1.85] cursor-pointer"
      style={{ color: '#E8F4FD' }}
      title="Click to skip typewriter effect"
    >
      {displayed}
      {displayed.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
          className="inline-block w-1.5 h-4 ml-0.5 align-middle"
          style={{ background: '#E8F4FD99' }}
        />
      )}
    </p>
  )
}

/**
 * TeachingPanel — right-side reading panel for Doctor K's lecture.
 *
 * Shows ONE paragraph at a time. After the typewriter effect finishes,
 * two buttons appear side by side in the footer:
 *
 *   [ CONTINUE → ]   — reveals the next paragraph (existing behaviour)
 *   [ SKIP ]         — skips ALL remaining teaching content and goes
 *                      straight to the task (calls onBeginTask immediately)
 *
 * SKIP is always visible during the teaching phase (whenever there is
 * content to skip), so the player can jump straight to the task at any
 * point — even mid-paragraph — without having to click through every
 * paragraph first.
 *
 * Props:
 *   accent        hex colour for this act
 *   title         heading shown above the lecture text
 *   text          the full streaming buffer so far
 *   isStreaming   bool — true while still receiving chunks
 *   teachDone     bool — true once the stream has finished
 *   onBeginTask   () => void — called when the player clicks BEGIN TASK or SKIP
 */
export function TeachingPanel({ accent, title, text, isStreaming, teachDone, onBeginTask }) {
  const allParas = (text || '')
    .split(/\n\n+/)
    .map(p => stripMarkdown(p.trim()))
    .filter(Boolean)

  const [revealedCount, setRevealedCount] = useState(0)
  const [typingDone, setTypingDone]       = useState(false)

  // Auto-reveal the first paragraph the moment it arrives
  useEffect(() => {
    if (revealedCount === 0 && allParas.length > 0) {
      setRevealedCount(1)
      setTypingDone(false)
    }
  }, [allParas.length, revealedCount])

  const hasMore       = revealedCount < allParas.length
  const showContinue  = typingDone && hasMore
  const showBeginTask = typingDone && !hasMore && teachDone && !isStreaming
  const stillToCome   = typingDone && !hasMore && (isStreaming || !teachDone)

  // SKIP is visible any time there is teaching content on screen, regardless
  // of whether the typewriter is still running or more paragraphs are queued.
  // It is hidden only after BEGIN TASK has already appeared (teaching complete).
  const showSkip = revealedCount > 0 && !showBeginTask

  const currentPara = allParas[revealedCount - 1] || ''

  const handleContinue = () => {
    if (hasMore) {
      setRevealedCount(c => c + 1)
      setTypingDone(false)
    }
  }

  // Skip directly calls onBeginTask — same outcome as clicking BEGIN TASK,
  // but available at any point during teaching without waiting for every
  // paragraph to be revealed.
  const handleSkip = () => {
    onBeginTask?.()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-2 pb-4 flex-shrink-0">
        <div className="w-1 h-5" style={{ background: accent }} />
        <span className="font-display text-sm tracking-widest" style={{ color: accent }}>
          {title}
        </span>
        {revealedCount > 0 && (
          <span className="font-mono text-xs ml-auto opacity-40" style={{ color: accent }}>
            {revealedCount} / {isStreaming ? '…' : allParas.length}
          </span>
        )}
      </div>

      {/* Current paragraph */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        <AnimatePresence mode="wait">
          {currentPara && (
            <motion.div
              key={revealedCount}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              {typingDone ? (
                <p className="font-mono text-base leading-[1.85]"
                  style={{ color: '#E8F4FD' }}>
                  {currentPara}
                </p>
              ) : (
                <TypewriterText
                  text={currentPara}
                  onDone={() => setTypingDone(true)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {revealedCount === 0 && (
          <p className="font-mono text-sm opacity-30 italic" style={{ color: accent }}>
            Receiving transmission…
          </p>
        )}
      </div>

      {/* Footer — CONTINUE / BEGIN TASK / SKIP */}
      <div className="flex-shrink-0 pt-4 px-2 flex items-center gap-3">
        <AnimatePresence mode="wait">
          {showContinue && (
            <motion.button
              key="continue"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              onClick={handleContinue}
              className="px-7 py-2.5 font-display text-sm tracking-widest rounded"
              style={{ border: `1px solid ${accent}`, color: accent, background: `${accent}12` }}
            >
              [ CONTINUE → ]
            </motion.button>
          )}

          {showBeginTask && (
            <motion.button
              key="begin"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              onClick={onBeginTask}
              className="px-7 py-2.5 font-display text-sm tracking-widest rounded"
              style={{
                border: `1px solid ${accent}`, color: '#0D0404', background: accent,
                boxShadow: `0 0 28px ${accent}55`,
              }}
            >
              [ BEGIN TASK → ]
            </motion.button>
          )}

          {stillToCome && (
            <motion.span
              key="waiting"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="font-mono text-xs"
              style={{ color: accent, opacity: 0.6 }}
            >
              receiving more…
            </motion.span>
          )}
        </AnimatePresence>

        {/* SKIP — always visible during teaching, jumps straight to the task */}
        <AnimatePresence>
          {showSkip && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={handleSkip}
              className="px-4 py-2.5 font-display text-xs tracking-widest rounded
                         transition-all hover:opacity-80"
              style={{
                border: `1px solid ${accent}44`,
                color: accent,
                background: 'transparent',
                opacity: 0.55,
              }}
              title="Skip all teaching content and go straight to the task"
            >
              SKIP
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
