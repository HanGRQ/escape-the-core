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
 * KAvatar — the act-specific Doctor K portrait (doctor1-4.png).
 *
 * Two modes:
 *   - fill (default false): fixed pixel height via `size`, for small
 *     usages (FinaleScene top bar / certificate).
 *   - fill=true: stretches to fill its parent container completely —
 *     used by DoctorK's header, which itself is sized to ~1/3 of the
 *     panel's height, so the portrait ends up large and prominent.
 *
 * In both modes the full image is shown via object-contain (never
 * cropped), and the character appears to hover just above a glowing
 * platform/dais, bobbing gently — reinforcing the "data flowing" feel.
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
            style={{ filter: 'drop-shadow(0 8px 8px rgba(0,0,0,0.55))' }}
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

        {/* Glowing platform / dais — stays put while the character floats above it */}
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

  // ── Fixed-size mode (small usages, e.g. FinaleScene top bar / certificate) ──
  const boxW        = size * 0.82
  const platformH    = Math.max(7, size * 0.13)
  const platformGap  = size * 0.08

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

// ── A single message bubble in the Q&A / guidance feed ──────────────────────
// kind: 'chat' | 'dda' (DDA messages get a highlighted treatment)

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
              <p key={i} className="font-mono text-sm leading-[1.8]" style={{ color: '#E8F4FD' }}>{p}</p>
            ))}
          </div>
        ) : (
          msg.streaming && (
            <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
              className="inline-block w-1.5 h-3.5 align-middle" style={{ background: accent }} />
          )
        )}
        {msg.streaming && paras.length > 0 && (
          <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
            className="inline-block w-1.5 h-3.5 ml-1 align-middle" style={{ background: accent }} />
        )}
      </div>
    </motion.div>
  )
}

/**
 * DoctorK — persistent left-hand panel (parent controls width, ~1/3 screen).
 *
 * The header (portrait + name/label) occupies exactly 1/3 of the panel's
 * total height via `flex: 0 0 33%`, with the portrait filling almost all
 * of that space (KAvatar fill mode) — large and prominent, the visual
 * anchor of the sidebar.
 *
 * Teaching narration lives in TeachingPanel on the RIGHT. This panel
 * carries ONLY:
 *   - the player's questions and Doctor K's answers (chat)
 *   - Doctor K's in-task guidance (DDA hints after a wrong answer)
 *
 * Props:
 *   persona        persona stage key — controls accent colour + label
 *   avatarSrc      path to the act-specific portrait image
 *   feed           array of { role, content, streaming?, kind? } — chat + dda only
 *   onSendMessage  (text) => void
 *   isChatLoading  bool
 */
export function DoctorK({
  persona = 'cold',
  avatarSrc,
  feed = [],
  onSendMessage,
  isChatLoading = false,
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
      {/* Header — portrait dominates ~1/3 of the panel's height */}
      <div
        className="flex-shrink-0 flex flex-col items-center px-4 pt-3 pb-2 gap-1"
        style={{ flex: '0 0 33%', borderBottom: `1px solid ${s.accent}22` }}
      >
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          <KAvatar src={avatarSrc} accent={s.accent} fill />
        </div>
        <div className="text-center flex-shrink-0">
          <div className="font-display text-sm tracking-widest" style={{ color: s.accent }}>DOCTOR K</div>
          <div className="font-mono text-xs mt-1 opacity-50" style={{ color: s.accent }}>{s.label}</div>
        </div>
      </div>

      {/* Conversation feed — Q&A + task guidance ONLY (no teaching narration) */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {feed.length === 0 && (
          <p className="font-mono text-xs opacity-25 italic">
            Ask Doctor K a question, or wait for guidance during the task…
          </p>
        )}
        {feed.map((msg, i) => (
          <FeedMessage key={i} msg={msg} accent={s.accent} />
        ))}
      </div>

      {/* Input — always available */}
      <div className="flex gap-2 items-end flex-shrink-0 px-5 py-4"
        style={{ borderTop: `1px solid ${s.accent}22` }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Doctor K anything… (Enter to send)"
          rows={1}
          className="flex-1 resize-none font-mono text-sm text-system-white placeholder-white/20 outline-none px-3 py-2.5 rounded"
          style={{ background: '#1A0A0A', border: `1px solid ${s.accent}33` }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isChatLoading}
          className="px-4 py-2.5 rounded font-display text-xs tracking-widest transition-all disabled:opacity-25"
          style={{ border: `1px solid ${s.accent}66`, color: s.accent, background: `${s.accent}12` }}
        >
          SEND
        </button>
      </div>
    </div>
  )
}
