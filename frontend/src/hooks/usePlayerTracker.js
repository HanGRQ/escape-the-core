import { useState, useCallback, useRef } from 'react'

// GDD §5.4 — DDA thresholds
const SLOW_MULTIPLIER        = 2.0
const MIN_TIMES_FOR_SLOW     = 3
const CONSECUTIVE_STRUGGLING = 2
const CONSECUTIVE_STUCK      = 3

/**
 * usePlayerTracker — mirrors the backend DDAEngine in the frontend.
 * Provides instant UI feedback (zero latency) before the backend responds.
 * Backend is called async to log events and generate Doctor K responses.
 */
export function usePlayerTracker(roomId) {
  const startTimeRef = useRef(Date.now())

  const [state, setState] = useState({
    attempts:          0,
    consecutiveErrors: 0,
    reactionTimes:     [],
    helpRequested:     false,
    currentStatus:     'FLOW',   // 'FLOW' | 'CONFUSED' | 'STRUGGLING' | 'STUCK'
    lastAnswerTime:    null,
  })

  const startAttemptTimer = useCallback(() => {
    startTimeRef.current = Date.now()
  }, [])

  const recordAttempt = useCallback((isCorrect, answerGiven = '') => {
    const timeTaken = Date.now() - startTimeRef.current

    setState(prev => {
      const newTimes  = [...prev.reactionTimes, timeTaken]
      const consErr   = isCorrect ? 0 : prev.consecutiveErrors + 1

      // Compute DDA status
      let status = 'FLOW'

      if (consErr >= CONSECUTIVE_STUCK) {
        status = 'STUCK'
      } else if (consErr >= CONSECUTIVE_STRUGGLING) {
        status = 'STRUGGLING'
      } else if (prev.helpRequested) {
        status = 'CONFUSED'
      } else if (newTimes.length >= MIN_TIMES_FOR_SLOW) {
        const avg = newTimes.slice(0, -1).reduce((a, b) => a + b, 0) / (newTimes.length - 1)
        if (avg > 0 && timeTaken > avg * SLOW_MULTIPLIER) {
          status = 'CONFUSED'
        }
      }

      return {
        ...prev,
        attempts:          prev.attempts + 1,
        consecutiveErrors: consErr,
        reactionTimes:     newTimes,
        currentStatus:     status,
        lastAnswerTime:    timeTaken,
      }
    })

    return timeTaken
  }, [])

  const setHelpRequested = useCallback(() => {
    setState(prev => ({
      ...prev,
      helpRequested: true,
      currentStatus: prev.currentStatus === 'FLOW' ? 'CONFUSED' : prev.currentStatus,
    }))
  }, [])

  const reset = useCallback(() => {
    setState({
      attempts:          0,
      consecutiveErrors: 0,
      reactionTimes:     [],
      helpRequested:     false,
      currentStatus:     'FLOW',
      lastAnswerTime:    null,
    })
    startTimeRef.current = Date.now()
  }, [])

  return {
    ...state,
    startAttemptTimer,
    recordAttempt,
    setHelpRequested,
    reset,
  }
}
