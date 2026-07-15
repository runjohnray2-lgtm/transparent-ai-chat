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
  // Two-step commit gate: nothing is sent until the user explicitly approves
  // the locked-in estimate for this exact message. Reviewing costs nothing —
  // only "Approve & Send" triggers the actual API call.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  const model = MODELS.find(m => m.id === modelId)!

  const liveEstimate = useMemo(() => {
    const inputTokens = estimateTokens(input)
    const outputRange = estimateOutputRange(inputTokens)
    const lowCost = estimateCost(model, inputTokens, outputRange.low)
    const highCost = estimateCost(model, inputTokens, outputRange.high)
    return { inputTokens, outputRange, lowCost, highCost }
  }, [input, model])

  // The locked estimate shown in the review gate — computed once when the
  // user clicks "Review Cost" and frozen until they Approve or Cancel, so the
  // number they approve is exactly the number they saw, not a moving target.
  const lockedEstimate = useMemo(() => {
    if (pendingMessage === null) return null
    const inputTokens = estimateTokens(pendingMessage)
    const outputRange = estimateOutputRange(inputTokens)
    const lowCost = estimateCost(model, inputTokens, outputRange.low)
    const highCost = estimateCost(model, inputTokens, outputRange.high)
    return { inputTokens, outputRange, lowCost, highCost }
  }, [pendingMessage, model])

  const sessionTotal = useMemo(
    () => turns.reduce((sum, t) => sum + (t.cost ?? 0), 0),
    [turns]
  )
  const sessionHasEstimates = turns.some(t => t.cost !== undefined && !t.costExact)

  function reviewCost() {
    if (!input.trim() || sending) return
    setPendingMessage(input)
  }

  function cancelReview() {
    // Nothing was ever sent or spent — cancel just restores the editable input.
    if (pendingMessage !== null) setInput(pendingMessage)
    setPendingMessage(null)
  }

  async function approveAndSend() {
    if (pendingMessage === null || sending) return
    const userText = pendingMessage
    setPendingMessage(null)
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
          See the real cost of every message — before and after you send it. Nothing is spent until
          you explicitly approve it.
        </p>
      </header>

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-6 py-6 gap-4">
        {/* Model selector + pricing */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <label className="text-xs text-neutral-500 uppercase tracking-wide">Model</label>
          <select
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            disabled={pendingMessage !== null}
            className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
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
        <div className="flex-1 space-y-3 overflow-y-auto min-h-[200px]">
          {turns.length === 0 && (
            <p className="text-sm text-neutral-600 text-center mt-12">
              Type a message, click &quot;Review Cost&quot; to lock in an estimate, then approve it
              to actually send. Nothing is spent in between.
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
          {sending && (
            <div className="rounded-lg p-3 text-sm bg-neutral-900 border border-neutral-800 mr-8 text-neutral-500">
              Thinking…
            </div>
          )}
        </div>

        {/* STEP 2: Review & Approve gate — only shown after "Review Cost" is clicked.
            This is the actual commit point. Nothing above this has spent anything. */}
        {lockedEstimate && (
          <div className="bg-amber-950/20 border-2 border-amber-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              ⏸️ Review before sending — nothing has been spent yet
            </div>
            <p className="text-sm text-neutral-300 bg-neutral-900/60 rounded-lg p-2 max-h-24 overflow-y-auto">
              {pendingMessage}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Input: <span className="text-neutral-300">~{lockedEstimate.inputTokens} tokens</span>
              </span>
              <span>
                Expected output:{" "}
                <span className="text-neutral-300">
                  ~{lockedEstimate.outputRange.low}–{lockedEstimate.outputRange.high} tokens
                </span>
              </span>
              <span>
                Estimated cost:{" "}
                <span className="text-amber-400 font-semibold">
                  {formatUSD(lockedEstimate.lowCost)} – {formatUSD(lockedEstimate.highCost)}
                </span>
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={approveAndSend}
                disabled={sending}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-neutral-700 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                ✅ Approve &amp; Send
              </button>
              <button
                onClick={cancelReview}
                disabled={sending}
                className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Live typing estimate — shown only while composing, before review */}
        {pendingMessage === null && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
              <span>Live estimate — updates as you type</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Input: <span className="text-neutral-300">~{liveEstimate.inputTokens} tokens</span>
              </span>
              <span>
                Expected output:{" "}
                <span className="text-neutral-300">
                  ~{liveEstimate.outputRange.low}–{liveEstimate.outputRange.high} tokens
                </span>
              </span>
              <span>
                Estimated cost:{" "}
                <span className="text-amber-400 font-semibold">
                  {formatUSD(liveEstimate.lowCost)} – {formatUSD(liveEstimate.highCost)}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                reviewCost()
              }
            }}
            disabled={pendingMessage !== null}
            placeholder="Type a message… (Enter to review cost, Shift+Enter for new line)"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm resize-none h-20 disabled:opacity-50"
          />
          <button
            onClick={reviewCost}
            disabled={sending || !input.trim() || pendingMessage !== null}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed rounded-lg px-5 text-sm font-semibold"
          >
            Review Cost →
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
