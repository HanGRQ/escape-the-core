// Act III — Prompt Engineering Lab
// GDD §2.3: watsonx Prompt Lab simulation

export const PROMPT_TASK = {
  id: 'system_restart',
  title: 'SYSTEM RESTART ANNOUNCEMENT',
  context: `You are writing a prompt for the Granite Core's Emergency Broadcast AI.
The AI must generate a clear system restart announcement for all facility personnel.`,
  requirements: [
    { key: 'role',        label: 'Define a Role',      desc: 'Tell the AI what role it should adopt (e.g. "You are a...")' },
    { key: 'task',        label: 'State the Task',     desc: 'Clearly describe what to generate' },
    { key: 'constraints', label: 'Add Constraints',    desc: 'Specify format, length, tone, or audience' },
    { key: 'example',     label: 'Include an Example', desc: 'Provide at least one sample or reference' },
    { key: 'clarity',     label: 'Use Clear Language', desc: 'Simple, direct language — no ambiguity' },
  ],
  sampleBadPrompt: 'Write an announcement.',
  sampleGoodPrompt: `You are an emergency broadcast AI for a secure research facility.

Task: Write a concise system restart announcement (2 sentences) for all facility personnel.

Tone: Calm, authoritative, professional.

Audience: Facility staff — engineers, researchers, security personnel.

Example format: "ATTENTION ALL PERSONNEL: [message]. [action required]."`,
}

// ── quickEvaluate — instant frontend rule engine (zero API calls) ─────────────
// GDD §8.3: client-side heuristic evaluation for immediate feedback

const ROLE_PATTERNS = [
  /you are (a|an|the)/i,
  /act as/i,
  /your role is/i,
  /as a[n]?\s+\w+/i,
  /you('re| are) a[n]?\s/i,
]

const TASK_PATTERNS = [
  /write|generate|create|produce|draft|compose/i,
  /summarize|summarise|analyse|analyze|classify|identify/i,
  /task:|objective:|goal:/i,
]

const CONSTRAINT_PATTERNS = [
  /\d+\s*(sentence|word|paragraph|line|character)/i,
  /tone:|format:|length:|audience:|style:/i,
  /formal|informal|professional|concise|brief|detailed/i,
  /do not|don't|avoid|must|should|only/i,
]

const EXAMPLE_PATTERNS = [
  /example[:\s]/i,
  /for instance/i,
  /e\.g\./i,
  /sample[:\s]/i,
  /such as/i,
  /like this[:\s]/i,
  /"[^"]{5,}"/,          // quoted example text
  /\[.*\]/,              // bracketed placeholder
]

const CLARITY_BAD_PATTERNS = [
  /\b(stuff|things|it|this|that|something|somehow|whatever)\b/gi,
  /[?!]{2,}/,            // excessive punctuation
  /\.{4,}/,              // excessive ellipsis
]

/**
 * quickEvaluate — pure rule-based, synchronous, zero network calls.
 * Returns { scores, total, missing, tips } instantly.
 */
export function quickEvaluate(promptText) {
  const text = promptText.trim()
  if (!text) {
    return {
      scores: { role: 0, task: 0, constraints: 0, example: 0, clarity: 0 },
      total: 0,
      missing: ['role', 'task', 'constraints', 'example', 'clarity'],
      tips: { role: 'Start with "You are a..."', task: 'State what to generate', constraints: 'Add length or tone requirements', example: 'Include a sample output', clarity: 'Use plain, direct language' },
    }
  }

  const role        = ROLE_PATTERNS.some(r => r.test(text)) ? 1 : 0
  const task        = TASK_PATTERNS.some(r => r.test(text)) ? 1 : 0
  const constraints = CONSTRAINT_PATTERNS.some(r => r.test(text)) ? 1 : 0
  const example     = EXAMPLE_PATTERNS.some(r => r.test(text)) ? 1 : 0

  // Clarity: penalise vague words, reward short clear sentences
  const badMatches = (text.match(CLARITY_BAD_PATTERNS[0]) || []).length
  const sentences  = text.split(/[.!?]+/).filter(s => s.trim().length > 3)
  const avgLen     = sentences.length > 0
    ? sentences.reduce((a, s) => a + s.trim().split(/\s+/).length, 0) / sentences.length
    : 0
  const clarity = badMatches === 0 && avgLen < 25 ? 1 : 0

  const scores  = { role, task, constraints, example, clarity }
  const total   = role + task + constraints + example + clarity
  const missing = Object.entries(scores).filter(([, v]) => v === 0).map(([k]) => k)

  const tips = {
    role:        role        ? null : 'Add "You are a [role]..." at the start',
    task:        task        ? null : 'Use a clear action verb: write, generate, classify…',
    constraints: constraints ? null : 'Specify length (e.g. "2 sentences"), tone, or audience',
    example:     example     ? null : 'Add a sample output or bracketed placeholder like [EXAMPLE]',
    clarity:     clarity     ? null : 'Remove vague words and shorten long sentences',
  }

  return { scores, total, missing, tips }
}

// Prompt preview — simulates what the AI would do with the prompt
export function generatePreview(promptText) {
  if (!promptText.trim()) return ''
  const score = quickEvaluate(promptText).total
  if (score <= 1) return '[ Output too unpredictable — prompt needs more structure ]'
  if (score <= 2) return '[ Partial output possible — refine the prompt for better results ]'
  if (score <= 3) return 'ATTENTION ALL PERSONNEL: System restart initiated. Please save all work and stand by for a 10-minute maintenance window.'
  if (score <= 4) return 'ATTENTION ALL PERSONNEL: A scheduled system restart will commence in 10 minutes. Please save all open files, log out of active sessions, and report to your designated standby areas. Systems will be fully operational by 14:30. — Facility Control'
  return 'ATTENTION ALL PERSONNEL: A mandatory system restart has been authorised by Facility Control. All personnel must save current work, terminate active sessions, and move to designated holding areas within the next 5 minutes. Estimated downtime: 10 minutes. Full system restoration expected by 14:35. Compliance is mandatory. — Doctor K, Acting Facility Director'
}
