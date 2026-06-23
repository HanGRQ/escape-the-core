import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

const ACCENT = '#00A3E0'

function friendlyError(code) {
  const map = {
    'auth/invalid-email':        'That email address looks invalid.',
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-credential':   'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists with that email.',
    'auth/weak-password':        'Password should be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in window was closed before completing.',
    'auth/operation-not-allowed':'This sign-in method is not enabled for this project yet.',
    'auth/configuration-not-found': 'Firebase Auth is not configured — check frontend/.env.',
  }
  return map[code] || 'Something went wrong. Please try again.'
}

/**
 * LoginScreen — gates entry to the game behind Firebase Authentication.
 *
 * Three ways in:
 *   - Email/password (sign in or create an account)
 *   - Google sign-in
 *   - Continue as guest (Firebase Anonymous Auth — still a real, stable
 *     Firebase UID, so progress is still tracked separately per guest
 *     session, just without an email attached)
 *
 * This component doesn't manage navigation itself — App.jsx listens to
 * Firebase's onAuthStateChanged and advances the screen automatically
 * the moment any of these methods succeeds. `onAuthenticated` is an
 * optional callback for any extra UI flourish.
 */
export function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        await createUserWithEmailAndPassword(auth, email, password)
      }
      onAuthenticated?.()
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setBusy(true)
    try {
      await signInWithPopup(auth, googleProvider)
      onAuthenticated?.()
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setBusy(false)
    }
  }

  const handleGuest = async () => {
    setError('')
    setBusy(true)
    try {
      await signInAnonymously(auth)
      onAuthenticated?.()
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full h-screen flex items-center justify-center px-6" style={{ background: '#0D0404' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-lg p-8"
        style={{ background: '#1A0A0A', border: `1px solid ${ACCENT}33`, boxShadow: `0 0 40px ${ACCENT}15` }}
      >
        <div className="text-center mb-6">
          <div className="font-display text-xl tracking-widest" style={{ color: ACCENT }}>GRANITE CORE</div>
          <div className="font-mono text-xs mt-1 opacity-50" style={{ color: ACCENT }}>
            IDENTITY VERIFICATION REQUIRED
          </div>
        </div>

        <div className="flex gap-2 mb-5">
          <button
            type="button" onClick={() => setMode('signin')}
            className="flex-1 py-2 font-display text-xs tracking-widest rounded"
            style={{
              border: `1px solid ${ACCENT}55`,
              background: mode === 'signin' ? `${ACCENT}22` : 'transparent',
              color: ACCENT,
            }}
          >
            SIGN IN
          </button>
          <button
            type="button" onClick={() => setMode('signup')}
            className="flex-1 py-2 font-display text-xs tracking-widest rounded"
            style={{
              border: `1px solid ${ACCENT}55`,
              background: mode === 'signup' ? `${ACCENT}22` : 'transparent',
              color: ACCENT,
            }}
          >
            SIGN UP
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2.5 rounded font-mono text-sm text-system-white placeholder-white/25 outline-none"
            style={{ background: '#0D0404', border: `1px solid ${ACCENT}33` }}
          />
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" minLength={6}
            className="w-full px-3 py-2.5 rounded font-mono text-sm text-system-white placeholder-white/25 outline-none"
            style={{ background: '#0D0404', border: `1px solid ${ACCENT}33` }}
          />

          {error && (
            <p className="font-mono text-xs" style={{ color: '#C0392B' }}>{error}</p>
          )}

          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 font-display text-xs tracking-widest rounded disabled:opacity-40"
            style={{ border: `1px solid ${ACCENT}`, color: '#0D0404', background: ACCENT }}
          >
            {busy ? '...' : mode === 'signin' ? '[ SIGN IN ]' : '[ CREATE ACCOUNT ]'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: `${ACCENT}22` }} />
          <span className="font-mono text-xs opacity-30">OR</span>
          <div className="flex-1 h-px" style={{ background: `${ACCENT}22` }} />
        </div>

        <button
          onClick={handleGoogle} disabled={busy}
          className="w-full py-2.5 mb-3 font-display text-xs tracking-widest rounded disabled:opacity-40"
          style={{ border: `1px solid ${ACCENT}55`, color: ACCENT, background: 'transparent' }}
        >
          CONTINUE WITH GOOGLE
        </button>

        <button
          onClick={handleGuest} disabled={busy}
          className="w-full py-2 font-mono text-xs opacity-40 hover:opacity-70 transition-opacity"
          style={{ color: ACCENT }}
        >
          continue as guest →
        </button>
      </motion.div>
    </div>
  )
}
