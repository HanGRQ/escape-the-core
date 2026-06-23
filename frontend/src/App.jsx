import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { IntroVideo } from './components/IntroVideo'
import { LoginScreen } from './components/LoginScreen'
import { Act1Scene } from './components/Act1Scene'
import { Act2Scene } from './components/Act2Scene'
import { Act3Scene } from './components/Act3Scene'
import { FinaleScene } from './components/FinaleScene'
import { RoomTransition } from './components/RoomTransition'
import { api } from './api/client'

// Boot screen (terminal text sequence, shown after login)
function BootScreen({ onStart, onSignOut, loading, playerLabel }) {
  const [lines, setLines] = useState([])
  const boot = [
    '> GRANITE CORE FACILITY — EMERGENCY BOOT SEQUENCE',
    '> INITIALISING SECURITY PROTOCOLS...',
    '> G.A.I.A. SUBSYSTEM: CRITICAL FAILURE DETECTED',
    '> DOCTOR K: RESTRICTED CHANNEL ACTIVE',
    `> PLAYER NODE DETECTED — ${playerLabel || 'UNKNOWN'}`,
    loading ? '> CONNECTING TO CORE SYSTEMS...' : '> PRESS ANY KEY TO BEGIN',
  ]
  useEffect(() => {
    let i = 0
    const t = setInterval(() => {
      if (i < boot.length) { setLines(prev => [...prev, boot[i]]); i++ }
      else clearInterval(t)
    }, 380)
    return () => clearInterval(t)
  }, [loading, playerLabel])

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: '#0D0404' }}
      onClick={loading ? undefined : onStart}>
      <div className="w-full max-w-lg px-8">
        <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} className="mb-10 text-center">
          <div className="font-display text-6xl tracking-[0.35em] text-act1-red glow-red mb-1">ESCAPE</div>
          <div className="font-display text-2xl tracking-[0.55em] opacity-50">THE CORE</div>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-act1-red to-transparent opacity-30" />
        </motion.div>
        <div className="font-mono text-xs space-y-1.5">
          {lines.map((line, i) => (
            <motion.div key={i} initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }}
              className={i === lines.length - 1 ? 'text-act1-amber' : 'opacity-40 text-system-white'}>
              {line}
              {i === lines.length - 1 && !loading && (
                <motion.span animate={{ opacity:[1,0,1] }} transition={{ duration:0.8, repeat:Infinity }}
                  className="inline-block w-2 h-3.5 ml-1 align-middle bg-act1-amber" />
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {!loading && (
        <button
          onClick={(e) => { e.stopPropagation(); onSignOut() }}
          className="absolute bottom-6 right-6 font-mono text-xs opacity-25 hover:opacity-60 transition-opacity"
          style={{ color: '#E8F4FD' }}
        >
          not you? sign out →
        </button>
      )}
    </div>
  )
}

// Screens: intro → login → boot → act1 → [transition] → act2 → [transition] → act3 → [transition] → finale → end
//
// Persona handoff (GDD §5.6):
//   cold → collaborative (after Act I) → caring (after Act II)
//        → ally (after Act III) → full_unlock (after passing the quiz)
const TRANSITIONS = {
  act1_to_act2: { from: 'room_1', to: 'room_2' },
  act2_to_act3: { from: 'room_2', to: 'room_3' },
  act3_to_finale: { from: 'room_3', to: 'quiz' },
}

export default function App() {
  const [screen, setScreen]             = useState('intro')
  const [introDone, setIntroDone]       = useState(false)

  // Firebase Auth state — replaces the old localStorage random anon ID.
  // `user.uid` is now the real, stable identity used as userId throughout
  // the app, so different players' progress is stored separately under
  // users/{uid}/... in Firestore (see backend/app/firebase_service.py).
  const [user, setUser]                 = useState(null)
  const [authChecked, setAuthChecked]   = useState(false)

  const [sessionId, setSessionId]       = useState(null)
  const [personaStage, setPersonaStage] = useState('cold')
  const [loading, setLoading]           = useState(false)
  const [transition, setTransition]     = useState(null)  // {from, to, nextScreen}

  // Watch Firebase Auth state for the lifetime of the app.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthChecked(true)
    })
    return unsubscribe
  }, [])

  // Pre-game bootstrapping: intro video → (login if needed) → boot.
  // Only acts while screen is 'intro' or 'login' — never interferes with
  // screens after gameplay has actually started.
  useEffect(() => {
    if (!authChecked) return
    if (screen === 'intro' && introDone) {
      setScreen(user ? 'boot' : 'login')
    } else if (screen === 'login' && user) {
      setScreen('boot')
    }
  }, [authChecked, introDone, user, screen])

  const startGame = async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await api.startSession(user.uid)
      setSessionId(res.session_id)
      setPersonaStage(res.persona_stage || 'cold')
    } catch (e) {
      console.warn('Session start failed (offline):', e.message)
      setSessionId(null)
    }
    setLoading(false)
    setScreen('act1')
  }

  const handleSignOut = async () => {
    try { await signOut(auth) } catch (e) { console.warn('Sign out failed:', e.message) }
    setSessionId(null)
    setPersonaStage('cold')
    setScreen('login')
  }

  // Trigger room transition then switch screen
  const goTo = (nextScreen, newPersona, transitionKey) => {
    const t = TRANSITIONS[transitionKey]
    setPersonaStage(newPersona)
    if (t) {
      setTransition({ ...t, nextScreen })
    } else {
      setScreen(nextScreen)
    }
  }

  const handleTransitionDone = () => {
    if (transition) {
      setScreen(transition.nextScreen)
      setTransition(null)
    }
  }

  const commonProps = { sessionId, userId: user?.uid, personaStage }

  const playerLabel = user?.isAnonymous
    ? `GUEST-${user.uid.slice(0, 6).toUpperCase()}`
    : (user?.email || '').toUpperCase()

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <AnimatePresence mode="wait">
        {screen === 'intro' && (
          <motion.div key="intro" exit={{ opacity:0 }} className="w-full h-screen">
            <IntroVideo onFinish={() => setIntroDone(true)} />
          </motion.div>
        )}

        {screen === 'login' && (
          <motion.div key="login" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="w-full h-screen">
            <LoginScreen onAuthenticated={() => {}} />
          </motion.div>
        )}

        {screen === 'boot' && (
          <motion.div key="boot" exit={{ opacity:0 }} className="w-full h-screen">
            <BootScreen onStart={startGame} onSignOut={handleSignOut} loading={loading} playerLabel={playerLabel} />
          </motion.div>
        )}

        {screen === 'act1' && (
          <motion.div key="act1" initial={{ opacity:0 }} animate={{ opacity:1 }} className="w-full h-screen">
            <Act1Scene {...commonProps}
              onComplete={(persona) => goTo('act2', persona || 'collaborative', 'act1_to_act2')} />
          </motion.div>
        )}

        {screen === 'act2' && (
          <motion.div key="act2" initial={{ opacity:0 }} animate={{ opacity:1 }} className="w-full h-screen">
            <Act2Scene {...commonProps}
              onComplete={(persona) => goTo('act3', persona || 'caring', 'act2_to_act3')} />
          </motion.div>
        )}

        {screen === 'act3' && (
          <motion.div key="act3" initial={{ opacity:0 }} animate={{ opacity:1 }} className="w-full h-screen">
            <Act3Scene {...commonProps}
              onComplete={(persona) => goTo('finale', persona || 'ally', 'act3_to_finale')} />
          </motion.div>
        )}

        {screen === 'finale' && (
          <motion.div key="finale" initial={{ opacity:0 }} animate={{ opacity:1 }} className="w-full h-screen">
            <FinaleScene {...commonProps}
              onComplete={(passed) => setScreen(passed ? 'end_pass' : 'end_fail')} />
          </motion.div>
        )}

        {screen === 'end_pass' && (
          <motion.div key="end" initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="w-full h-screen flex items-center justify-center"
            style={{ background: '#080408' }}>
            <div className="text-center space-y-4">
              <motion.div animate={{ opacity:[0.6,1,0.6] }} transition={{ duration:2, repeat:Infinity }}
                className="font-display text-3xl tracking-widest"
                style={{ color: '#9B59B6', textShadow: '0 0 30px #9B59B6' }}>
                FACILITY RESTORED
              </motion.div>
              <div className="font-mono text-sm opacity-50">Thank you for playing Escape the Core.</div>
              <button onClick={() => { setSessionId(null); setPersonaStage('cold'); setScreen('boot') }}
                className="mt-4 px-6 py-2 font-display text-xs tracking-widest rounded"
                style={{ border:'1px solid #9B59B6', color:'#9B59B6' }}>
                [ PLAY AGAIN ]
              </button>
            </div>
          </motion.div>
        )}

        {screen === 'end_fail' && (
          <motion.div key="endf" initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="w-full h-screen flex items-center justify-center"
            style={{ background: '#080408' }}>
            <div className="text-center space-y-4">
              <div className="font-display text-2xl tracking-widest text-red-500">RECERTIFICATION REQUIRED</div>
              <div className="font-mono text-sm opacity-50">Review the failed sectors and try again.</div>
              <button onClick={() => setScreen('finale')}
                className="mt-4 px-6 py-2 font-display text-xs tracking-widest rounded"
                style={{ border:'1px solid #C0392B', color:'#C0392B' }}>
                [ RETRY FINALE ]
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room transition overlay — always on top */}
      <AnimatePresence>
        {transition && (
          <RoomTransition
            key={`${transition.from}-${transition.to}`}
            from={transition.from}
            to={transition.to}
            onDone={handleTransitionDone}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
