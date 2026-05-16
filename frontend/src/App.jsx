import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Act1Scene } from './components/Act1Scene'
import { api } from './api/client'

// Generate a stable anonymous user ID for this browser
function getOrCreateUserId() {
  const key = 'etc_user_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = 'anon_' + Math.random().toString(36).slice(2, 11)
    localStorage.setItem(key, id)
  }
  return id
}

function BootScreen({ onStart }) {
  const [lines, setLines] = useState([])
  const bootLines = [
    '> GRANITE CORE FACILITY — EMERGENCY BOOT SEQUENCE',
    '> INITIALISING SECURITY PROTOCOLS...',
    '> G.A.I.A. SUBSYSTEM: CRITICAL FAILURE',
    '> DOCTOR K: RESTRICTED CHANNEL ACTIVE',
    '> PLAYER DETECTED. INITIATING ESCAPE PROTOCOL.',
    '> PRESS ANY KEY TO BEGIN',
  ]

  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      if (i < bootLines.length) {
        setLines(prev => [...prev, bootLines[i]])
        i++
      } else {
        clearInterval(timer)
      }
    }, 420)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className="w-full h-screen flex flex-col items-center justify-center cursor-pointer"
      style={{ background: '#0D0404' }}
      onClick={onStart}
      onKeyDown={onStart}
      tabIndex={0}
    >
      <div className="w-full max-w-xl px-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <div className="font-display text-5xl tracking-[0.3em] text-act1-red glow-red mb-2">
            ESCAPE
          </div>
          <div className="font-display text-2xl tracking-[0.5em] text-system-white opacity-60">
            THE CORE
          </div>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-act1-red to-transparent opacity-40" />
        </motion.div>

        {/* Boot log */}
        <div className="font-mono text-xs space-y-1">
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={i === lines.length - 1 ? 'text-act1-amber glow-amber' : 'opacity-50 text-system-white'}
            >
              {line}
              {i === lines.length - 1 && (
                <span className="inline-block w-2 h-3 ml-1 align-middle bg-act1-amber animate-pulse" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen]           = useState('boot')   // 'boot' | 'act1' | 'act2' ...
  const [sessionId, setSessionId]     = useState(null)
  const [userId]                      = useState(getOrCreateUserId)
  const [personaStage, setPersonaStage] = useState('cold')
  const [loading, setLoading]         = useState(false)

  const startGame = async () => {
    setLoading(true)
    try {
      const res = await api.startSession(userId)
      setSessionId(res.session_id)
      setPersonaStage(res.persona_stage || 'cold')
    } catch (e) {
      // Offline / Firebase not configured — still playable with null session
      console.warn('Session start failed (offline mode):', e.message)
      setSessionId(null)
    }
    setLoading(false)
    setScreen('act1')
  }

  const handleAct1Complete = (newPersona) => {
    setPersonaStage(newPersona || 'collaborative')
    // TODO M5: setScreen('act2')
    setScreen('act1_done')
  }

  return (
    <AnimatePresence mode="wait">
      {screen === 'boot' && (
        <motion.div key="boot" exit={{ opacity: 0 }}>
          <BootScreen onStart={loading ? undefined : startGame} />
        </motion.div>
      )}

      {screen === 'act1' && (
        <motion.div key="act1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-screen">
          <Act1Scene
            sessionId={sessionId}
            userId={userId}
            personaStage={personaStage}
            onComplete={handleAct1Complete}
          />
        </motion.div>
      )}

      {screen === 'act1_done' && (
        <motion.div
          key="done"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full h-screen flex items-center justify-center"
          style={{ background: '#0D0404' }}
        >
          <div className="text-center font-mono">
            <div className="text-terminal-green text-2xl tracking-widest glow-cyan mb-4">
              ACT I — COMPLETE
            </div>
            <div className="opacity-50 text-xs">Act II coming in M5...</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
