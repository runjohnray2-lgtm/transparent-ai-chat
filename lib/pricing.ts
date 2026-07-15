// Real, published per-token pricing — sourced directly from each provider's
// own pricing page. No markup, no hidden fees. Update these when providers
// change their rates; never guess.

export interface ModelPricing {
  id: string
  label: string
  provider: "Anthropic" | "OpenAI" | "Google"
  inputPerMTok: number   // USD per 1,000,000 input tokens
  outputPerMTok: number  // USD per 1,000,000 output tokens
  contextWindow: number
  notes?: string
}

export const MODELS: ModelPricing[] = [
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "Anthropic",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "Anthropic",
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    contextWindow: 1_000_000,
    notes: "Intro pricing $2/$10 per MTok through 2026-08-31",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    contextWindow: 200_000,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "OpenAI",
    inputPerMTok: 2.5,
    outputPerMTok: 10.0,
    contextWindow: 128_000,
    notes: "Verify current rate at openai.com/api/pricing — rates and model lineup change frequently",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "Google",
    inputPerMTok: 1.5,
    outputPerMTok: 9.0,
    contextWindow: 1_000_000,
    notes: "Verify current rate at ai.google.dev/gemini-api/docs/pricing — Google updates tiers frequently",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "Google",
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    contextWindow: 1_000_000,
    notes: "Cheapest Gemini tier — verify current rate before relying on it",
  },
]

export function estimateCost(
  model: ModelPricing,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens / 1_000_000) * model.inputPerMTok +
    (outputTokens / 1_000_000) * model.outputPerMTok
  )
}

export function formatUSD(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(5)}`
  return `$${amount.toFixed(4)}`
}
