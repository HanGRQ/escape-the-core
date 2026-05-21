// Final Quiz — 5 questions from quiz.md
// GDD §2.4: Finale — 75% pass threshold (4/5)

export const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    act: 3,
    text: 'A team asks an LLM to summarise a customer service email but receives vague, unhelpful responses. The prompt used was simply: "Summarize this." Which prompting technique would most improve the response?',
    options: [
      { id: 'a', text: 'Include examples' },
      { id: 'b', text: 'Define the task clearly' },
      { id: 'c', text: 'Use simple and direct language' },
      { id: 'd', text: 'Be specific' },
    ],
    correct: 'd',
    explanation: 'Providing specificity — key details about the task, desired output, and context — prevents the model from producing responses that are too broad or irrelevant.',
  },
  {
    id: 'q2',
    act: 3,
    text: 'A product team asks the LLM to classify reviews as positive or negative, but the model misclassifies many. They realise their prompt provided no classification examples. Which technique resolves this?',
    options: [
      { id: 'a', text: 'Include examples' },
      { id: 'b', text: 'Be specific' },
      { id: 'c', text: 'Use simple and direct language' },
      { id: 'd', text: 'Define the task clearly' },
    ],
    correct: 'a',
    explanation: 'Adding specific examples of each category guides the LLM and ensures it handles subtle nuances — especially important for classification tasks.',
  },
  {
    id: 'q3',
    act: 2,
    text: 'A global e-commerce company needs to analyse customer reviews, identify trends, and generate insights that improve marketing strategies. Which IBM Granite model should they use?',
    options: [
      { id: 'a', text: 'Granite Instruct' },
      { id: 'b', text: 'Granite Code' },
      { id: 'c', text: 'Granite Guardian' },
      { id: 'd', text: 'Granite Multilingual' },
    ],
    correct: 'a',
    explanation: 'Granite Instruct is the general-purpose NLP model — designed to analyse customer reviews, extract trends, and generate insights for marketing.',
  },
  {
    id: 'q4',
    act: 1,
    text: 'An e-commerce company wants to provide personalised shopping experiences by offering product recommendations based on individual preferences and purchase history. Which LLM use case applies?',
    options: [
      { id: 'a', text: 'Personalization' },
      { id: 'b', text: 'Text extraction and analysis' },
      { id: 'c', text: 'Sentiment analysis' },
      { id: 'd', text: 'Virtual assistants' },
    ],
    correct: 'a',
    explanation: 'Personalization uses LLM capabilities to analyse user behaviour and adapt product recommendations or marketing messages in real time.',
  },
  {
    id: 'q5',
    act: 2,
    text: 'A software development team needs to generate efficient code for automating routine tasks and explain complex code to help new members onboard. Which IBM Granite model is best suited?',
    options: [
      { id: 'a', text: 'Granite Instruct' },
      { id: 'b', text: 'Granite Code' },
      { id: 'c', text: 'Granite Japanese' },
      { id: 'd', text: 'Granite Multilingual' },
    ],
    correct: 'b',
    explanation: 'Granite Code is designed to improve productivity by automating tasks through code generation and providing explanations for complex existing code.',
  },
]

export const PASS_THRESHOLD = 0.8  // 4/5 = 80%
