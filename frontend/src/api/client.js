const BASE = '/api'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'API error')
  }
  return res.json()
}

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}${path}${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error('API error')
  return res.json()
}

export const api = {
  startSession: (userId, playerName = '') =>
    post('/session/start', { user_id: userId, player_name: playerName }),

  submitAnswer: (roomId, { sessionId, userId, isCorrect, timeTakenMs, answerGiven, playerName = '' }) =>
    post(`/room/${roomId}/submit`, {
      session_id:    sessionId,
      user_id:       userId,
      is_correct:    isCorrect,
      time_taken_ms: timeTakenMs,
      answer_given:  answerGiven,
      player_name:   playerName,
    }),

  getHint: (roomId, sessionId, userId) =>
    get(`/room/${roomId}/hint`, { session_id: sessionId, user_id: userId }),

  completeRoom: (roomId, { sessionId, userId, score }) =>
    post(`/room/${roomId}/complete`, { session_id: sessionId, user_id: userId, score }),

  evaluatePrompt: ({ sessionId, userId, prompt, task }) =>
    post('/prompt/evaluate', { session_id: sessionId, user_id: userId, prompt, task }),

  submitQuiz: ({ sessionId, userId, answers, score }) =>
    post('/quiz/submit', { session_id: sessionId, user_id: userId, answers, score }),

  getProgress: (userId, sessionId) =>
    get(`/progress/${userId}`, { session_id: sessionId }),
}
