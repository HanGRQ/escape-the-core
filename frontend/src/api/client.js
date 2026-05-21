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

// SSE stream helper for POST endpoints
function streamPost(path, body, { onChunk, onDone, onError }) {
  const controller = new AbortController()
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (line.startsWith('event: done')) { onDone?.(); return }
        if (line.startsWith('event: error')) { onError?.('Stream error'); return }
        if (line.startsWith('data: ')) {
          try { onChunk?.(JSON.parse(line.slice(6))) } catch {}
        }
      }
    }
    onDone?.()
  }).catch(err => { if (err.name !== 'AbortError') onError?.(err.message) })
  return controller
}

// SSE stream helper for GET endpoints
function streamGet(path, params, { onChunk, onDone, onError }) {
  const qs = new URLSearchParams(params).toString()
  const controller = new AbortController()
  fetch(`${BASE}${path}?${qs}`, { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('event: done')) { onDone?.(); return }
          if (line.startsWith('event: error')) { onError?.('Stream error'); return }
          if (line.startsWith('data: ')) {
            try { onChunk?.(JSON.parse(line.slice(6))) } catch {}
          }
        }
      }
      onDone?.()
    })
    .catch(err => { if (err.name !== 'AbortError') onError?.(err.message) })
  return controller
}

export const api = {
  startSession: (userId, playerName = '') =>
    post('/session/start', { user_id: userId, player_name: playerName }),

  submitAnswer: (roomId, { sessionId, userId, isCorrect, timeTakenMs, answerGiven }) =>
    post(`/room/${roomId}/submit`, {
      session_id: sessionId, user_id: userId,
      is_correct: isCorrect, time_taken_ms: timeTakenMs, answer_given: answerGiven,
    }),

  getHint: (roomId, sessionId, userId) =>
    get(`/room/${roomId}/hint`, { session_id: sessionId, user_id: userId }),

  completeRoom: (roomId, { sessionId, userId, score }) =>
    post(`/room/${roomId}/complete`, { session_id: sessionId, user_id: userId, score }),

  evaluatePrompt: ({ sessionId, userId, prompt, task }) =>
    post('/prompt/evaluate', { session_id: sessionId, user_id: userId, prompt, task }),

  submitQuiz: ({ sessionId, userId, answers, score }) =>
    post('/quiz/submit', { session_id: sessionId, user_id: userId, answers, score }),

  // Streaming
  streamTeach: (roomId, sessionId, userId, callbacks) =>
    streamGet(`/room/${roomId}/teach`, { session_id: sessionId, user_id: userId }, callbacks),

  streamChat: (roomId, { sessionId, userId, message, history }, callbacks) =>
    streamPost(`/room/${roomId}/chat`, {
      session_id: sessionId, user_id: userId, message, history: history || [],
    }, callbacks),
}
