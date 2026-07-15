// Client-side, zero-network token ESTIMATE — shown instantly as the user types,
// before anything is sent anywhere. This is deliberately labeled an estimate,
// not a guarantee: the only way to get an exact count is the provider's own
// tokenizer (Claude's /v1/messages/count_tokens, OpenAI's tiktoken, etc.),
// which requires a network round-trip. We show the estimate immediately for
// transparency, then replace it with the EXACT number once a real response
// comes back (see app/api/chat/route.ts).
//
// Calibration: ~4 characters per token is a reasonable average across
// providers for English text (it will be off for code, non-English text, or
// heavy punctuation — that's exactly why we call it an estimate).
export function estimateTokens(text: string): number {
  if (!text) return 0
  const charBased = Math.ceil(text.length / 4)
  const wordBased = Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.33)
  // Blend both signals — reduces error on both very short and very long inputs.
  return Math.max(1, Math.round((charBased + wordBased) / 2))
}

// A conservative estimate for the OUTPUT side, before any response exists.
// We can't know how long a model will respond, so we show a clearly-labeled
// range rather than a false-precision single number.
export function estimateOutputRange(inputTokens: number): { low: number; high: number } {
  // Heuristic: short prompts often get short answers; long/complex prompts
  // often get longer ones. This is intentionally a wide, honest range.
  const low = Math.max(20, Math.round(inputTokens * 0.3))
  const high = Math.max(200, Math.round(inputTokens * 2.5))
  return { low, high }
}
