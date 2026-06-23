import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { DoctorK } from './DoctorK'
import { TeachingPanel } from './TeachingPanel'
import { DDAFlash, DDAStatusBar } from './DDAFeedback'
import { Act1Task } from './Act1Task'
import { usePlayerTracker } from '../hooks/usePlayerTracker'
import { api } from '../api/client'

const ACCENT = '#C0392B'
const BG     = '/assets/backgrounds/background1.png'
const AVATAR = '/assets/doctors/doctor1.png'

export function Act1Scene({ sessionId, userId, personaStage = 'cold', onComplete }) {
  // 'teaching' — lecture streams in the RIGHT panel
  // 'task'     — Act1Task replaces the lecture in the RIGHT panel
  const [phase, setPhase] = useState('teaching')

  // Teaching buffer — lives in the right panel only, not in the feed
  const [teachText, setTeachText] = useState('')
  const [isStreaming, setStreaming] = useState(false)
  const [teachDone, setTeachDone] = useState(false)
  const streamRef = useRef(null)

  // Left-panel feed: ONLY chat Q&A + DDA task guidance
  const [feed, setFeed] = useState([])
  const [chatLoading, setChatLoading] = useState(false)

  const tracker = usePlayerTracker('room_1')
  const [flashTrigger, setFlashTrigger] = useState(0)

  const sid = sessionId || 'offline'

  // ── Start teaching stream on mount ────────────────────────────────────────

  useEffect(() => {
    setStreaming(true)
    streamRef.current = api.streamTeach('room_1', sid, userId, {
      onChunk: (chunk) => setTeachText(prev => prev + chunk),
      onDone: () => { setStreaming(false); setTeachDone(true) },
      onError: (err) => {
        setStreaming(false)
        setTeachText(prev => prev + `\n\n[ Connection error: ${err} — is the backend running on port 8000? ]`)
        setTeachDone(true)
      },
    })
    return () => streamRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Chat handler — left panel only ────────────────────────────────────────

  const sendChat = useCallback((message) => {
    setFeed(prev => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '', streaming: true, kind: 'chat' },
    ])
    setChatLoading(true)

    const history = feed.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }))

    api.streamChat('room_1', { sessionId: sid, userId, message, history }, {
      onChunk: (chunk) => setFeed(prev => {
        const u = [...prev]
        const last = u[u.length - 1]
        if (last?.role === 'assistant') u[u.length - 1] = { ...last, content: last.content + chunk }
        return u
      }),
      onDone: () => {
        setFeed(prev => {
          const u = [...prev]
          const last = u[u.length - 1]
          if (last?.streaming) u[u.length - 1] = { ...last, streaming: false }
          return u
        })
        setChatLoading(false)
      },
      onError: () => {
        setFeed(prev => {
          const u = [...prev]
          const last = u[u.length - 1]
          if (last?.streaming) u[u.length - 1] = { ...last, content: 'Connection error. Try again.', streaming: false }
          return u
        })
        setChatLoading(false)
      },
    })
  }, [sid, userId, feed])

  // ── Task attempt handler ──────────────────────────────────────────────────

  const handleAttempt = useCallback(async (isCorrect, answerGiven) => {
    const timeTaken = tracker.recordAttempt(isCorrect, answerGiven)
    if (!isCorrect) setFlashTrigger(n => n + 1)

    try {
      const res = await api.submitAnswer('room_1', {
        sessionId: sid, userId, isCorrect, timeTakenMs: timeTaken, answerGiven,
      })
      if (res?.doctor_k_msg) {
        setFeed(prev => [...prev, { role: 'assistant', content: res.doctor_k_msg, kind: 'dda' }])
      }
    } catch (e) {
      console.warn('submit failed:', e.message)
    }
    tracker.startAttemptTimer()
  }, [tracker, sid, userId])

  // Instant local hint (shown before the backend round-trip resolves)
  const handleHint = useCallback((hintText) => {
    setFeed(prev => [...prev, { role: 'assistant', content: hintText, kind: 'dda' }])
  }, [])

  // ── Room complete ─────────────────────────────────────────────────────────

  const handleComplete = useCallback(async () => {
    try { await api.completeRoom('room_1', { sessionId: sid, userId, score: 1.0 }) }
    catch (e) { console.warn('completeRoom failed:', e.message) }
    setTimeout(() => onComplete('collaborative'), 1800)
  }, [sid, userId, onComplete])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-screen overflow-hidden flex">
      {/* Background image */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center',
      }} />
      {/* Dark overlay — readability + act colour wash */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(13,4,4,0.55) 0%, rgba(13,4,4,0.85) 100%)',
      }} />
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{
        backgroundImage: `linear-gradient(${ACCENT} 1px, transparent 1px), linear-gradient(90deg, ${ACCENT} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      <DDAFlash trigger={flashTrigger} state={tracker.currentStatus} />

      {/* ── Left — Doctor K: Q&A + task guidance ONLY ── */}
      <div className="relative z-10 flex-shrink-0 h-full flex flex-col"
        style={{ width: '34%', borderRight: `1px solid ${ACCENT}33`, background: 'rgba(13,4,4,0.55)' }}>
        <div className="flex items-center px-5 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${ACCENT}22` }}>
          <span className="font-display text-xs tracking-widest opacity-50" style={{ color: ACCENT }}>
            ACT I — COMMUNICATION CHANNEL RESTART
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <DoctorK
            persona={personaStage}
            avatarSrc={AVATAR}
            feed={feed}
            onSendMessage={sendChat}
            isChatLoading={chatLoading}
          />
        </div>
      </div>

      {/* ── Right — Teaching, then Task ── */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-6 py-2 flex-shrink-0"
          style={{ borderBottom: `1px solid ${ACCENT}33`, background: 'rgba(13,4,4,0.45)' }}>
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }} />
            <span className="font-display text-xs tracking-widest" style={{ color: ACCENT }}>LOCKDOWN ACTIVE</span>
          </motion.div>
          <DDAStatusBar status={tracker.currentStatus} consecutiveErrors={tracker.consecutiveErrors} />
        </div>

        <div className="flex-1 min-h-0 p-6 overflow-auto" style={{ background: 'rgba(13,4,4,0.25)' }}>
          {phase === 'teaching' ? (
            <TeachingPanel
              accent={ACCENT}
              title="TRANSMISSION // SECTOR BRIEFING"
              text={teachText}
              isStreaming={isStreaming}
              teachDone={teachDone}
              onBeginTask={() => { setPhase('task'); tracker.startAttemptTimer() }}
            />
          ) : (
            <Act1Task
              onAttempt={handleAttempt}
              onComplete={handleComplete}
              onHint={handleHint}
              ddaStatus={tracker.currentStatus}
            />
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-1.5 flex-shrink-0"
          style={{ borderTop: `1px solid ${ACCENT}22`, background: 'rgba(13,4,4,0.5)' }}>
          <span className="font-mono text-xs opacity-20">ESCAPE THE CORE — v0.4</span>
        </div>
      </div>
    </div>
  )
}
