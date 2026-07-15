import { NextResponse } from "next/server"
import { MODELS, estimateCost } from "@/lib/pricing"
import { estimateTokens } from "@/lib/estimate-tokens"

export const runtime = "nodejs"

interface ChatRequestBody {
  modelId: string
  message: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody
    const model = MODELS.find(m => m.id === body.modelId)
    if (!model) {
      return NextResponse.json({ success: false, error: "Unknown model" }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    const isClaudeModel = model.provider === "Anthropic"

    // LIVE MODE — only when a real Anthropic key is configured AND the
    // selected model is a Claude model. This is the only path that returns
    // an EXACT token count (from the provider's own usage object), because
    // that's the only number we can actually trust as ground truth.
    if (apiKey && isClaudeModel) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model.id,
          max_tokens: 1024,
          messages: [{ role: "user", content: body.message }],
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return NextResponse.json(
          { success: false, error: `Provider error: ${errText}`, mode: "live-error" },
          { status: 502 }
        )
      }

      const data = await res.json()
      const inputTokens: number = data.usage?.input_tokens ?? 0
      const outputTokens: number = data.usage?.output_tokens ?? 0
      const exactCost = estimateCost(model, inputTokens, outputTokens)
      const replyText =
        data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "(no text response)"

      return NextResponse.json({
        success: true,
        mode: "live",
        reply: replyText,
        usage: { inputTokens, outputTokens, exact: true },
        cost: { amount: exactCost, exact: true },
        model: { id: model.id, label: model.label },
      })
    }

    // SIMULATED MODE — no live API key configured (or a non-Claude model was
    // picked, since we don't wire up every provider). We still show real math:
    // the input token count is estimated the same way the UI estimated it
    // before sending, and the output is a simulated echo so the cost figure
    // has a concrete number to attach to rather than a placeholder.
    const inputTokens = estimateTokens(body.message)
    const simulatedReply = `[SIMULATED — no live ${model.provider} API key configured] I'm not actually running here. In live mode, this would be ${model.label}'s real response to: "${body.message.slice(0, 80)}${body.message.length > 80 ? "…" : ""}"`
    const outputTokens = estimateTokens(simulatedReply)
    const estimatedCost = estimateCost(model, inputTokens, outputTokens)

    return NextResponse.json({
      success: true,
      mode: "simulated",
      reply: simulatedReply,
      usage: { inputTokens, outputTokens, exact: false },
      cost: { amount: estimatedCost, exact: false },
      model: { id: model.id, label: model.label },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
