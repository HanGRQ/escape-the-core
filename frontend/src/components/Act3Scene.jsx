import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DoctorK } from './DoctorK'
import { DDAFlash, DDAStatusBar, DDAFeedbackBanner } from './DDAFeedback'
import { usePlayerTracker } from '../hooks/usePlayerTracker'
import { PROMPT_TASK, quickEvaluate, generatePreview } from '../data/act3Data'
import { api } from '../api/client'

const ACCENT = '#27AE60'

// Score bar for each dimension
function ScoreDimension({ label, desc, score, tip }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: score ? '#00FF8820' : '#ffffff08', border: `1px solid ${score ? '#00FF8888' : '#ffffff22'}` }}>
        <span style={{ color: score ? '#00FF88' : '#ffffff33', fontSize: '10px' }}>
          {score ? '✓' : '·'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-xs tracking-wider" style={{ color: score ? '#00FF88' : '#E8F4FD66' }}>
          {label}
        </div>
        {!score && tip && (
          <div className="font-mono text-xs mt-0.5 opacity-60" style={{ color: '#F39C12' }}>
            {tip}
          </div>
        )}
      </div>
    </div>
  )
}

export function Act3Scene({ sessionId, userId, personaStage = 'ally', onComplete }) {
  const tracker = usePlayerTracker('room_3')
  const [phase, setPhase] = useState('teaching')
  const [teachText, setTeachText]   = useState('')
  const [isStreaming, setStreaming] = useState(false)
  const [teachDone, setTeachDone]  = useState(false)
  const streamRef = useRef(null)
  const [chatHistory, setChatHistory] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [ddaMessage, setDdaMessage]   = useState('')
  const [flashTrigger, setFlashTrigger] = useState(0)

  // Prompt lab state
  const [promptText, setPromptText]   = useState('')
  const [evaluation, setEvaluation]   = useState(null)
  const [submitted, setSubmitted]     = useState(false)
  const [taskComplete, setTaskComplete] = useState(false)
  const evalTimeoutRef = useRef(null)

  const sid = sessionId || 'offline'

  useEffect(() => {
    setStreaming(true)
    streamRef.current = api.streamTeach('room_3', sid, userId, {
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
    api.streamChat('room_3', { sessionId: sid, userId, message, history: chatHistory.filter(m => !m.streaming) }, {
      onChunk: chunk => setChatHistory(prev => {
        const u=[...prev]; const l=u[u.length-1]
        if(l?.role==='assistant') u[u.length-1]={...l,content:l.content+chunk}; return u
      }),
      onDone: () => { setChatHistory(prev => { const u=[...prev]; if(u[u.length-1]?.streaming) u[u.length-1]={...u[u.length-1],streaming:false}; return u }); setChatLoading(false) },
      onError: () => { setChatHistory(prev => { const u=[...prev]; if(u[u.length-1]?.streaming) u[u.length-1]={...u[u.length-1],content:'Error.',streaming:false}; return u }); setChatLoading(false) },
    })
  }, [sid, userId, chatHistory])

  // Live evaluation as user types (debounced 400ms)
  useEffect(() => {
    if (phase !== 'task') return
    clearTimeout(evalTimeoutRef.current)
    evalTimeoutRef.current = setTimeout(() => {
      setEvaluation(quickEvaluate(promptText))
    }, 400)
    return () => clearTimeout(evalTimeoutRef.current)
  }, [promptText, phase])

  const handleSubmit = useCallback(async () => {
    if (!promptText.trim()) return
    const result = quickEvaluate(promptText)
    setEvaluation(result)
    setSubmitted(true)
    tracker.recordAttempt(result.total >= 4, promptText)

    if (result.total < 4) {
      setFlashTrigger(n => n + 1)
      setDdaMessage(`Score: ${result.total}/5. Missing: ${result.missing.join(', ')}. Refine your prompt.`)
    }

    // Also call backend for Doctor K DDA feedback
    if (sessionId) {
      try {
        const res = await api.submitAnswer('room_3', {
          sessionId: sid, userId,
          isCorrect: result.total >= 4,
          timeTakenMs: 5000,
          answerGiven: promptText.slice(0, 200),
        })
        if (res.doctor_k_msg) {
          setDdaMessage(res.doctor_k_msg)
          setChatHistory(prev => [...prev, { role: 'assistant', content: res.doctor_k_msg }])
        }
      } catch {}
    }

    if (result.total >= 4) {
      setTimeout(() => setTaskComplete(true), 800)
    }
  }, [promptText, tracker, sid, userId])

  const handleComplete = useCallback(async () => {
    if (sessionId) { try { await api.completeRoom('room_3', { sessionId: sid, userId, score: 1.0 }) } catch {} }
    onComplete('full_unlock')
  }, [sid, userId, onComplete])

  const preview = generatePreview(promptText)

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 30% 10%, #031408 0%, #03080D 65%)' }}>
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `linear-gradient(${ACCENT} 1px, transparent 1px), linear-gradient(90deg, ${ACCENT} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      <DDAFlash trigger={flashTrigger} state={tracker.currentStatus} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${ACCENT}22`, background: '#03080D88' }}>
        <div className="flex items-center gap-4">
          <motion.div animate={{ opacity:[1,0.3,1] }} transition={{ duration:2, repeat:Infinity }} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }} />
            <span className="font-display text-xs tracking-widest" style={{ color: ACCENT }}>PROMPT LAB — SECTOR 3</span>
          </motion.div>
          <span className="opacity-20 font-display text-xs text-white">|</span>
          <span className="font-display text-xs tracking-widest opacity-40 text-white">ACT III — PROMPT ENGINEERING</span>
        </div>
        <DDAStatusBar status={tracker.currentStatus} consecutiveErrors={tracker.consecutiveErrors} />
      </div>

      <div className="relative z-10 flex-1 min-h-0">
        <AnimatePresence mode="wait">
          {phase === 'teaching' && (
            <motion.div key="teach" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="h-full">
              <DoctorK mode="fullscreen" persona={personaStage} streamingText={teachText} isStreaming={isStreaming}
                chatHistory={chatHistory} onSendMessage={sendChat} isChatLoading={chatLoading}
                teachingDone={teachDone} onBeginTask={() => { setPhase('task'); tracker.startAttemptTimer() }} />
            </motion.div>
          )}

          {phase === 'task' && (
            <motion.div key="task" initial={{ opacity:0 }} animate={{ opacity:1 }} className="h-full flex">
              {/* Sidebar */}
              <motion.div initial={{ width:'100%' }} animate={{ width:'280px' }} transition={{ duration:0.6, ease:[0.4,0,0.2,1] }}
                className="flex-shrink-0 flex flex-col h-full p-4 gap-3"
                style={{ borderRight:`1px solid ${ACCENT}22`, background:'#03080D66' }}>
                <DoctorK mode="sidebar" persona={personaStage} chatHistory={chatHistory}
                  onSendMessage={sendChat} isChatLoading={chatLoading} />
                <AnimatePresence>
                  {ddaMessage && (
                    <DDAFeedbackBanner status={tracker.currentStatus || 'CONFUSED'} message={ddaMessage} onDismiss={() => setDdaMessage('')} />
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Prompt Lab — split panel */}
              <div className="flex-1 min-w-0 flex flex-col p-5 gap-4 overflow-hidden">
                {/* Lab header */}
                <div className="flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-5" style={{ background: ACCENT }} />
                    <span className="font-display text-sm tracking-widest" style={{ color: ACCENT }}>
                      WATSONX // PROMPT LAB
                    </span>
                  </div>
                  {evaluation && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs opacity-50" style={{ color: ACCENT }}>SCORE</span>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="w-3 h-3 rounded-sm"
                            style={{ background: i <= evaluation.total ? ACCENT : `${ACCENT}22`, boxShadow: i <= evaluation.total ? `0 0 4px ${ACCENT}` : 'none' }} />
                        ))}
                      </div>
                      <span className="font-mono text-xs font-bold" style={{ color: ACCENT }}>
                        {evaluation.total}/5
                      </span>
                    </div>
                  )}
                </div>

                {/* Task brief */}
                <div className="flex-shrink-0 rounded-lg px-4 py-3" style={{ background: `${ACCENT}0A`, border: `1px solid ${ACCENT}22` }}>
                  <div className="font-display text-xs tracking-widest mb-1 opacity-60" style={{ color: ACCENT }}>TASK BRIEF</div>
                  <p className="font-mono text-xs leading-relaxed" style={{ color: '#E8F4FDcc' }}>
                    {PROMPT_TASK.context}
                  </p>
                </div>

                {/* Split: Input | Preview */}
                <div className="flex-1 min-h-0 flex gap-4">
                  {/* Left: Prompt input + score */}
                  <div className="flex-1 flex flex-col gap-3 min-w-0">
                    <div className="font-display text-xs tracking-widest opacity-50" style={{ color: ACCENT }}>
                      PROMPT INPUT
                    </div>
                    <textarea
                      value={promptText}
                      onChange={e => { setPromptText(e.target.value); setSubmitted(false) }}
                      placeholder={`Start writing your prompt here...\n\nTip: Begin with "You are a..."`}
                      className="flex-1 resize-none font-mono text-sm leading-relaxed outline-none p-4 rounded-lg"
                      style={{ background: '#0A1A0A', border: `1px solid ${ACCENT}33`, color: '#E8F4FD',
                               boxShadow: `inset 0 0 20px ${ACCENT}05` }}
                    />
                    {/* Dimension scores */}
                    {evaluation && (
                      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
                        className="rounded-lg p-3 space-y-2" style={{ background: '#0A1A0A', border: `1px solid ${ACCENT}22` }}>
                        {PROMPT_TASK.requirements.map(req => (
                          <ScoreDimension key={req.key} label={req.label} desc={req.desc}
                            score={evaluation.scores[req.key]} tip={evaluation.tips[req.key]} />
                        ))}
                      </motion.div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={handleSubmit}
                        disabled={!promptText.trim()}
                        className="flex-1 py-2.5 font-display text-xs tracking-widest rounded transition-all disabled:opacity-30"
                        style={{ border: `1px solid ${ACCENT}`, color: '#0D0404', background: ACCENT,
                                 boxShadow: promptText.trim() ? `0 0 20px ${ACCENT}44` : 'none' }}
                      >
                        [ SUBMIT PROMPT ]
                      </button>
                      {taskComplete && (
                        <motion.button initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
                          onClick={handleComplete}
                          className="px-5 py-2.5 font-display text-xs tracking-widest rounded"
                          style={{ border:'1px solid #9B59B6', color:'#0D0404', background:'#9B59B6',
                                   boxShadow:'0 0 24px #9B59B655' }}>
                          [ CONTINUE → ]
                        </motion.button>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px self-stretch" style={{ background: `${ACCENT}22` }} />

                  {/* Right: Preview */}
                  <div className="flex-1 flex flex-col gap-3 min-w-0">
                    <div className="font-display text-xs tracking-widest opacity-50" style={{ color: ACCENT }}>
                      OUTPUT PREVIEW
                    </div>
                    <div className="flex-1 rounded-lg p-4 overflow-auto"
                      style={{ background: '#0A1A0A', border: `1px solid ${ACCENT}22` }}>
                      {preview
                        ? <p className="font-mono text-sm leading-relaxed" style={{ color: '#E8F4FD88' }}>{preview}</p>
                        : <p className="font-mono text-xs opacity-25 italic" style={{ color: ACCENT }}>
                            Output preview will appear as you write your prompt…
                          </p>
                      }
                    </div>

                    {/* Good example toggle */}
                    <details className="group">
                      <summary className="font-display text-xs tracking-widest opacity-40 cursor-pointer hover:opacity-70 transition-opacity list-none flex items-center gap-2"
                        style={{ color: ACCENT }}>
                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                        EXAMPLE GOOD PROMPT
                      </summary>
                      <div className="mt-2 rounded-lg p-3" style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}22` }}>
                        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E8F4FD77' }}>
                          {PROMPT_TASK.sampleGoodPrompt}
                        </pre>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex items-center justify-end px-6 py-1.5 flex-shrink-0"
        style={{ borderTop:`1px solid ${ACCENT}15`, background:'#03080D66' }}>
        <span className="font-mono text-xs opacity-20">ESCAPE THE CORE — ACT III</span>
      </div>
    </div>
  )
}
