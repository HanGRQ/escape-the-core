import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DoctorK } from './DoctorK'
import { TeachingPanel } from './TeachingPanel'
import { DDAFlash, DDAStatusBar } from './DDAFeedback'
import { usePlayerTracker } from '../hooks/usePlayerTracker'
import { GRANITE_MODELS, MODEL_TASKS } from '../data/act2Data'
import { api } from '../api/client'

// Declared once, at the very top of the module — keeps the earlier
// "accentColor is not defined" crash from ever recurring (no nested or
// out-of-scope re-declaration anywhere in this file).
const ACCENT = '#3498DB'
const BG     = '/assets/backgrounds/background2.png'
const AVATAR = '/assets/doctors/doctor2.png'

// ── Model Card (draggable) ────────────────────────────────────────────────────
function ModelCard({ model, dragging, onDragStart, onDragEnd }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(model.id) }}
      onDragEnd={onDragEnd}
      className="rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none"
      style={{
        background: dragging === model.id ? `${model.color}18` : '#0A1628',
        border: `1px solid ${dragging === model.id ? model.color : model.color + '44'}`,
        boxShadow: dragging === model.id ? `0 0 20px ${model.color}55` : `0 0 8px ${model.color}11`,
        transition: 'all 0.15s',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: model.color, boxShadow: `0 0 6px ${model.color}` }} />
        <span className="font-display text-xs tracking-wider" style={{ color: model.color }}>
          {model.shortName}
        </span>
      </div>
      <p className="font-mono text-xs mt-1 opacity-60 leading-relaxed" style={{ color: '#E8F4FD' }}>
        {model.description}
      </p>
    </motion.div>
  )
}

// ── Task Slot (drop target) ───────────────────────────────────────────────────
function TaskSlot({ task, over, slotState, filledModel, onDragOver, onDragLeave, onDrop }) {
  const state = slotState || 'idle'
  const borderColor = state === 'correct' ? '#00FF88'
    : state === 'incorrect' ? '#C0392B'
    : over ? '#F39C12'
    : '#3498DB33'
  const bgColor = state === 'correct' ? '#00FF8808'
    : state === 'incorrect' ? '#C0392B10'
    : over ? '#F39C1208' : 'transparent'

  return (
    <motion.div
      onDragOver={e => { e.preventDefault(); onDragOver(task.id) }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(task.id) }}
      animate={state === 'incorrect' ? { x: [0, -4, 4, -4, 0] } : {}}
      transition={{ duration: 0.3 }}
      className="rounded-lg px-3 py-2.5 min-h-[58px] flex items-start gap-3"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        transition: 'all 0.2s',
        boxShadow: state === 'correct' ? `0 0 16px #00FF8822` : over ? `0 0 12px #F39C1222` : 'none',
      }}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {state === 'correct'
          ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: '#00FF8822', border: '1px solid #00FF8888' }}>
              <span style={{ color: '#00FF88', fontSize: '9px' }}>✓</span>
            </motion.div>
          : <div className="w-4 h-4 rounded-full opacity-30"
              style={{ border: '1px solid #3498DB' }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs leading-relaxed" style={{ color: '#E8F4FD99' }}>
          {task.scenario}
        </p>
        {filledModel && state !== 'correct' && (
          <div className="mt-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: filledModel.color }} />
            <span className="font-mono text-xs opacity-50" style={{ color: filledModel.color }}>
              {filledModel.shortName}
            </span>
          </div>
        )}
        {state === 'correct' && filledModel && (
          <div className="mt-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: filledModel.color }} />
            <span className="font-mono text-xs" style={{ color: filledModel.color, opacity: 0.8 }}>
              {filledModel.name}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Act II Scene ──────────────────────────────────────────────────────────────
export function Act2Scene({ sessionId, userId, personaStage = 'collaborative', onComplete }) {
  const tracker = usePlayerTracker('room_2')

  // 'teaching' — lecture streams in the RIGHT panel
  // 'task'     — model classification UI replaces the lecture
  const [phase, setPhase] = useState('teaching')

  const [teachText, setTeachText] = useState('')
  const [isStreaming, setStreaming] = useState(false)
  const [teachDone, setTeachDone] = useState(false)
  const streamRef = useRef(null)

  // Left-panel feed: ONLY chat Q&A + DDA task guidance
  const [feed, setFeed] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [flashTrigger, setFlashTrigger] = useState(0)

  // Drag state
  const [dragging, setDragging]   = useState(null)
  const [over, setOver]           = useState(null)
  const [slotFills, setSlotFills] = useState({})   // taskId → modelId
  const [slotState, setSlotState] = useState({})   // taskId → idle|correct|incorrect
  const [locked, setLocked]       = useState(new Set())  // locked modelIds

  const sid = sessionId || 'offline'

  // Start teaching
  useEffect(() => {
    setStreaming(true)
    streamRef.current = api.streamTeach('room_2', sid, userId, {
      onChunk: chunk => setTeachText(prev => prev + chunk),
      onDone: () => { setStreaming(false); setTeachDone(true) },
      onError: err => {
        setStreaming(false)
        setTeachText(prev => prev + `\n\n[ Error: ${err} ]`)
        setTeachDone(true)
      },
    })
    return () => streamRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendChat = useCallback((message) => {
    setFeed(prev => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '', streaming: true, kind: 'chat' },
    ])
    setChatLoading(true)
    const history = feed.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }))
    api.streamChat('room_2', { sessionId: sid, userId, message, history }, {
      onChunk: chunk => setFeed(prev => {
        const u = [...prev]; const l = u[u.length - 1]
        if (l?.role === 'assistant') u[u.length - 1] = { ...l, content: l.content + chunk }
        return u
      }),
      onDone: () => {
        setFeed(prev => { const u = [...prev]; if (u[u.length - 1]?.streaming) u[u.length - 1] = { ...u[u.length - 1], streaming: false }; return u })
        setChatLoading(false)
      },
      onError: () => {
        setFeed(prev => { const u = [...prev]; if (u[u.length - 1]?.streaming) u[u.length - 1] = { ...u[u.length - 1], content: 'Connection error.', streaming: false }; return u })
        setChatLoading(false)
      },
    })
  }, [sid, userId, feed])

  const handleDrop = useCallback((taskId) => {
    if (!dragging) return
    const task  = MODEL_TASKS.find(t => t.id === taskId)
    const model = GRANITE_MODELS.find(m => m.id === dragging)
    if (!task || !model || locked.has(dragging)) return

    const isCorrect = task.correctModel === dragging
    setSlotFills(prev => ({ ...prev, [taskId]: dragging }))
    setSlotState(prev => ({ ...prev, [taskId]: isCorrect ? 'correct' : 'incorrect' }))

    const timeTaken = tracker.recordAttempt(isCorrect, model.name)
    if (!isCorrect) {
      setFlashTrigger(n => n + 1)
      // Route the local hint into Doctor K's left-panel feed
      setFeed(prev => [...prev, { role: 'assistant', content: task.hint, kind: 'dda' }])
      setTimeout(() => {
        setSlotFills(prev => { const n = { ...prev }; delete n[taskId]; return n })
        setSlotState(prev => ({ ...prev, [taskId]: 'idle' }))
      }, 900)
    } else {
      setLocked(prev => new Set([...prev, dragging]))
    }

    api.submitAnswer('room_2', { sessionId: sid, userId, isCorrect, timeTakenMs: timeTaken, answerGiven: model.name })
      .then(res => {
        if (res?.doctor_k_msg) {
          setFeed(prev => [...prev, { role: 'assistant', content: res.doctor_k_msg, kind: 'dda' }])
        }
      })
      .catch(() => {})

    tracker.startAttemptTimer()
    setDragging(null)
    setOver(null)
  }, [dragging, locked, tracker, sid, userId])

  // Check completion
  useEffect(() => {
    if (locked.size === MODEL_TASKS.length) {
      setTimeout(async () => {
        try { await api.completeRoom('room_2', { sessionId: sid, userId, score: 1.0 }) } catch {}
        onComplete('caring')
      }, 1400)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked.size])

  const unlockedModels = GRANITE_MODELS.filter(m => !locked.has(m.id))

  return (
    <div className="relative w-full h-screen overflow-hidden flex">
      {/* Background image */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center',
      }} />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(2,8,16,0.55) 0%, rgba(2,8,16,0.85) 100%)',
      }} />
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{
        backgroundImage: `linear-gradient(${ACCENT} 1px, transparent 1px), linear-gradient(90deg, ${ACCENT} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      <DDAFlash trigger={flashTrigger} state={tracker.currentStatus} />

      {/* ── Left — Doctor K: Q&A + task guidance ONLY ── */}
      <div className="relative z-10 flex-shrink-0 h-full flex flex-col"
        style={{ width: '34%', borderRight: `1px solid ${ACCENT}33`, background: 'rgba(2,8,16,0.6)' }}>
        <div className="flex items-center px-5 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${ACCENT}22` }}>
          <span className="font-display text-xs tracking-widest opacity-50" style={{ color: ACCENT }}>
            ACT II — CORE CHAMBER REASSEMBLY
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
          style={{ borderBottom: `1px solid ${ACCENT}33`, background: 'rgba(2,8,16,0.5)' }}>
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }} />
            <span className="font-display text-xs tracking-widest" style={{ color: ACCENT }}>SERVER ROOM — SECTOR 2</span>
          </motion.div>
          <DDAStatusBar status={tracker.currentStatus} consecutiveErrors={tracker.consecutiveErrors} />
        </div>

        <div className="flex-1 min-h-0 p-6 overflow-auto" style={{ background: 'rgba(2,8,16,0.3)' }}>
          {phase === 'teaching' ? (
            <TeachingPanel
              accent={ACCENT}
              title="TRANSMISSION // CORE CHAMBER BRIEFING"
              text={teachText}
              isStreaming={isStreaming}
              teachDone={teachDone}
              onBeginTask={() => { setPhase('task'); tracker.startAttemptTimer() }}
            />
          ) : (
            <div className="flex gap-5 h-full">
              {/* Model cards */}
              <div className="w-44 flex-shrink-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4" style={{ background: ACCENT }} />
                  <span className="font-display text-xs tracking-widest" style={{ color: ACCENT }}>MODELS</span>
                </div>
                <AnimatePresence>
                  {unlockedModels.map(model => (
                    <ModelCard key={model.id} model={model} dragging={dragging}
                      onDragStart={id => { setDragging(id); tracker.startAttemptTimer() }}
                      onDragEnd={() => setDragging(null)} />
                  ))}
                </AnimatePresence>
                {unlockedModels.length === 0 && (
                  <p className="font-mono text-xs opacity-30 text-center py-4" style={{ color: ACCENT }}>All models deployed</p>
                )}
              </div>

              {/* Task slots */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4" style={{ background: '#5DADE2' }} />
                  <span className="font-display text-xs tracking-widest text-cold-cyan">TASK QUEUE</span>
                  <span className="font-mono text-xs opacity-30 ml-auto" style={{ color: ACCENT }}>
                    {locked.size}/{MODEL_TASKS.length} assigned
                  </span>
                </div>
                {MODEL_TASKS.map(task => (
                  <TaskSlot key={task.id} task={task} over={over === task.id}
                    slotState={slotState[task.id]} filledModel={GRANITE_MODELS.find(m => m.id === slotFills[task.id])}
                    onDragOver={id => setOver(id)} onDragLeave={() => setOver(null)}
                    onDrop={() => handleDrop(task.id)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-1.5 flex-shrink-0"
          style={{ borderTop: `1px solid ${ACCENT}22`, background: 'rgba(2,8,16,0.55)' }}>
          <span className="font-mono text-xs opacity-20">ESCAPE THE CORE — ACT II</span>
        </div>
      </div>
    </div>
  )
}
