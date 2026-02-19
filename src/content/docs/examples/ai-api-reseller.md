---
title: "Example: AI API Reseller"
description: Wrap the Anthropic Claude API and resell access per-request via x402 with dynamic pricing by model.
---

Resell access to the Anthropic Claude API. Clients pay per-request via x402 — pricing adjusts automatically based on which model they request.

## Use case

You hold an Anthropic API key and want to monetize it. Instead of managing API keys, subscriptions, or billing dashboards, you put tollbooth in front of the Anthropic API and charge per-request in USDC. Cheaper models cost less, expensive models cost more.

## Config

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
