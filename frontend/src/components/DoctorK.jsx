import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const PERSONA_STYLE = {
  cold:          { accent: '#C0392B', label: 'SECURITY AI',     glow: '#C0392B' },
  collaborative: { accent: '#E67E22', label: 'COLLABORATIVE',   glow: '#E67E22' },
  caring:        { accent: '#F39C12', label: 'CARING PROTOCOL', glow: '#F39C12' },
  ally:          { accent: '#5DADE2', label: 'ALLY MODE',       glow: '#5DADE2' },
  full_unlock:   { accent: '#00FF88', label: 'FULLY UNLOCKED',  glow: '#00FF88' },
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function KAvatar({ persona, size = 100 }) {
  const s = PERSONA_STYLE[persona] || PERSONA_STYLE.cold
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0" style={{ border: `1px solid ${s.accent}44`, borderRadius: '4px' }} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
        className="absolute" style={{ inset: size * 0.14, border: `1px solid ${s.accent}77`, transform: 'rotate(45deg)' }} />
      <motion.div animate={{ opacity: [0.5,1,0.5], scale: [0.92,1.04,0.92] }}
        transition={{ duration: 3.2, repeat: Infinity }}
        className="absolute inset-0 flex items-center justify-center">
        <span style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: size * 0.38, fontWeight: 700, color: s.accent,
          textShadow: `0 0 ${size*0.25}px ${s.glow}, 0 0 ${size*0.5}px ${s.glow}44`,
        }}>K</span>
      </motion.div>
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{
        background: `radial-gradient(circle, ${s.accent}12 0%, transparent 70%)`,
        filter: `blur(${size*0.18}px)`,
      }} />
    </div>
  )
}

// ── Typewriter ────────────────────────────────────────────────────────────────

function TypewriterPara({ text, speed = 16, onDone }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const idxRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    idxRef.current = 0
    const tick = () => {
      if (idxRef.current < text.length) {
        setDisplayed(text.slice(0, idxRef.current + 1))
        idxRef.current++
        timerRef.current = setTimeout(tick, speed)
      } else {
        setDone(true)
        onDone?.()
      }
    }
    timerRef.current = setTimeout(tick, speed)
    return () => clearTimeout(timerRef.current)
  }, [text])

  const skip = () => {
    clearTimeout(timerRef.current)
    setDisplayed(text)
    setDone(true)
    onDone?.()
  }

  return (
    <p className="font-mono text-base leading-[1.9] cursor-pointer select-none"
      style={{ color: '#E8F4FD' }} onClick={skip} title="Click to skip typing">
      {displayed}
      {!done && (
        <motion.span animate={{ opacity: [1,0,1] }} transition={{ duration: 0.6, repeat: Infinity }}
          className="inline-block w-2 h-4 ml-0.5 align-middle" style={{ background: '#E8F4FD66' }} />
      )}
    </p>
  )
}

// ── Chat message renderer — splits on \n\n for proper paragraphs ─────────────

function ChatMessage({ msg, accent }) {
  if (msg.role === 'user') {
    return (
      <div className="font-mono text-sm leading-relaxed" style={{ color: '#E8F4FD' }}>
        {msg.content}
      </div>
    )
  }

  // Assistant: split into paragraphs and render each with spacing
  const paras = msg.content
    ? msg.content.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    : []

  return (
    <div className="space-y-3">
      {paras.map((para, i) => (
        <p key={i} className="font-mono text-sm leading-[1.85]" style={{ color: '#E8F4FD' }}>
          {para}
        </p>
      ))}
      {/* Show streaming cursor on last para while loading */}
      {msg.streaming && paras.length === 0 && (
        <motion.span animate={{ opacity: [1,0,1] }} transition={{ duration: 0.6, repeat: Infinity }}
          className="inline-block w-1.5 h-3.5 align-middle" style={{ background: accent }} />
      )}
    </div>
  )
}

// ── Paragraph helpers ─────────────────────────────────────────────────────────

function splitParagraphs(text) {
  return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
}

// ── Main component ────────────────────────────────────────────────────────────

export function DoctorK({
  mode = 'fullscreen',
  persona = 'cold',
  streamingText = '',
  isStreaming = false,
  chatHistory = [],
  onSendMessage,
  isChatLoading = false,
  teachingDone = false,
  onBeginTask,
}) {
  const s = PERSONA_STYLE[persona] || PERSONA_STYLE.cold
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const chatRef = useRef(null)

  // Paragraph queue
  const [allParas, setAllParas]         = useState([])
  const [visibleCount, setVisibleCount] = useState(0)
  const [paraTyping, setParaTyping]     = useState(false)

  // Parse paragraphs from streaming text
  useEffect(() => {
    if (mode !== 'fullscreen') return
    const paras = splitParagraphs(streamingText)
    if (paras.length > allParas.length) {
      setAllParas(paras)
      if (visibleCount === 0 && paras.length > 0) {
        setVisibleCount(1)
        setParaTyping(true)
      }
    }
  }, [streamingText, mode])

  useEffect(() => {
    if (!isStreaming && allParas.length > 0 && visibleCount === 0) {
      setVisibleCount(1)
      setParaTyping(true)
    }
  }, [isStreaming])

  const currentPara    = allParas[visibleCount - 1] || ''
  const hasMore        = visibleCount < allParas.length
  const streamEnded    = !isStreaming && allParas.length > 0
  const showContinue   = !paraTyping && hasMore
  const showBeginTask  = !paraTyping && !hasMore && teachingDone && streamEnded

  const handleContinue = useCallback(() => {
    if (hasMore) { setVisibleCount(v => v + 1); setParaTyping(true) }
  }, [hasMore])

  const skipAll = useCallback(() => {
    const paras = splitParagraphs(streamingText)
    setAllParas(paras)
    setVisibleCount(paras.length)
    setParaTyping(false)
  }, [streamingText])

  // Chat
  const handleSend = () => {
    const msg = input.trim()
    if (!msg || isChatLoading) return
    setInput('')
    onSendMessage?.(msg)
  }
  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Auto-scroll chat area when new messages arrive
  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
      }, 50)
    }
  }, [chatHistory])

  // ── FULLSCREEN ──────────────────────────────────────────────────────────────
  if (mode === 'fullscreen') {
    return (
      <div className="flex h-full w-full overflow-hidden">

        {/* ── Left: avatar column ── */}
        <div className="flex flex-col items-center pt-10 px-6 gap-5 flex-shrink-0"
          style={{ width: '180px' }}>
          <KAvatar persona={persona} size={110} />
          <div className="text-center">
            <div className="font-display text-xs tracking-widest" style={{ color: s.accent }}>DOCTOR K</div>
            <div className="font-mono text-xs mt-1 opacity-40" style={{ color: s.accent }}>{s.label}</div>
          </div>
          {isStreaming && (
            <motion.div animate={{ opacity: [1,0.2,1] }} transition={{ duration: 1.2, repeat: Infinity }}
              className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.accent }} />
              <span className="font-mono text-xs" style={{ color: s.accent, opacity: 0.6 }}>TRANSMITTING</span>
            </motion.div>
          )}
          {allParas.length > 0 && (
            <div className="font-mono text-xs opacity-25 text-center" style={{ color: s.accent }}>
              {visibleCount} / {isStreaming ? '…' : allParas.length}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px self-stretch my-8 flex-shrink-0"
          style={{ background: `linear-gradient(${s.accent}55, ${s.accent}11)` }} />

        {/* ── Right: main content ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden px-8 py-7 gap-5">

          {/* Header */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-1 h-5" style={{ background: s.accent }} />
            <span className="font-display text-sm tracking-widest" style={{ color: s.accent }}>
              TRANSMISSION // SECTOR BRIEFING
            </span>
          </div>

          {/* ── Teaching paragraph — always visible ── */}
          <div className="flex-shrink-0 max-w-3xl">
            <AnimatePresence mode="wait">
              {currentPara && (
                <motion.div
                  key={visibleCount}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-lg px-8 py-6"
                  style={{
                    background: `linear-gradient(135deg, ${s.accent}09 0%, #0D040488 100%)`,
                    border: `1px solid ${s.accent}25`,
                    boxShadow: `0 0 32px ${s.accent}08`,
                  }}
                >
                  <TypewriterPara
                    key={`para-${visibleCount}`}
                    text={currentPara}
                    speed={16}
                    onDone={() => setParaTyping(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* CONTINUE / BEGIN TASK / skip */}
            <div className="mt-5 flex items-center gap-4">
              <AnimatePresence>
                {showContinue && (
                  <motion.button
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    onClick={handleContinue}
                    className="px-7 py-2.5 font-display text-sm tracking-widest rounded transition-all"
                    style={{ border: `1px solid ${s.accent}`, color: s.accent, background: `${s.accent}12` }}
                    onMouseEnter={e => e.currentTarget.style.background = `${s.accent}28`}
                    onMouseLeave={e => e.currentTarget.style.background = `${s.accent}12`}
                  >
                    [ CONTINUE → ]
                  </motion.button>
                )}
                {showBeginTask && (
                  <motion.button
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    onClick={onBeginTask}
                    className="px-7 py-2.5 font-display text-sm tracking-widest rounded"
                    style={{ border: `1px solid ${s.accent}`, color: '#0D0404', background: s.accent,
                             boxShadow: `0 0 28px ${s.accent}55` }}
                  >
                    [ BEGIN TASK → ]
                  </motion.button>
                )}
              </AnimatePresence>
              {(isStreaming || paraTyping || hasMore) && (
                <button onClick={skipAll}
                  className="font-mono text-xs opacity-25 hover:opacity-55 transition-opacity"
                  style={{ color: s.accent }}>
                  skip all
                </button>
              )}
            </div>
          </div>

          {/* ── Divider between teaching and chat ── */}
          {chatHistory.length > 0 && (
            <div className="flex items-center gap-3 flex-shrink-0 max-w-3xl">
              <div className="flex-1 h-px" style={{ background: `${s.accent}22` }} />
              <span className="font-display text-xs tracking-widest opacity-40" style={{ color: s.accent }}>
                Q&A
              </span>
              <div className="flex-1 h-px" style={{ background: `${s.accent}22` }} />
            </div>
          )}

          {/* ── Chat history — scrollable, below teaching ── */}
          {chatHistory.length > 0 && (
            <div
              ref={chatRef}
              className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 pr-2 max-w-3xl"
            >
              {chatHistory.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={msg.role === 'user' ? 'self-end max-w-[72%]' : 'self-start w-full'}
                >
                  {/* Role label */}
                  <div className="text-xs font-display mb-1.5 opacity-40"
                    style={{ color: msg.role === 'user' ? '#E8F4FD' : s.accent }}>
                    {msg.role === 'user' ? 'YOU' : 'DOCTOR K'}
                  </div>

                  {/* Bubble */}
                  <div className="rounded-lg px-5 py-4"
                    style={{
                      background: msg.role === 'user' ? '#E8F4FD0B' : `${s.accent}0C`,
                      border: `1px solid ${msg.role === 'user' ? '#ffffff14' : s.accent + '30'}`,
                      boxShadow: msg.role === 'assistant' ? `0 0 20px ${s.accent}08` : 'none',
                    }}>
                    <ChatMessage msg={msg} accent={s.accent} />
                  </div>
                </motion.div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* ── BEGIN TASK — shown at bottom when chat active and teaching done ── */}
          {chatHistory.length > 0 && teachingDone && !paraTyping && !hasMore && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex-shrink-0 max-w-3xl">
              <button
                onClick={onBeginTask}
                className="px-7 py-2.5 font-display text-sm tracking-widest rounded"
                style={{ border: `1px solid ${s.accent}`, color: '#0D0404', background: s.accent,
                         boxShadow: `0 0 28px ${s.accent}55` }}
              >
                [ BEGIN TASK → ]
              </button>
            </motion.div>
          )}

          {/* ── Chat input ── */}
          <div className="flex gap-3 items-end flex-shrink-0 max-w-3xl">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Doctor K anything about the concepts… (Enter to send)"
              rows={2}
              className="flex-1 resize-none font-mono text-sm text-system-white placeholder-white/20 outline-none px-4 py-3 rounded"
              style={{ background: '#1A0A0A', border: `1px solid ${s.accent}33` }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isChatLoading}
              className="px-5 py-3 rounded font-display text-xs tracking-widest transition-all disabled:opacity-25"
              style={{ border: `1px solid ${s.accent}66`, color: s.accent, background: `${s.accent}12` }}
            >
              SEND
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ── SIDEBAR ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-3 flex-shrink-0">
        <KAvatar persona={persona} size={44} />
        <div>
          <div className="font-display text-xs tracking-widest" style={{ color: s.accent }}>DOCTOR K</div>
          <div className="font-mono text-xs opacity-40" style={{ color: s.accent }}>{s.label}</div>
        </div>
      </div>
      <div className="h-px flex-shrink-0"
        style={{ background: `linear-gradient(90deg, ${s.accent}44, transparent)` }} />

      <div ref={chatRef} className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
        {chatHistory.map((msg, i) => (
          <div key={i}>
            <div className="text-xs font-display mb-1 opacity-40"
              style={{ color: msg.role === 'user' ? '#E8F4FD' : s.accent }}>
              {msg.role === 'user' ? 'YOU' : 'DR.K'}
            </div>
            <div className="rounded px-3 py-2.5"
              style={{
                background: msg.role === 'user' ? '#E8F4FD08' : `${s.accent}0A`,
                border: `1px solid ${msg.role === 'user' ? '#ffffff11' : s.accent + '22'}`,
              }}>
              <ChatMessage msg={msg} accent={s.accent} />
            </div>
          </div>
        ))}
        {chatHistory.length === 0 && (
          <p className="font-mono text-xs opacity-25 italic">Ask Doctor K anything…</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a question…"
          className="flex-1 bg-transparent font-mono text-xs text-system-white placeholder-white/20 outline-none px-3 py-2 rounded"
          style={{ border: `1px solid ${s.accent}33`, background: '#1A0A0A88' }}
        />
        <button onClick={handleSend} disabled={!input.trim() || isChatLoading}
          className="px-3 py-2 rounded font-display text-xs transition-all disabled:opacity-30"
          style={{ border: `1px solid ${s.accent}55`, color: s.accent }}>
          →
        </button>
      </div>
    </div>
  )
}
