// GDD §2.1 — Act I drag-and-drop task data
// 6 NetWiz Communication Log entries → 6 Use-Case Channel slots

export const USE_CASE_SLOTS = [
  {
    id: 'virtual_assistants',
    label: 'Virtual Assistants',
    shortLabel: 'VA',
    description: 'Round-the-clock automated support',
  },
  {
    id: 'sentiment_analysis',
    label: 'Sentiment Analysis',
    shortLabel: 'SA',
    description: 'Classify text as positive / negative / neutral',
  },
  {
    id: 'personalization',
    label: 'Personalization',
    shortLabel: 'PZ',
    description: 'Real-time individual content adaptation',
  },
  {
    id: 'question_answering',
    label: 'Question Answering',
    shortLabel: 'QA',
    description: 'Extract answers from large knowledge bases',
  },
  {
    id: 'code_generation',
    label: 'Code Generation',
    shortLabel: 'CG',
    description: 'Automated code creation & explanation',
  },
  {
    id: 'text_extraction',
    label: 'Text Extraction & Analysis',
    shortLabel: 'TE',
    description: 'Identify key info from unstructured documents',
  },
]

export const LOG_ENTRIES = [
  {
    id: 'log_1',
    text: 'Customers inquire about stock 24/7 — the support team is overwhelmed.',
    correctSlot: 'virtual_assistants',
    hint: 'Round-the-clock availability, high query volume — what technology is built for exactly this?',
  },
  {
    id: 'log_2',
    text: 'Thousands of user reviews need to be classified as positive, negative, or neutral.',
    correctSlot: 'sentiment_analysis',
    hint: 'Detecting emotional tone in text and categorising it automatically — which LLM capability does that describe?',
  },
  {
    id: 'log_3',
    text: 'We need to recommend products in real time based on each user\'s browsing history.',
    correctSlot: 'personalization',
    hint: 'Adapting content dynamically based on individual behaviour — which use case does that map to?',
  },
  {
    id: 'log_4',
    text: 'Employees waste hours searching internal policy documents for answers.',
    correctSlot: 'question_answering',
    hint: 'Extracting accurate answers from large knowledge bases, reducing search time — think about that.',
  },
  {
    id: 'log_5',
    text: 'The dev team needs to auto-generate code modules for inventory management.',
    correctSlot: 'code_generation',
    hint: 'Automatically creating code, not text content — remember that distinction.',
  },
  {
    id: 'log_6',
    text: 'Key clauses and discrepancies in supplier contracts need to be extracted quickly.',
    correctSlot: 'text_extraction',
    hint: 'Identifying and organising critical information from unstructured documents — how is this different from Q&A?',
  },
]

// Doctor K opening dialogue (GDD §2.1 narrative arc)
export const DOCTOR_K_DIALOGUE = {
  opening: [
    'The system cannot interpret your distress signal.',
    'The language comprehension layer is offline.',
    'You need to understand its core principles before a communication link can be re-established.',
  ],
  teaching: [
    'Large Language Models are neural networks trained on vast text corpora.',
    'They understand context in human language.',
    'Six communication channels must be re-routed.',
    'Match each NetWiz log entry to its correct use-case channel.',
    'The lock will disengage when all channels are restored.',
  ],
  on_error: (hint) => hint,
  on_complete: [
    'All six channels restored.',
    'Communication link re-established.',
    'Cold Machine protocol... suspended.',
    'You may call me Doctor K, Collaborator.',
  ],
}
