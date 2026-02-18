---
title: Getting Started
description: Install tollbooth and set up your first paid API endpoint in under 5 minutes.
---

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
  "GET /data":
    upstream: myapi
    price: "$0.01"
```

This tells tollbooth:

- Listen on port 3000
- Accept USDC payments on Base
- Proxy `GET /data` to `https://api.example.com/data`
- Charge $0.01 per request
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

- [Configuration Reference](/reference/configuration/) — full reference for every config field
- [Dynamic Pricing](/guides/dynamic-pricing/) — match rules, fallbacks, and custom pricing functions
- [Local Testing](/guides/local-testing/) — try tollbooth locally with a dummy API
- [How x402 Works](/guides/how-x402-works/) — understand the payment protocol

---

**Next:** [Dynamic Pricing →](/guides/dynamic-pricing/)
