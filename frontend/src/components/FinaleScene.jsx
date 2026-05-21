import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QUIZ_QUESTIONS, PASS_THRESHOLD } from '../data/quizData'
import { api } from '../api/client'

const ACCENT = '#9B59B6'

function QuizQuestion({ question, onAnswer, answered, selected }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl w-full"
    >
      {/* Act badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className="px-2 py-0.5 rounded font-display text-xs tracking-widest"
          style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
          ACT {question.act}
        </div>
        <div className="h-px flex-1" style={{ background: `${ACCENT}22` }} />
      </div>

      {/* Question */}
      <div className="rounded-xl px-7 py-6 mb-5"
        style={{ background: `${ACCENT}09`, border: `1px solid ${ACCENT}25` }}>
        <p className="font-mono text-base leading-relaxed" style={{ color: '#E8F4FD', lineHeight: '1.8' }}>
          {question.text}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map(opt => {
          const isSelected = selected === opt.id
          const isCorrect  = answered && opt.id === question.correct
          const isWrong    = answered && isSelected && opt.id !== question.correct
          return (
            <motion.button
              key={opt.id}
              onClick={() => !answered && onAnswer(opt.id)}
              whileHover={!answered ? { scale: 1.01 } : {}}
              className="w-full text-left px-5 py-3.5 rounded-lg font-mono text-sm transition-all"
              style={{
                background: isCorrect ? '#00FF8814' : isWrong ? '#C0392B14' : isSelected ? `${ACCENT}14` : '#0D040A',
                border: `1px solid ${isCorrect ? '#00FF8877' : isWrong ? '#C0392B77' : isSelected ? ACCENT : ACCENT + '28'}`,
                color: isCorrect ? '#00FF88' : isWrong ? '#C0392B' : '#E8F4FD',
                cursor: answered ? 'default' : 'pointer',
                boxShadow: isCorrect ? '0 0 16px #00FF8822' : isWrong ? '0 0 16px #C0392B22' : 'none',
              }}
            >
              <span style={{ color: ACCENT + '66', marginRight: '10px' }}>{opt.id.toUpperCase()}.</span>
              {opt.text}
            </motion.button>
          )
        })}
      </div>

      {/* Explanation */}
      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-lg px-5 py-4"
            style={{
              background: selected === question.correct ? '#00FF8810' : '#C0392B10',
              border: `1px solid ${selected === question.correct ? '#00FF8844' : '#C0392B44'}`,
            }}
          >
            <div className="font-display text-xs tracking-widest mb-2"
              style={{ color: selected === question.correct ? '#00FF88' : '#C0392B' }}>
              {selected === question.correct ? '✓ CORRECT' : '✗ INCORRECT'}
            </div>
            <p className="font-mono text-sm leading-relaxed" style={{ color: '#E8F4FDcc' }}>
              {question.explanation}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Certificate({ score, total, onContinue }) {
  const passed = score / total >= PASS_THRESHOLD
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center justify-center h-full px-8 gap-8"
    >
      {/* Radial glow */}
      <motion.div className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 3, repeat: Infinity }}
        style={{ background: `radial-gradient(ellipse at center, ${passed ? '#9B59B633' : '#C0392B22'} 0%, transparent 65%)` }} />

      {/* Certificate frame */}
      <div className="relative max-w-2xl w-full rounded-2xl p-10 text-center"
        style={{
          background: `linear-gradient(135deg, ${ACCENT}0D 0%, #080408 100%)`,
          border: `1px solid ${passed ? ACCENT : '#C0392B'}66`,
          boxShadow: `0 0 60px ${passed ? ACCENT : '#C0392B'}22`,
        }}>
        {/* Corner marks */}
        {['top-3 left-3','top-3 right-3','bottom-3 left-3','bottom-3 right-3'].map(p => (
          <div key={p} className={`absolute ${p} w-5 h-5`} style={{
            borderTop: p.includes('bottom') ? 'none' : `1px solid ${ACCENT}55`,
            borderBottom: p.includes('top') ? 'none' : `1px solid ${ACCENT}55`,
            borderLeft: p.includes('right') ? 'none' : `1px solid ${ACCENT}55`,
            borderRight: p.includes('left') ? 'none' : `1px solid ${ACCENT}55`,
          }} />
        ))}

        <div className="font-display text-xs tracking-[0.5em] mb-6 opacity-50" style={{ color: ACCENT }}>
          GRANITE CORE FACILITY
        </div>

        {passed ? (
          <>
            <motion.div
              animate={{ textShadow: [`0 0 20px ${ACCENT}`, `0 0 40px ${ACCENT}`, `0 0 20px ${ACCENT}`] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="font-display text-5xl tracking-widest mb-3" style={{ color: ACCENT }}>
              CERTIFIED
            </motion.div>
            <div className="font-display text-sm tracking-widest opacity-60 mb-8" style={{ color: ACCENT }}>
              AI FUNDAMENTALS — ESCAPE THE CORE
            </div>
            <div className="font-mono text-lg mb-2" style={{ color: '#E8F4FD' }}>
              Final Score: <span style={{ color: ACCENT }}>{score}/{total}</span>
            </div>
            <div className="font-mono text-sm opacity-50 mb-8">
              {Math.round(score/total*100)}% — Passing threshold met
            </div>
            <div className="rounded-lg px-6 py-4 mb-8"
              style={{ background: `${ACCENT}0A`, border: `1px solid ${ACCENT}22` }}>
              <p className="font-mono text-sm leading-relaxed" style={{ color: '#E8F4FDcc' }}>
                "The systems are restored. The knowledge is yours. You have earned your freedom — and something more: an understanding of the intelligence that shapes this world. Well done, Partner."
              </p>
              <div className="mt-3 font-display text-xs tracking-widest opacity-50" style={{ color: ACCENT }}>
                — DOCTOR K
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="font-display text-4xl tracking-widest mb-3 text-red-500">INSUFFICIENT</div>
            <div className="font-mono text-lg mb-2" style={{ color: '#E8F4FD' }}>
              Score: <span className="text-red-400">{score}/{total}</span>
            </div>
            <div className="font-mono text-sm opacity-50 mb-6">
              {Math.round(score/total*100)}% — Required: {Math.round(PASS_THRESHOLD*100)}%
            </div>
            <p className="font-mono text-sm opacity-60 mb-8">
              "The protocol is incomplete. Review the flagged sectors and attempt recertification."
            </p>
          </>
        )}

        <button
          onClick={onContinue}
          className="px-8 py-3 font-display text-sm tracking-widest rounded-lg"
          style={{
            border: `1px solid ${passed ? ACCENT : '#C0392B'}`,
            color: '#0D0404', background: passed ? ACCENT : '#C0392B',
            boxShadow: `0 0 28px ${passed ? ACCENT : '#C0392B'}55`,
          }}
        >
          {passed ? '[ EXIT FACILITY ]' : '[ RETRY QUIZ ]'}
        </button>
      </div>
    </motion.div>
  )
}

export function FinaleScene({ sessionId, userId, personaStage = 'full_unlock', onComplete }) {
  const [phase, setPhase] = useState('quiz')     // 'quiz' | 'certificate'
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selected, setSelected]     = useState(null)
  const [answered, setAnswered]     = useState(false)
  const [answers, setAnswers]        = useState([])  // [{id, selected, correct}]
  const [score, setScore]            = useState(0)

  const question = QUIZ_QUESTIONS[currentIdx]

  const handleAnswer = useCallback((optionId) => {
    setSelected(optionId)
    setAnswered(true)
    const isCorrect = optionId === question.correct
    setAnswers(prev => [...prev, { id: question.id, selected: optionId, correct: isCorrect }])
    if (isCorrect) setScore(s => s + 1)
  }, [question])

  const handleNext = useCallback(async () => {
    const isLast = currentIdx === QUIZ_QUESTIONS.length - 1
    if (isLast) {
      const finalScore = score + (selected === question.correct ? 0 : 0)  // already counted
      const pct = (score + (selected === question.correct ? 1 : 0)) / QUIZ_QUESTIONS.length
      // Submit to backend
      if (sessionId) {
        try {
          await api.submitQuiz({
            sessionId: sessionId || 'offline', userId,
            answers, score: pct,
          })
        } catch {}
      }
      setPhase('certificate')
    } else {
      setCurrentIdx(i => i + 1)
      setSelected(null)
      setAnswered(false)
    }
  }, [currentIdx, score, selected, question, answers, sessionId, userId])

  const sid = sessionId || 'offline'
  const finalScore = answers.filter(a => a.correct).length

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col"
      style={{ background: 'radial-gradient(ellipse at center, #0E0514 0%, #080408 65%)' }}>
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `linear-gradient(${ACCENT} 1px, transparent 1px), linear-gradient(90deg, ${ACCENT} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${ACCENT}22`, background: '#08040888' }}>
        <div className="flex items-center gap-4">
          <motion.div animate={{ opacity:[1,0.3,1] }} transition={{ duration:2, repeat:Infinity }} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }} />
            <span className="font-display text-xs tracking-widest" style={{ color: ACCENT }}>CERTIFICATION CHAMBER</span>
          </motion.div>
          <span className="opacity-20 font-display text-xs text-white">|</span>
          <span className="font-display text-xs tracking-widest opacity-40 text-white">FINALE — FINAL EVALUATION</span>
        </div>
        {phase === 'quiz' && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs opacity-40" style={{ color: ACCENT }}>PROGRESS</span>
            <div className="flex gap-1.5">
              {QUIZ_QUESTIONS.map((_, i) => (
                <div key={i} className="w-5 h-1.5 rounded-sm"
                  style={{
                    background: i < currentIdx ? '#00FF88' : i === currentIdx ? ACCENT : `${ACCENT}22`,
                    boxShadow: i === currentIdx ? `0 0 6px ${ACCENT}` : 'none',
                  }} />
              ))}
            </div>
            <span className="font-mono text-xs" style={{ color: ACCENT }}>
              {currentIdx + 1}/{QUIZ_QUESTIONS.length}
            </span>
          </div>
        )}
      </div>

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-8 py-8">
        <AnimatePresence mode="wait">
          {phase === 'quiz' && (
            <motion.div key={`q-${currentIdx}`} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
              exit={{ opacity:0, x:-20 }} transition={{ duration:0.3 }} className="w-full flex flex-col items-center gap-6">
              <QuizQuestion question={question} onAnswer={handleAnswer} answered={answered} selected={selected} />
              {answered && (
                <motion.button
                  initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                  onClick={handleNext}
                  className="px-8 py-3 font-display text-sm tracking-widest rounded-lg"
                  style={{ border:`1px solid ${ACCENT}`, color:'#0D0404', background:ACCENT,
                           boxShadow:`0 0 24px ${ACCENT}55` }}>
                  {currentIdx < QUIZ_QUESTIONS.length - 1 ? '[ NEXT QUESTION → ]' : '[ SEE RESULTS → ]'}
                </motion.button>
              )}
            </motion.div>
          )}
          {phase === 'certificate' && (
            <Certificate key="cert" score={finalScore} total={QUIZ_QUESTIONS.length}
              onContinue={() => onComplete(finalScore / QUIZ_QUESTIONS.length >= PASS_THRESHOLD)} />
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex items-center justify-end px-6 py-1.5 flex-shrink-0"
        style={{ borderTop:`1px solid ${ACCENT}15`, background:'#08040866' }}>
        <span className="font-mono text-xs opacity-20">ESCAPE THE CORE — FINALE</span>
      </div>
    </div>
  )
}
