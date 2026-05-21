import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DoctorK } from './DoctorK'
import { DDAFlash, DDAStatusBar, DDAFeedbackBanner } from './DDAFeedback'
import { Act1Task } from './Act1Task'
import { usePlayerTracker } from '../hooks/usePlayerTracker'
import { api } from '../api/client'

export function Act1Scene({ sessionId, userId, personaStage = 'cold', onComplete }) {
  // Phase: 'teaching' | 'task'
  const [phase, setPhase] = useState('teaching')

  // Teaching state
  const [teachText, setTeachText]   = useState('')
  const [isStreaming, setStreaming]  = useState(false)
  const [teachDone, setTeachDone]   = useState(false)
  const streamRef = useRef(null)

  // Chat state (shared across teaching and task phases)
  const [chatHistory, setChatHistory]   = useState([])
  const [chatLoading, setChatLoading]   = useState(false)

  // DDA state
  const tracker = usePlayerTracker('room_1')
  const [ddaMessage, setDdaMessage]     = useState('')
  const [flashTrigger, setFlashTrigger] = useState(0)

  // ── Start teaching stream on mount ───────────────────────────────────────

  useEffect(() => {
    // Always attempt to stream — backend works without Firebase.
    // Use 'offline' as fallback session_id when Firebase not configured.
    const sid = sessionId || 'offline'
    setStreaming(true)
    streamRef.current = api.streamTeach('room_1', sid, userId, {
      onChunk: (chunk) => setTeachText(prev => prev + chunk),
      onDone:  () => { setStreaming(false); setTeachDone(true) },
      onError: (err) => {
        setStreaming(false)
        setTeachText(prev => prev + `\n\n[ Connection error: ${err} — is the backend running on port 8000? ]`)
        setTeachDone(true)
      },
    })
    return () => streamRef.current?.abort()
  }, [sessionId, userId])

  // ── Chat handler ─────────────────────────────────────────────────────────

  const sendChat = useCallback((message) => {
    setChatHistory(prev => [...prev, { role: 'user', content: message }])
    setChatLoading(true)

    // Add a streaming placeholder for assistant
    setChatHistory(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    api.streamChat('room_1', {
      sessionId: sessionId || 'offline', userId, message,
      history: chatHistory.filter(m => !m.streaming),
    }, {
      onChunk: (chunk) => {
        setChatHistory(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + chunk }
          }
          return updated
        })
      },
      onDone: () => {
        setChatHistory(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.streaming) updated[updated.length - 1] = { ...last, streaming: false }
          return updated
        })
        setChatLoading(false)
      },
      onError: () => {
        setChatHistory(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.streaming) {
            updated[updated.length - 1] = { ...last, content: 'Connection error. Try again.', streaming: false }
          }
          return updated
        })
        setChatLoading(false)
      },
    })
  }, [sessionId, userId, chatHistory])

  // ── Task attempt handler ──────────────────────────────────────────────────

  const handleAttempt = useCallback(async (isCorrect, answerGiven) => {
    const timeTaken = tracker.recordAttempt(isCorrect, answerGiven)

    if (!isCorrect) {
      setFlashTrigger(n => n + 1)
    }

    if (!sessionId) return
    try {
      const res = await api.submitAnswer('room_1', {
        sessionId: sessionId || 'offline', userId, isCorrect,
        timeTakenMs: timeTaken, answerGiven,
      })
      if (res.doctor_k_msg) {
        setDdaMessage(res.doctor_k_msg)
        // Add to chat history so sidebar shows it
        setChatHistory(prev => [...prev,
          { role: 'assistant', content: res.doctor_k_msg }
        ])
      }
    } catch (e) {
      console.warn('submit failed:', e.message)
    }
    tracker.startAttemptTimer()
  }, [tracker, sessionId, userId])

  // ── Room complete ─────────────────────────────────────────────────────────

  const handleComplete = useCallback(async () => {
    if (sessionId) {
      try { await api.completeRoom('room_1', { sessionId, userId, score: 1.0 }) }
      catch (e) { console.warn('completeRoom failed:', e.message) }
    }
    setTimeout(() => onComplete('collaborative'), 1800)
  }, [sessionId, userId, onComplete])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full h-screen overflow-hidden flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 30% 10%, #1f0606 0%, #0D0404 65%)' }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#C0392B 1px, transparent 1px), linear-gradient(90deg, #C0392B 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* DDA full-screen flash */}
      <DDAFlash trigger={flashTrigger} state={tracker.currentStatus} />

      {/* ── Top bar ── */}
      <div
        className="relative z-10 flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid #C0392B2A', background: '#0D040490' }}
      >
        <div className="flex items-center gap-4">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-act1-red" style={{ boxShadow: '0 0 5px #C0392B' }} />
            <span className="font-display text-xs tracking-widest text-act1-red">LOCKDOWN ACTIVE</span>
          </motion.div>
          <span className="opacity-20 text-system-white font-display text-xs">|</span>
          <span className="font-display text-xs tracking-widest opacity-40 text-system-white">
            ACT I — COMMUNICATION CHANNEL RESTART
          </span>
        </div>

        {/* DDA status bar — prominent on STRUGGLING/STUCK */}
        <DDAStatusBar
          status={tracker.currentStatus}
          consecutiveErrors={tracker.consecutiveErrors}
        />
      </div>

      {/* ── Main content area ── */}
      <div className="relative z-10 flex-1 min-h-0">
        <AnimatePresence mode="wait">

          {/* ── TEACHING PHASE — full screen ── */}
          {phase === 'teaching' && (
            <motion.div
              key="teaching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.4 }}
              className="h-full"
            >
              <DoctorK
                mode="fullscreen"
                persona={personaStage}
                streamingText={teachText}
                isStreaming={isStreaming}
                chatHistory={chatHistory}
                onSendMessage={sendChat}
                isChatLoading={chatLoading}
                teachingDone={teachDone}
                onBeginTask={() => setPhase('task')}
              />
            </motion.div>
          )}

          {/* ── TASK PHASE — split screen ── */}
          {phase === 'task' && (
            <motion.div
              key="task"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="h-full flex"
            >
              {/* Left sidebar — 300px, Doctor K */}
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '300px' }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                className="flex-shrink-0 flex flex-col h-full p-4 gap-3"
                style={{ borderRight: '1px solid #C0392B22', background: '#0D040466' }}
              >
                <DoctorK
                  mode="sidebar"
                  persona={personaStage}
                  chatHistory={chatHistory}
                  onSendMessage={sendChat}
                  isChatLoading={chatLoading}
                />

                {/* DDA feedback banner in sidebar */}
                <AnimatePresence>
                  {ddaMessage && tracker.currentStatus !== 'FLOW' && (
                    <DDAFeedbackBanner
                      status={tracker.currentStatus}
                      message={ddaMessage}
                      onDismiss={() => setDdaMessage('')}
                    />
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Right — drag task */}
              <div className="flex-1 min-w-0 p-4 overflow-auto">
                <Act1Task
                  onAttempt={handleAttempt}
                  onComplete={handleComplete}
                  ddaStatus={tracker.currentStatus}
                  personaStage={personaStage}
                />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom strip */}
      <div
        className="relative z-10 flex items-center justify-end px-6 py-1.5 flex-shrink-0"
        style={{ borderTop: '1px solid #C0392B15', background: '#0D040866' }}
      >
        <span className="font-mono text-xs opacity-20">ESCAPE THE CORE — v0.2</span>
      </div>
    </div>
  )
}
