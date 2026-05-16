import { useState, useEffect, useRef } from 'react'

/**
 * useTypewriter — renders text character by character.
 * @param {string} text - The full text to display
 * @param {number} speed - Ms per character (default 28)
 * @param {boolean} active - Start typing when true
 */
export function useTypewriter(text, speed = 28, active = true) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!active) return
    setDisplayed('')
    setDone(false)
    indexRef.current = 0

    const type = () => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
        timerRef.current = setTimeout(type, speed)
      } else {
        setDone(true)
      }
    }

    timerRef.current = setTimeout(type, speed)
    return () => clearTimeout(timerRef.current)
  }, [text, speed, active])

  // Allow instant skip
  const skip = () => {
    clearTimeout(timerRef.current)
    setDisplayed(text)
    setDone(true)
    indexRef.current = text.length
  }

  return { displayed, done, skip }
}
