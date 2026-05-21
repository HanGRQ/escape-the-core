// Act II — IBM Granite Model Classification
// GDD §2.2: 6 model cards dragged to correct task slots

export const GRANITE_MODELS = [
  {
    id: 'instruct',
    name: 'Granite Instruct',
    shortName: 'INSTRUCT',
    color: '#3498DB',       // blue
    glowColor: '#3498DB',
    description: 'General-purpose natural language understanding & generation',
    capabilities: ['Sentiment Analysis', 'Text Summarisation', 'Q&A', 'NLU'],
    wrongHint: 'Granite Instruct handles natural language tasks like summarisation and sentiment analysis — not code or specialist domains.',
  },
  {
    id: 'finance',
    name: 'Granite Instruct (Finance)',
    shortName: 'FINANCE',
    color: '#27AE60',       // green
    glowColor: '#27AE60',
    description: 'Domain-specialist model for financial reporting & analysis',
    capabilities: ['Financial Reports', 'Revenue Analysis', 'Profit Summaries'],
    wrongHint: 'Granite Finance is the specialist for financial documents — quarterly reports, revenue trends, profit margins.',
  },
  {
    id: 'code',
    name: 'Granite Code',
    shortName: 'CODE',
    color: '#9B59B6',       // purple
    glowColor: '#9B59B6',
    description: 'Code generation and explanation for developer productivity',
    capabilities: ['Code Generation', 'Code Explanation', 'Automation'],
    wrongHint: 'Granite Code is the only model purpose-built for writing and explaining code.',
  },
  {
    id: 'multilingual',
    name: 'Granite Multilingual',
    shortName: 'MULTI',
    color: '#E67E22',       // orange
    glowColor: '#E67E22',
    description: 'Cross-language translation and comprehension for global teams',
    capabilities: ['Multi-language Translation', 'Global Support', 'Cross-language Q&A'],
    wrongHint: 'Granite Multilingual handles many languages for general cross-language communication — distinct from Japanese cultural localisation.',
  },
  {
    id: 'japanese',
    name: 'Granite Japanese',
    shortName: 'JA',
    color: '#E74C3C',       // red
    glowColor: '#E74C3C',
    description: 'Deep-specialist model for Japanese cultural localisation',
    capabilities: ['Japanese Localisation', 'Cultural Nuance', 'Japan Market'],
    wrongHint: 'Granite Japanese goes beyond translation — it understands Japanese cultural context, making content truly resonate locally.',
  },
  {
    id: 'guardian',
    name: 'Granite Guardian',
    shortName: 'GUARD',
    color: '#1ABC9C',       // teal
    glowColor: '#1ABC9C',
    description: 'Content safety — detects hate speech, profanity, harmful content',
    capabilities: ['Hate Speech Detection', 'Content Moderation', 'Safety Filtering'],
    wrongHint: 'Granite Guardian is exclusively for detecting and filtering harmful content — not for language understanding or generation.',
  },
]

// Task scenarios: player drags the right model card onto each task
export const MODEL_TASKS = [
  {
    id: 'task_1',
    scenario: 'The marketing team needs to analyse 10,000 customer reviews and extract trends to shape the next campaign.',
    correctModel: 'instruct',
    hint: 'This involves understanding and analysing natural language text — which model is built for general NLP tasks?',
  },
  {
    id: 'task_2',
    scenario: 'The finance team must generate a concise quarterly report for stakeholders, highlighting revenue trends and profit margins.',
    correctModel: 'finance',
    hint: 'Financial reports, revenue, profit margins — which Granite model is domain-specialised for exactly this?',
  },
  {
    id: 'task_3',
    scenario: 'Developers need to auto-generate inventory management code and explain legacy modules to new team members.',
    correctModel: 'code',
    hint: 'Code generation and explanation — only one Granite model is purpose-built for programming tasks.',
  },
  {
    id: 'task_4',
    scenario: 'The customer support team must handle queries from customers in English, Spanish, French, and Mandarin.',
    correctModel: 'multilingual',
    hint: 'Multiple languages across many countries — Granite Multilingual vs Japanese: which covers general global support?',
  },
  {
    id: 'task_5',
    scenario: 'The content team must localise product descriptions for Japan, ensuring cultural nuance and resonance with local customers.',
    correctModel: 'japanese',
    hint: 'Japan-specific, cultural nuance required — this is deeper than general translation.',
  },
  {
    id: 'task_6',
    scenario: 'The moderation team needs to automatically detect hate speech and profanity in user-generated content.',
    correctModel: 'guardian',
    hint: 'Safety, detection, moderation — which model is exclusively designed for harmful content detection?',
  },
]

// Doctor K teaching dialogue for Act II
export const ACT2_DIALOGUE = {
  unlock: [
    'Sector 2 unlocked. Power restored to the Server Room.',
    'The facility relies on specialised intelligence — not one mind, but six.',
    'Each Granite model is purpose-built. Deploy the wrong one and the system fails.',
    'Study the model specifications. Then route each task to its correct processor.',
  ],
}
