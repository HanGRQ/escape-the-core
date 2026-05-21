import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DoctorK } from './DoctorK'
import { DDAFlash, DDAStatusBar, DDAFeedbackBanner } from './DDAFeedback'
import { usePlayerTracker } from '../hooks/usePlayerTracker'
import { GRANITE_MODELS, MODEL_TASKS } from '../data/act2Data'
import { api } from '../api/client'

// ── Model Card (draggable) ────────────────────────────────────────────────────
function ModelCard({ model, dragging, onDragStart, onDragEnd, locked }) {
  if (locked) return null
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
      animate={state === 'incorrect' ? { x: [0,-4,4,-4,0] } : {}}
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
  const [phase, setPhase] = useState('teaching')   // 'teaching' | 'task'
  const [teachText, setTeachText]     = useState('')
  const [isStreaming, setStreaming]   = useState(false)
  const [teachDone, setTeachDone]    = useState(false)
  const streamRef = useRef(null)
  const [chatHistory, setChatHistory] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [ddaMessage, setDdaMessage]   = useState('')
  const [flashTrigger, setFlashTrigger] = useState(0)

  // Drag state
  const [dragging, setDragging]   = useState(null)
  const [over, setOver]           = useState(null)
  const [slotFills, setSlotFills] = useState({})   // taskId → modelId
  const [slotState, setSlotState] = useState({})   // taskId → idle|correct|incorrect
  const [locked, setLocked]       = useState(new Set())  // locked modelIds
  const [activeHint, setActiveHint] = useState(null)

  const sid = sessionId || 'offline'

  // Start teaching
  useEffect(() => {
    setStreaming(true)
    streamRef.current = api.streamTeach('room_2', sid, userId, {
      onChunk: chunk => setTeachText(prev => prev + chunk),
      onDone:  () => { setStreaming(false); setTeachDone(true) },
      onError: err => { setStreaming(false); setTeachText(prev => prev + `\n\n[ Error: ${err} ]`); setTeachDone(true) },
    })
    return () => streamRef.current?.abort()
  }, [])

  const sendChat = useCallback((message) => {
    setChatHistory(prev => [...prev, { role: 'user', content: message }])
    setChatLoading(true)
    setChatHistory(prev => [...prev, { role: 'assistant', content: '', streaming: true }])
    api.streamChat('room_2', { sessionId: sid, userId, message, history: chatHistory.filter(m => !m.streaming) }, {
      onChunk: chunk => setChatHistory(prev => {
        const u = [...prev]; const l = u[u.length-1]
        if (l?.role === 'assistant') u[u.length-1] = { ...l, content: l.content + chunk }
        return u
      }),
      onDone: () => { setChatHistory(prev => { const u=[...prev]; if(u[u.length-1]?.streaming) u[u.length-1]={...u[u.length-1],streaming:false}; return u }); setChatLoading(false) },
      onError: () => { setChatHistory(prev => { const u=[...prev]; if(u[u.length-1]?.streaming) u[u.length-1]={...u[u.length-1],content:'Connection error.',streaming:false}; return u }); setChatLoading(false) },
    })
  }, [sid, userId, chatHistory])

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
      setActiveHint(task.hint)
      setTimeout(() => {
        setSlotFills(prev => { const n={...prev}; delete n[taskId]; return n })
        setSlotState(prev => ({ ...prev, [taskId]: 'idle' }))
      }, 900)
    } else {
      setLocked(prev => new Set([...prev, dragging]))
      setActiveHint(null)
    }

    if (sessionId) {
      api.submitAnswer('room_2', { sessionId: sid, userId, isCorrect, timeTakenMs: timeTaken, answerGiven: model.name })
        .then(res => { if (res.doctor_k_msg) { setDdaMessage(res.doctor_k_msg); setChatHistory(prev => [...prev, { role: 'assistant', content: res.doctor_k_msg }]) } })
        .catch(() => {})
    }
    tracker.startAttemptTimer()
    setDragging(null)
    setOver(null)
  }, [dragging, locked, tracker, sid, userId])

  // Check completion
  useEffect(() => {
    if (locked.size === MODEL_TASKS.length) {
      setTimeout(async () => {
        if (sessionId) { try { await api.completeRoom('room_2', { sessionId: sid, userId, score: 1.0 }) } catch {} }
        onComplete('caring')
      }, 1400)
    }
  }, [locked.size])

  const unlockedModels = GRANITE_MODELS.filter(m => !locked.has(m.id))
  const accentColor = '#3498DB'

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 30% 10%, #061428 0%, #020810 65%)' }}>
      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `linear-gradient(${accentColor} 1px, transparent 1px), linear-gradient(90deg, ${accentColor} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      <DDAFlash trigger={flashTrigger} state={tracker.currentStatus} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${accentColor}22`, background: '#02081088' }}>
        <div className="flex items-center gap-4">
          <motion.div animate={{ opacity: [1,0.3,1] }} transition={{ duration: 2, repeat: Infinity }}
            className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor, boxShadow: `0 0 5px ${accentColor}` }} />
            <span className="font-display text-xs tracking-widest" style={{ color: accentColor }}>SERVER ROOM — SECTOR 2</span>
          </motion.div>
          <span className="opacity-20 font-display text-xs text-white">|</span>
          <span className="font-display text-xs tracking-widest opacity-40 text-white">ACT II — MODEL CLASSIFICATION</span>
        </div>
        <DDAStatusBar status={tracker.currentStatus} consecutiveErrors={tracker.consecutiveErrors} />
      </div>

      {/* Main */}
      <div className="relative z-10 flex-1 min-h-0">
        <AnimatePresence mode="wait">
          {phase === 'teaching' && (
            <motion.div key="teach" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <DoctorK mode="fullscreen" persona={personaStage} streamingText={teachText} isStreaming={isStreaming}
                chatHistory={chatHistory} onSendMessage={sendChat} isChatLoading={chatLoading}
                teachingDone={teachDone} onBeginTask={() => { setPhase('task'); tracker.startAttemptTimer() }} />
            </motion.div>
          )}

          {phase === 'task' && (
            <motion.div key="task" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex">
              {/* Sidebar */}
              <motion.div initial={{ width: '100%' }} animate={{ width: '300px' }} transition={{ duration: 0.6, ease: [0.4,0,0.2,1] }}
                className="flex-shrink-0 flex flex-col h-full p-4 gap-3"
                style={{ borderRight: `1px solid ${accentColor}22`, background: '#02081066' }}>
                <DoctorK mode="sidebar" persona={personaStage} chatHistory={chatHistory}
                  onSendMessage={sendChat} isChatLoading={chatLoading} />
                <AnimatePresence>
                  {ddaMessage && tracker.currentStatus !== 'FLOW' && (
                    <DDAFeedbackBanner status={tracker.currentStatus} message={ddaMessage} onDismiss={() => setDdaMessage('')} />
                  )}
                </AnimatePresence>
                {activeHint && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded px-3 py-2" style={{ background: '#F39C1210', border: '1px solid #F39C1244' }}>
                    <span className="font-display text-xs" style={{ color: '#F39C12' }}>HINT // </span>
                    <p className="font-mono text-xs mt-1" style={{ color: '#F39C12', opacity: 0.85 }}>{activeHint}</p>
                  </motion.div>
                )}
              </motion.div>

              {/* Task area */}
              <div className="flex-1 min-w-0 p-5 overflow-auto flex gap-5">
                {/* Model cards */}
                <div className="w-44 flex-shrink-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4" style={{ background: accentColor }} />
                    <span className="font-display text-xs tracking-widest" style={{ color: accentColor }}>MODELS</span>
                  </div>
                  <AnimatePresence>
                    {unlockedModels.map(model => (
                      <ModelCard key={model.id} model={model} dragging={dragging}
                        onDragStart={id => { setDragging(id); tracker.startAttemptTimer() }}
                        onDragEnd={() => setDragging(null)} locked={false} />
                    ))}
                  </AnimatePresence>
                  {unlockedModels.length === 0 && (
                    <p className="font-mono text-xs opacity-30 text-center py-4" style={{ color: accentColor }}>All models deployed</p>
                  )}
                </div>

                {/* Task slots */}
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4" style={{ background: '#5DADE2' }} />
                    <span className="font-display text-xs tracking-widest text-cold-cyan">TASK QUEUE</span>
                    <span className="font-mono text-xs opacity-30 ml-auto" style={{ color: accentColor }}>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex items-center justify-end px-6 py-1.5 flex-shrink-0"
        style={{ borderTop: `1px solid ${accentColor}15`, background: '#02081066' }}>
        <span className="font-mono text-xs opacity-20">ESCAPE THE CORE — ACT II</span>
      </div>
    </div>
  )
}
