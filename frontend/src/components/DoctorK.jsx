import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { stripMarkdown } from '../utils/textFormat'

const PERSONA_STYLE = {
  cold:          { accent: '#C0392B', label: 'SECURITY AI' },
  collaborative: { accent: '#E67E22', label: 'COLLABORATIVE' },
  caring:        { accent: '#F39C12', label: 'CARING PROTOCOL' },
  ally:          { accent: '#5DADE2', label: 'ALLY MODE' },
  full_unlock:   { accent: '#00FF88', label: 'FULLY UNLOCKED' },
}

/**
 * KAvatar — the act-specific Doctor K portrait.
 * fill=true: stretches to fill parent container (used in sidebar header).
 * fill=false (default): fixed pixel size (used in FinaleScene top bar etc).
 */
export function KAvatar({ src, accent, size = 88, fill = false }) {
  if (fill) {
    return (
      <div className="relative w-full h-full flex flex-col items-center">
        <motion.div
          className="relative flex-1 min-h-0 w-full flex items-center justify-center"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img
            src={src}
            alt="Doctor K"
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))' }}
          />
          {/* Data-flow scanline sweep */}
          <motion.div
            className="absolute left-1/4 right-1/4 pointer-events-none"
            style={{ height: '30%', background: `linear-gradient(to bottom, transparent, ${accent}33, transparent)` }}
            animate={{ top: ['-35%', '115%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
          />
          {/* Subtle colour flicker */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: accent, mixBlendMode: 'overlay' }}
            animate={{ opacity: [0, 0.05, 0, 0.08, 0] }}
            transition={{ duration: 2.8, repeat: Infinity }}
          />
        </motion.div>
        {/* Glowing platform / dais */}
        <motion.div
          className="rounded-full pointer-events-none flex-shrink-0 mb-1"
          style={{
            width: '55%', height: 10,
            background: `radial-gradient(ellipse, ${accent}80 0%, ${accent}35 45%, transparent 80%)`,
          }}
          animate={{ opacity: [0.55, 1, 0.55], scaleX: [0.9, 1, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    )
  }

  // ── Fixed-size mode ──────────────────────────────────────────────────────
  const boxW       = size * 0.82
  const platformH  = Math.max(7, size * 0.13)
  const platformGap = size * 0.08

  return (
    <div
      className="relative flex-shrink-0 flex flex-col items-center"
      style={{ width: boxW, paddingBottom: platformH + platformGap }}
    >
      <motion.div
        className="relative"
        style={{ width: boxW, height: size }}
        animate={{ y: [0, -size * 0.07, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img
          src={src}
          alt="Doctor K"
          draggable={false}
          className="w-full h-full object-contain"
          style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))' }}
        />
        <motion.div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ height: '35%', background: `linear-gradient(to bottom, transparent, ${accent}33, transparent)` }}
          animate={{ top: ['-40%', '110%'] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: accent, mixBlendMode: 'overlay' }}
          animate={{ opacity: [0, 0.05, 0, 0.08, 0] }}
          transition={{ duration: 2.8, repeat: Infinity }}
        />
      </motion.div>
      <motion.div
        className="absolute bottom-0 rounded-full pointer-events-none"
        style={{
          width: boxW * 0.95,
          height: platformH,
          background: `radial-gradient(ellipse, ${accent}80 0%, ${accent}35 45%, transparent 80%)`,
        }}
        animate={{ opacity: [0.55, 1, 0.55], scaleX: [0.9, 1, 0.9] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

// ── A single message bubble ──────────────────────────────────────────────────

function FeedMessage({ msg, accent }) {
  const isUser = msg.role === 'user'
  const isDda  = msg.kind === 'dda'
  const paras  = (msg.content || '')
    .split(/\n\n+/)
    .map(p => stripMarkdown(p.trim()))
    .filter(Boolean)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={isUser ? 'self-end max-w-[85%]' : 'self-start w-full'}
    >
      <div className="text-xs font-display mb-1 opacity-40"
        style={{ color: isUser ? '#E8F4FD' : accent }}>
        {isUser ? 'YOU' : isDda ? 'DOCTOR K // GUIDANCE' : 'DOCTOR K'}
      </div>
      <div className="rounded-lg px-4 py-3"
        style={{
          background: isUser ? '#E8F4FD0B' : isDda ? `${accent}14` : `${accent}0A`,
          border: `1px solid ${isUser ? '#ffffff14' : isDda ? accent + '66' : accent + '28'}`,
          boxShadow: !isUser ? `0 0 16px ${accent}10` : 'none',
        }}>
        {paras.length > 0 ? (
          <div className="space-y-2.5">
            {paras.map((p, i) => (
              <p key={i} className="font-mono text-sm leading-[1.8]"
                style={{ color: '#E8F4FD' }}>{p}</p>
            ))}
          </div>
        ) : (
          msg.streaming && (
            <motion.span animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="inline-block w-1.5 h-3.5 align-middle"
              style={{ background: accent }} />
          )
        )}
        {msg.streaming && paras.length > 0 && (
          <motion.span animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="inline-block w-1.5 h-3.5 ml-1 align-middle"
            style={{ background: accent }} />
        )}
      </div>
    </motion.div>
  )
}

/**
 * DoctorK — persistent left-hand panel.
 *
 * The header (~1/3 of panel height) shows the act-specific portrait.
 * The feed carries Q&A + DDA guidance only (teaching lives in TeachingPanel).
 *
 * Props:
 *   persona          persona stage key
 *   avatarSrc        path to act-specific portrait
 *   feed             array of { role, content, streaming?, kind? }
 *   onSendMessage    (text) => void  — player sends a chat message
 *   isChatLoading    bool
 *   onRequestHint    () => void  — player clicks the HINT button
 *                    Connects to tracker.setHelpRequested() + api.getHint()
 *                    in the parent scene. When undefined, the button is hidden.
 *   hintDisabled     bool — disables HINT while a response is in-flight
 */
export function DoctorK({
  persona = 'cold',
  avatarSrc,
  feed = [],
  onSendMessage,
  isChatLoading = false,
  onRequestHint,
  hintDisabled = false,
}) {
  const s = PERSONA_STYLE[persona] || PERSONA_STYLE.cold
  const [input, setInput] = useState('')
  const feedRef = useRef(null)

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [feed])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || isChatLoading) return
    setInput('')
    onSendMessage?.(msg)
  }
  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">

      {/* Header — portrait dominates ~1/3 of panel height */}
      <div
        className="flex-shrink-0 flex items-center gap-4 px-4"
        style={{ flex: '0 0 25%', borderBottom: `1px solid ${s.accent}22` }}
      >
        {/* Avatar — sized to 80% of the header height so it fills the row */}
        <div className="flex-shrink-0 h-4/5 aspect-square">
          <KAvatar src={avatarSrc} accent={s.accent} fill />
        </div>
        <div className="min-w-0">
          <div className="font-display text-sm tracking-widest"
            style={{ color: s.accent }}>DOCTOR K</div>
          <div className="font-mono text-xs mt-1 opacity-50"
            style={{ color: s.accent }}>{s.label}</div>
        </div>
      </div>

      {/* Conversation feed — Q&A + task guidance ONLY */}
      <div ref={feedRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {feed.length === 0 && (
          <p className="font-mono text-xs opacity-25 italic">
            Ask Doctor K a question, or request a hint during the task…
          </p>
        )}
        {feed.map((msg, i) => (
          <FeedMessage key={i} msg={msg} accent={s.accent} />
        ))}
      </div>

      {/* Input row — chat textarea + HINT button + SEND button */}
      <div className="flex gap-2 items-end flex-shrink-0 px-5 py-4"
        style={{ borderTop: `1px solid ${s.accent}22` }}>

        {/* ── HINT button ─────────────────────────────────────────────────
            Visible only when the parent scene passes an onRequestHint
            handler (i.e. during the task phase, not during teaching).
            Clicking it calls tracker.setHelpRequested() in the scene,
            which triggers the DDA CONFUSED state and fires api.getHint()
            to get a RAG-grounded hint from Doctor K.              ────── */}
        {onRequestHint && (
          <button
            onClick={onRequestHint}
            disabled={hintDisabled}
            title="Ask for a hint — triggers the DDA help-seeking signal"
            className="flex-shrink-0 px-3 py-2.5 rounded font-display text-xs
                       tracking-widest transition-all disabled:opacity-25"
            style={{
              border: `1px solid ${s.accent}88`,
              color: s.accent,
              background: `${s.accent}18`,
            }}
          >
            HINT
          </button>
        )}

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Doctor K anything… (Enter to send)"
          rows={1}
          className="flex-1 resize-none font-mono text-sm text-system-white
                     placeholder-white/20 outline-none px-3 py-2.5 rounded"
          style={{ background: '#1A0A0A', border: `1px solid ${s.accent}33` }}
        />

        <button
          onClick={handleSend}
          disabled={!input.trim() || isChatLoading}
          className="px-4 py-2.5 rounded font-display text-xs tracking-widest
                     transition-all disabled:opacity-25"
          style={{
            border: `1px solid ${s.accent}66`,
            color: s.accent,
            background: `${s.accent}12`,
          }}
        >
          SEND
        </button>
      </div>
    </div>
  )
}
