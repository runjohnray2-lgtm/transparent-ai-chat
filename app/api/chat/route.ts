import { NextResponse } from "next/server"
import { MODELS, estimateCost } from "@/lib/pricing"
import { estimateTokens } from "@/lib/estimate-tokens"

export const runtime = "nodejs"

interface ChatRequestBody {
  modelId: string
  message: string
  apiKey?: string // client-supplied — never persisted, forwarded only for this one request
}

async function callAnthropic(modelId: string, message: string, key: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: "user", content: message }],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return {
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    reply: data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "(no text response)",
  }
}

async function callOpenAI(modelId: string, message: string, key: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: message }],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    reply: data.choices?.[0]?.message?.content ?? "(no text response)",
  }
}

async function callGemini(modelId: string, message: string, key: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] }),
    }
  )
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const usage = data.usageMetadata ?? {}
  return {
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    reply: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no text response)",
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody
    const model = MODELS.find(m => m.id === body.modelId)
    if (!model) {
      return NextResponse.json({ success: false, error: "Unknown model" }, { status: 400 })
    }

    // Client-supplied key (bring-your-own) takes priority — this is what makes
    // the site usable by anyone without the site owner paying for every
    // visitor's usage. Falls back to a server env var only for Anthropic
    // (the operator's own key, if they chose to configure one for demos).
    const clientKey = body.apiKey?.trim()
    const serverAnthropicKey = process.env.ANTHROPIC_API_KEY
    const activeKey = clientKey || (model.provider === "Anthropic" ? serverAnthropicKey : undefined)

    if (activeKey) {
      try {
        let result: { inputTokens: number; outputTokens: number; reply: string }
        if (model.provider === "Anthropic") {
          result = await callAnthropic(model.id, body.message, activeKey)
        } else if (model.provider === "OpenAI") {
          result = await callOpenAI(model.id, body.message, activeKey)
        } else {
          result = await callGemini(model.id, body.message, activeKey)
        }

        const exactCost = estimateCost(model, result.inputTokens, result.outputTokens)
        return NextResponse.json({
          success: true,
          mode: "live",
          reply: result.reply,
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, exact: true },
          cost: { amount: exactCost, exact: true },
          model: { id: model.id, label: model.label },
        })
      } catch (providerErr) {
        return NextResponse.json(
          { success: false, error: `Provider error: ${String(providerErr)}`, mode: "live-error" },
          { status: 502 }
        )
      }
    }

    // SIMULATED MODE — no key available (server or client) for this provider.
    const inputTokens = estimateTokens(body.message)
    const simulatedReply = `[SIMULATED — no ${model.provider} API key provided] Add your own ${model.provider} key in Settings to make this live. In live mode, this would be ${model.label}'s real response to: "${body.message.slice(0, 80)}${body.message.length > 80 ? "…" : ""}"`
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
