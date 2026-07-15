# Transparent AI Chat

See the real cost of every AI message — before and after you send it.

## What this is

- Live token estimate as you type, before you hit send
- Real, published per-token pricing for Claude / Gemini models — no markup
- After each response: exact cost (when a live API key is configured) or a clearly-labeled estimate
- A running session total that's always visible, never buried in a separate dashboard

## Going live

By default this runs in **simulated mode** — no API key is required to see the UI and cost math.

To make Claude responses (and their EXACT token costs) real, set an environment variable:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Never commit this key to git or paste it into chat — set it directly in your hosting provider's dashboard (e.g. Vercel → Settings → Environment Variables).

Gemini models always run in simulated mode in this build (no live key wired up for that provider yet).
