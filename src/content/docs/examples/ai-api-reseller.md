---
title: "Example: AI API Reseller"
description: Wrap the Anthropic Claude API and resell access per-request via x402 with dynamic pricing by model.
keywords:
  - AI
  - Anthropic
  - Claude
  - reseller
  - per-model pricing
  - match rules
  - token-based pricing
  - API monetization
  - LLM
  - wrap API
---

Resell access to the Anthropic Claude API. Clients pay per-request via x402 — pricing adjusts automatically based on which model they request.

## Use case

You hold an Anthropic API key and want to monetize it. Instead of managing API keys, subscriptions, or billing dashboards, you put tollbooth in front of the Anthropic API and charge per-request in USDC. Cheaper models cost less, expensive models cost more.

There are two ways to price this: **flat per-request** or **token-based**. You can pick whichever fits your business.

## Option A: Flat per-request pricing

Charge a fixed amount per API call, regardless of how many tokens the request uses.

```yaml
# tollbooth.config.yaml
gateway:
  port: 3000
  discovery: true

wallets:
  base: "0xYourWalletAddress"

accepts:
  - asset: USDC
    network: base

upstreams:
  anthropic:
    url: "https://api.anthropic.com"
    headers:
      x-api-key: "${ANTHROPIC_API_KEY}"
      anthropic-version: "2023-06-01"
    timeout: 120

routes:
  "POST /v1/messages":
    upstream: anthropic
    path: "/v1/messages"
    match:
      - where: { body.model: "claude-haiku-*" }
        price: "$0.005"
      - where: { body.model: "claude-sonnet-*" }
        price: "$0.015"
      - where: { body.model: "claude-opus-*" }
        price: "$0.075"
    fallback: "$0.015"
```

### What's going on

- **Single upstream** pointing at `api.anthropic.com` with your API key injected via env var.
- **One route** (`POST /v1/messages`) mirrors the Anthropic Messages endpoint.
- **Match rules** inspect `body.model` using glob patterns to set per-model pricing — Haiku is cheap, Opus is premium.
- **Fallback** catches any model that doesn't match a rule (e.g. new models Anthropic releases).

## Option B: Token-based pricing

Charge based on actual token usage. Set `type: openai-compatible` and tollbooth reads the `model` field from the request body automatically — no match rules needed.

```yaml
# tollbooth.config.yaml
gateway:
  port: 3000
  discovery: true

wallets:
  base: "0xYourWalletAddress"

accepts:
  - asset: USDC
    network: base

upstreams:
  anthropic:
    url: "https://api.anthropic.com"
    headers:
      x-api-key: "${ANTHROPIC_API_KEY}"
      anthropic-version: "2023-06-01"
    timeout: 120

routes:
  "POST /v1/messages":
    upstream: anthropic
    path: "/v1/messages"
    type: openai-compatible
    models:
      claude-haiku-4-5-20251001: "$0.001/1k-tokens"
      claude-sonnet-4-5-20250929: "$0.005/1k-tokens"
      claude-opus-4-6: "$0.02/1k-tokens"
    fallback: "$0.005/1k-tokens"
```

### What's going on

- **`type: openai-compatible`** tells tollbooth to extract the `model` from the request body and price by token count.
- **`models` map** sets per-model token rates — you control the markup per 1k tokens.
- **Fallback** applies a default token rate for any model not explicitly listed.
- No match rules required — the gateway handles model detection automatically.

## Which should you pick?

| | Flat per-request | Token-based |
|---|---|---|
| **Simplicity** | Simpler to reason about — every call has a known price | Price varies with usage |
| **Predictability** | Buyers know exactly what each call costs upfront | Buyers pay proportionally to what they use |
| **Fairness** | A 10-token request costs the same as a 4,000-token request | Long conversations cost more, short ones cost less |
| **Risk** | You can lose money on heavy requests if your flat price is too low | Tracks actual upstream cost more closely |

**Rule of thumb:** use flat pricing for simple, predictable APIs. Use token-based pricing when request sizes vary widely and you want to avoid subsidizing heavy usage.

:::caution[Protect clients from upstream failures]
Since Anthropic is a paid upstream that can return `5xx` errors, consider adding `settlement: after-response` to this route. If the upstream fails, the client's payment is never settled and they keep their funds. See the [Refund Protection](/guides/refund-protection/) guide.
:::

## Run it

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npx tollbooth start
```

## Expected flow

```
Client                        Tollbooth                     Anthropic
  │                              │                              │
  │  POST /v1/messages           │                              │
  │  { model: "claude-sonnet-…"} │                              │
  │─────────────────────────────>│                              │
  │                              │  match body.model →          │
  │                              │  price: $0.015               │
  │  402 + payment instructions  │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  │  (sign $0.015 USDC payment)  │                              │
  │                              │                              │
  │  POST /v1/messages           │                              │
  │  + X-PAYMENT header          │                              │
  │─────────────────────────────>│                              │
  │                              │  verify + settle payment     │
  │                              │                              │
  │                              │  POST /v1/messages           │
  │                              │──────────────────────────────>│
  │                              │                              │
  │                              │  { content: "..." }          │
  │                              │<──────────────────────────────│
  │  200 + Claude response       │                              │
  │<─────────────────────────────│                              │
```

## Try it with curl

First request — get the 402:

```bash
curl -s http://localhost:3000/v1/messages \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```

The response includes a `402 Payment Required` status with payment instructions in the headers. An x402-compatible client (or wallet SDK) reads these instructions, signs the USDC payment, and resends the request with the payment proof attached.

:::tip
To test locally without real payments, see the [Local Testing](/guides/local-testing/) guide.
:::

---

**Next:** [Video Streaming Paywall →](/examples/video-streaming-paywall/)
