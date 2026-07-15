"use client"

import { useState, useMemo } from "react"
import { MODELS, estimateCost, formatUSD } from "@/lib/pricing"
import { estimateTokens, estimateOutputRange } from "@/lib/estimate-tokens"

interface Turn {
  role: "user" | "assistant"
  text: string
  mode?: "live" | "simulated"
  inputTokens?: number
  outputTokens?: number
  cost?: number
  costExact?: boolean
}

export default function Home() {
  const [modelId, setModelId] = useState(MODELS[0].id)
  const [input, setInput] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [sending, setSending] = useState(false)

  const model = MODELS.find(m => m.id === modelId)!

  const preSendEstimate = useMemo(() => {
    const inputTokens = estimateTokens(input)
    const outputRange = estimateOutputRange(inputTokens)
    const lowCost = estimateCost(model, inputTokens, outputRange.low)
    const highCost = estimateCost(model, inputTokens, outputRange.high)
    return { inputTokens, outputRange, lowCost, highCost }
  }, [input, model])

  const sessionTotal = useMemo(
    () => turns.reduce((sum, t) => sum + (t.cost ?? 0), 0),
    [turns]
  )
  const sessionHasEstimates = turns.some(t => t.cost !== undefined && !t.costExact)

  async function send() {
    if (!input.trim() || sending) return
    const userText = input
    setInput("")
    setTurns(prev => [...prev, { role: "user", text: userText }])
    setSending(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId, message: userText }),
      })
      const data = await res.json()
      if (!data.success) {
        setTurns(prev => [...prev, { role: "assistant", text: `Error: ${data.error}` }])
        return
      }
      setTurns(prev => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          mode: data.mode,
          inputTokens: data.usage.inputTokens,
          outputTokens: data.usage.outputTokens,
          cost: data.cost.amount,
          costExact: data.cost.exact,
        },
      ])
    } catch (err) {
      setTurns(prev => [...prev, { role: "assistant", text: `Network error: ${String(err)}` }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-xl font-bold">🔍 Transparent AI Chat</h1>
        <p className="text-sm text-neutral-500 mt-1">
          See the real cost of every message — before and after you send it. No hidden fees, no
          surprise bills, published provider pricing only.
        </p>
      </header>

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-6 py-6 gap-4">
        {/* Model selector + pricing */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <label className="text-xs text-neutral-500 uppercase tracking-wide">Model</label>
          <select
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.provider}) — ${m.inputPerMTok}/${m.outputPerMTok} per MTok in/out
              </option>
            ))}
          </select>
          {model.notes && (
            <p className="text-xs text-amber-500/80 mt-2">⚠️ {model.notes}</p>
          )}
          {model.provider !== "Anthropic" && (
            <p className="text-xs text-neutral-500 mt-2">
              This model runs in simulated mode here (no live key wired up for {model.provider}) —
              cost math is still real, using {model.provider}&apos;s published rates.
            </p>
          )}
        </div>

        {/* Conversation */}
        <div className="flex-1 space-y-3 overflow-y-auto min-h-[240px]">
          {turns.length === 0 && (
            <p className="text-sm text-neutral-600 text-center mt-12">
              Type a message below — you&apos;ll see the estimated cost update live before you send,
              then the real breakdown after the response comes back.
            </p>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                t.role === "user"
                  ? "bg-blue-950/40 border border-blue-900/50 ml-8"
                  : "bg-neutral-900 border border-neutral-800 mr-8"
              }`}
            >
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.role === "assistant" && t.cost !== undefined && (
                <div className="mt-2 pt-2 border-t border-neutral-800 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                  <span>
                    {t.costExact ? "✅ EXACT" : "≈ ESTIMATED"}: {t.inputTokens} in / {t.outputTokens} out
                    tokens
                  </span>
                  <span
                    className={t.costExact ? "text-green-400 font-semibold" : "text-amber-400"}
                  >
                    {formatUSD(t.cost)}
                  </span>
                  {t.mode === "simulated" && (
                    <span className="text-neutral-600">(simulated response — no live API key)</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pre-send live estimate */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
            <span>Live estimate — updates as you type, before you send anything</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              Input: <span className="text-neutral-300">~{preSendEstimate.inputTokens} tokens</span>
            </span>
            <span>
              Expected output:{" "}
              <span className="text-neutral-300">
                ~{preSendEstimate.outputRange.low}–{preSendEstimate.outputRange.high} tokens
              </span>
            </span>
            <span>
              Estimated cost:{" "}
              <span className="text-amber-400 font-semibold">
                {formatUSD(preSendEstimate.lowCost)} – {formatUSD(preSendEstimate.highCost)}
              </span>
            </span>
          </div>
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm resize-none h-20"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed rounded-lg px-5 text-sm font-semibold"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>

        {/* Session total — always visible, never buried */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-neutral-400">Session total (real, running)</span>
          <span className="text-lg font-bold text-green-400">
            {formatUSD(sessionTotal)}
            {sessionHasEstimates && (
              <span className="text-xs text-amber-500 font-normal ml-2">(includes estimates)</span>
            )}
          </span>
        </div>

        <p className="text-xs text-neutral-600 text-center">
          Pricing sourced from each provider&apos;s published rate card. This demo runs in simulated
          mode unless a live API key is configured — see the README for how to go live.
        </p>
      </div>
    </div>
  )
}
