/**
 * stripMarkdown — removes common markdown emphasis/heading/list syntax
 * that occasionally leaks through from the LLM despite "plain prose
 * only" instructions in the system prompt (backend/app/doctor_k.py).
 *
 * This keeps the underlying words intact and just removes the
 * formatting characters, so a stray "**word**" renders as a clean
 * "word" on screen instead of literal asterisks.
 *
 * Deliberately avoids lookbehind regex assertions for broad browser
 * compatibility.
 */
export function stripMarkdown(text) {
  if (!text) return text
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')   // ***bold italic***
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // **bold**
    .replace(/\*([^*\n]+)\*/g, '$1')          // *italic*
    .replace(/__([^_]+)__/g, '$1')            // __bold__
    .replace(/`([^`]+)`/g, '$1')              // `code`
    .replace(/^#{1,6}\s+/gm, '')              // # headers
    .replace(/^[-*+]\s+/gm, '')               // - bullet markers
    .replace(/^\d+\.\s+/gm, '')               // 1. numbered markers
}
