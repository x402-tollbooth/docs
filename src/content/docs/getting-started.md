---
title: Getting Started
description: Install tollbooth and set up your first paid API endpoint in under 5 minutes.
keywords:
  - x402
  - payment gateway
  - USDC
  - micropayment
  - API monetization
  - pay-per-request
  - install
  - setup
  - quickstart
  - tutorial
  - config
  - YAML
  - 402 payment required
  - proxy
  - Base
  - facilitator
  - npx tollbooth start
---

**tollbooth** is an API gateway that sits in front of your upstream APIs and charges callers per-request using the [x402](https://x402.org) payment protocol. No API keys, no subscriptions — just instant USDC micropayments.

**Who is this for:**

- **API providers** who want to monetize endpoints without building billing infrastructure
- **AI agent developers** who need machine-to-machine payment flows
- **Anyone** who wants to add pay-per-request pricing to an existing API

## Install

```bash
bun add x402-tollbooth
```

## Create a config

Create `tollbooth.config.yaml` in your project root:

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

defaults:
  price: "$0.001"
  timeout: 60

upstreams:
  myapi:
    url: "https://api.example.com"
    headers:
      authorization: "Bearer ${API_KEY}"

routes:
  "GET /health":
    upstream: myapi
    price: "$0"

  "GET /data":
    upstream: myapi
    price: "$0.01"
```

This tells tollbooth:

- Listen on port 3000
- Accept USDC payments on Base
- Proxy `GET /health` for free — `price: "$0"` skips the x402 payment flow entirely
- Proxy `GET /data` and charge $0.01 per request via x402
- Expose discovery metadata at `/.well-known/x402`

## Start the gateway

```bash
npx tollbooth start
```

## What happens

When a client calls `GET /data`, tollbooth returns a `402 Payment Required` response with payment instructions. The client signs a USDC payment, resends the request with the payment signature, and gets the proxied response.

```
Client                    Tollbooth                  Upstream API
  │                          │                           │
  │  GET /data               │                           │
  │─────────────────────────>│                           │
  │                          │  (match route, resolve    │
  │                          │   price: $0.01)           │
  │  402 + PAYMENT-REQUIRED  │                           │
  │<─────────────────────────│                           │
  │                          │                           │
  │  (sign USDC payment)     │                           │
  │                          │                           │
  │  GET /data               │                           │
  │  + PAYMENT-SIGNATURE     │                           │
  │─────────────────────────>│                           │
  │                          │  verify + settle          │
  │                          │  (via facilitator)        │
  │                          │                           │
  │                          │  GET /data                │
  │                          │──────────────────────────>│
  │                          │                           │
  │                          │  { data: ... }            │
  │                          │<──────────────────────────│
  │  200 + data              │                           │
  │  + PAYMENT-RESPONSE      │                           │
  │<─────────────────────────│                           │
```

The `PAYMENT-REQUIRED` header contains base64-encoded payment requirements (amount, network, asset, recipient). The `PAYMENT-SIGNATURE` header contains the signed EIP-3009 `transferWithAuthorization` payload. The `PAYMENT-RESPONSE` header contains the settlement result including the on-chain transaction hash.

:::note
tollbooth uses the x402 facilitator at `https://x402.org/facilitator` by default to verify and settle payments. You can point to a custom facilitator if needed — see the [Configuration Reference](/reference/configuration/).
:::

## Next steps

- [How x402 Works](/how-it-works/x402-protocol/) — understand the payment protocol
- [Dynamic Pricing](/pay-per-request/dynamic-pricing/) — match rules, fallbacks, and custom pricing functions
- [Local Testing](/guides/local-testing/) — try tollbooth locally with a dummy API
- [Configuration Reference](/reference/configuration/) — full reference for every config field

---

**Next:** [How x402 Works →](/how-it-works/x402-protocol/)
