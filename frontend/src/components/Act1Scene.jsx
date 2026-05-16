import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DoctorK } from '../components/DoctorK'
import { DDAIndicator } from '../components/DDAIndicator'
import { Act1Task } from '../components/Act1Task'
import { usePlayerTracker } from '../hooks/usePlayerTracker'
import { DOCTOR_K_DIALOGUE } from '../data/act1Data'
import { api } from '../api/client'

// Multi-line dialogue queue
function useDialogueQueue(lines) {
  const [index, setIndex]     = useState(0)
  const [current, setCurrent] = useState(lines[0] || '')
  const [done, setDone]       = useState(false)

  const advance = useCallback(() => {
    if (index + 1 < lines.length) {
      setIndex(i => i + 1)
      setCurrent(lines[index + 1])
    } else {
      setDone(true)
    }
  }, [index, lines])

  return { current, done, advance }
}

export function Act1Scene({ sessionId, userId, personaStage, onComplete }) {
  const tracker = usePlayerTracker('room_1')

  // Scene phases: 'intro' → 'teaching' → 'task' → 'complete'
  const [phase, setPhase] = useState('intro')
  const [doctorMsg, setDoctorMsg]     = useState(DOCTOR_K_DIALOGUE.opening[0])
  const [msgIndex, setMsgIndex]       = useState(0)
  const [allIntroLines]               = useState([
    ...DOCTOR_K_DIALOGUE.opening,
    ...DOCTOR_K_DIALOGUE.teaching,
  ])
  const [backendMsg, setBackendMsg]   = useState(null)

  const persona = personaStage || 'cold'

  // Advance dialogue on click / typing done
  const advanceDialogue = useCallback(() => {
    if (phase !== 'intro') return
    const next = msgIndex + 1
    if (next < allIntroLines.length) {
      setMsgIndex(next)
      setDoctorMsg(allIntroLines[next])
    } else {
      setPhase('task')
      tracker.startAttemptTimer()
    }
  }, [phase, msgIndex, allIntroLines, tracker])

  // Handle a player's drag attempt
  const handleAttempt = useCallback(async (isCorrect, answerGiven) => {
    const timeTaken = tracker.recordAttempt(isCorrect, answerGiven)

    // Fire backend async (don't block UI)
    if (sessionId && userId) {
      try {
        const res = await api.submitAnswer('room_1', {
          sessionId,
          userId,
          isCorrect,
          timeTakenMs: timeTaken,
          answerGiven,
        })
        // If backend returns a Doctor K message for STRUGGLING/STUCK, show it
        if (res.doctor_k_msg && res.dda_state !== 'FLOW') {
          setBackendMsg(res.doctor_k_msg)
        }
      } catch (e) {
        console.warn('Backend submit failed (offline mode):', e.message)
      }
    }

    tracker.startAttemptTimer()
  }, [tracker, sessionId, userId])

  // Room complete
  const handleComplete = useCallback(async () => {
    setPhase('complete')
    setDoctorMsg(DOCTOR_K_DIALOGUE.on_complete[0])

    if (sessionId && userId) {
      try {
        await api.completeRoom('room_1', { sessionId, userId, score: 1.0 })
      } catch (e) {
        console.warn('completeRoom failed:', e.message)
      }
    }

    // Show completion dialogue then advance
    let i = 1
    const timer = setInterval(() => {
      if (i < DOCTOR_K_DIALOGUE.on_complete.length) {
        setDoctorMsg(DOCTOR_K_DIALOGUE.on_complete[i])
        i++
      } else {
        clearInterval(timer)
        setTimeout(() => onComplete('collaborative'), 1500)
      }
    }, 2200)
  }, [sessionId, userId, onComplete])

  // Request hint
  const handleHint = useCallback(async () => {
    tracker.setHelpRequested()
    if (sessionId && userId) {
      try {
        const res = await api.getHint('room_1', sessionId, userId)
        if (res.doctor_k_msg) setBackendMsg(res.doctor_k_msg)
      } catch (e) {}
    }
  }, [tracker, sessionId, userId])

  return (
    <div className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 30% 20%, #2A0A0A 0%, #0D0404 60%)' }}
    >
      {/* Atmospheric grid lines */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#C0392B 1px, transparent 1px), linear-gradient(90deg, #C0392B 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Top status bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid #C0392B33', background: '#0D040488' }}
      >
        <div className="flex items-center gap-4">
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-act1-red"
              style={{ boxShadow: '0 0 6px #C0392B' }} />
            <span className="font-display text-xs tracking-widest text-act1-red">
              LOCKDOWN ACTIVE
            </span>
          </motion.div>
          <span className="font-display text-xs text-system-white opacity-30">|</span>
          <span className="font-display text-xs tracking-widest opacity-50 text-system-white">
            ACT I — COMMUNICATION CHANNEL RESTART
          </span>
        </div>
        <DDAIndicator
          status={tracker.currentStatus}
          attempts={tracker.attempts}
          consecutiveErrors={tracker.consecutiveErrors}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex gap-6 px-6 py-4 min-h-0">

        {/* Left column — scene title + Doctor K */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">

          {/* Scene title block */}
          <div className="panel-bg terminal-border rounded p-4">
            <div className="font-display text-xs tracking-widest text-act1-red mb-1 opacity-70">
              SECTOR //
            </div>
            <div className="font-display text-lg tracking-wider text-system-white glow-red">
              GRANITE CORE
            </div>
            <div className="font-mono text-xs text-system-white opacity-40 mt-1">
              Facility lockdown — day 1
            </div>
            <div className="mt-3 h-px bg-gradient-to-r from-act1-red to-transparent opacity-50" />
            <div className="mt-2 font-mono text-xs opacity-30 text-system-white leading-relaxed">
              G.A.I.A. BROADCAST: ████ ██████ ██ ██ ██ SYSTEM FAILURE ██ ████
            </div>
          </div>

          {/* Doctor K dialogue */}
          <div className="flex-1 panel-bg terminal-border rounded p-4 flex flex-col gap-3 overflow-hidden">
            <DoctorK
              message={backendMsg || doctorMsg}
              persona={persona}
              onTypingDone={phase === 'intro' ? undefined : undefined}
            />

            {phase === 'intro' && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                onClick={advanceDialogue}
                className="btn-terminal self-start mt-auto"
              >
                <span>
                  {msgIndex < allIntroLines.length - 1 ? '[ CONTINUE ]' : '[ BEGIN TASK ]'}
                </span>
              </motion.button>
            )}

            {phase === 'task' && (
              <button onClick={handleHint} className="btn-terminal self-start mt-auto text-act1-amber"
                style={{ borderColor: '#F39C1266', color: '#F39C12' }}>
                <span>[ REQUEST HINT ]</span>
              </button>
            )}
          </div>
        </div>

        {/* Right column — task area */}
        <div className="flex-1 flex flex-col min-w-0">
          <AnimatePresence mode="wait">
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-center">
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="font-display text-4xl tracking-widest text-act1-red mb-4"
                    style={{ textShadow: '0 0 30px #C0392B' }}
                  >
                    SYSTEM OFFLINE
                  </motion.div>
                  <div className="font-mono text-xs opacity-40 text-system-white">
                    Awaiting Doctor K protocol transmission...
                  </div>
                </div>
              </motion.div>
            )}

            {(phase === 'task' || phase === 'complete') && (
              <motion.div
                key="task"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 panel-bg terminal-border rounded p-4 overflow-auto"
              >
                <Act1Task
                  onAttempt={handleAttempt}
                  onComplete={handleComplete}
                  ddaStatus={tracker.currentStatus}
                  personaStage={persona}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom status strip */}
      <div className="relative z-10 flex items-center justify-between px-6 py-2"
        style={{ borderTop: '1px solid #C0392B22', background: '#0D040866' }}
      >
        <span className="font-mono text-xs opacity-30">
          CHANNELS RESTORED: {/* filled by task component */}
        </span>
        <span className="font-mono text-xs opacity-20 text-system-white">
          ESCAPE THE CORE — v0.1
        </span>
      </div>

      {/* Complete overlay */}
      <AnimatePresence>
        {phase === 'complete' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-20 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, #00FF8808 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
