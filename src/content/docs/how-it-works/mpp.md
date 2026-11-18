---
lastUpdated: 2026-11-18
title: MPP (Machine Payments Protocol)
description: How tollbooth supports the MPP standard for universal agent payments — stablecoins, fiat cards, and more through a single gateway.
keywords:
  - mpp
  - machine payments protocol
  - stripe
  - tempo
  - fiat
  - card payments
  - agent payments
  - WWW-Authenticate
  - Authorization Payment
  - Payment-Receipt
  - IETF
---

[MPP](https://mpp.dev) is an open payment protocol co-authored by Stripe and Tempo, now on the IETF standardization track. It extends HTTP 402 with standard authentication headers and supports multiple payment methods — stablecoins, fiat cards, Lightning, and more.

MPP is backwards-compatible with x402. Tollbooth's `mpp` settlement strategy lets you accept payments from both x402 and MPP clients through the same gateway.

## Why MPP

- **Multiple payment methods** — accept USDC stablecoins *and* Stripe card payments through one config
- **Standard headers** — uses `WWW-Authenticate` / `Authorization` / `Payment-Receipt` instead of custom headers
- **50+ integrations** — growing ecosystem of MPP-compatible agents and services
- **IETF track** — on the path to becoming an internet standard

## Configuration

```yaml
settlement:
  strategy: mpp
  methods:
    - type: tempo        # stablecoins via x402 facilitator
    - type: stripe       # fiat card payments via Stripe
      secretKey: "${STRIPE_SECRET_KEY}"
```

Each method in the `methods` array adds a payment option. Clients pick whichever method they support.

### Tempo method

Wraps the existing x402 facilitator for stablecoin payments. This is the same verify/settle flow as the default `facilitator` strategy, but advertised via MPP headers.

```yaml
settlement:
  strategy: mpp
  methods:
    - type: tempo
```

No additional config needed — it uses the same facilitator URL resolution (global `facilitator` field, per-route overrides, etc.).

### Stripe method

Accepts fiat card payments via Stripe's Shared Payment Tokens (SPT). Agents with a Stripe payment method can pay without crypto.

```yaml
settlement:
  strategy: mpp
  methods:
    - type: stripe
      secretKey: "${STRIPE_SECRET_KEY}"
```

The gateway creates a Stripe PaymentIntent for each challenge, and the client confirms it with their SPT credential.

#### What the gateway checks

Since v1.2.0, a PaymentIntent is accepted only if:

- it was created by tollbooth for the challenge the client is answering (the `id` in `Authorization: Payment id="..."` must match the intent's challenge). Other PaymentIntents on your Stripe account are rejected.
- it was created for the same route and network, in `usd`, for at least the route's current price
- it is less than 1 hour old
- it has not been used before

Each PaymentIntent unlocks exactly **one** request. A replay, or several requests sent at once with the same intent, gets `402`.

Stripe payments must arrive as an MPP credential (`Authorization: Payment`). A bare payload has no challenge id and is rejected.

:::caution[Running more than one instance]
Used PaymentIntents are recorded in the verification cache store. With the default in-memory store, each instance only knows about the intents it has seen, so an intent could be reused once on each instance. When you run more than one instance, set `stores.verificationCache.backend: redis`. See [Scaling and Shared Stores](/production/scaling/).

```yaml
stores:
  redis:
    url: "redis://localhost:6379"
  verificationCache:
    backend: redis
```
:::

## How it works

### Payment flow

```
Agent                     Tollbooth                   Facilitator / Stripe
  |                          |                              |
  |  GET /weather            |                              |
  |─────────────────────────>|                              |
  |                          |                              |
  |  402 Payment Required    |                              |
  |  + payment-required      |  (x402 header)               |
  |  + WWW-Authenticate:     |  (MPP header, one per method) |
  |    Payment method="tempo"|                              |
  |    Payment method="stripe"|                             |
  |<─────────────────────────|                              |
  |                          |                              |
  |  (agent picks a method   |                              |
  |   and creates credential)|                              |
  |                          |                              |
  |  GET /weather            |                              |
  |  + Authorization:        |                              |
  |    Payment id=".."       |                              |
  |    payload=".."          |                              |
  |─────────────────────────>|                              |
  |                          |  verify + settle             |
  |                          |─────────────────────────────>|
  |                          |  settlement info             |
  |                          |<─────────────────────────────|
  |                          |                              |
  |  200 OK                  |                              |
  |  + payment-response      |  (x402 receipt)              |
  |  + Payment-Receipt       |  (MPP receipt)               |
  |<─────────────────────────|                              |
```

### Header formats

**Challenge (402 response):**
```http
WWW-Authenticate: Payment id="abc", method="tempo", intent="charge",
    amount="0.01", currency="usd", decimals=6, description="GET /weather",
    request="<base64url-encoded-json>"
```

**Credential (request):**
```http
Authorization: Payment id="abc", payload="<base64url-encoded-json>"
```

**Receipt (success response):**
```http
Payment-Receipt: id="abc", receipt="<base64url-encoded-json>"
```

### Backward compatibility

When using the `mpp` strategy, tollbooth always returns **both** x402 and MPP headers:

- 402 responses include both `payment-required` and `WWW-Authenticate: Payment`
- Success responses include both `payment-response` and `Payment-Receipt`
- Incoming requests are accepted with either `payment-signature` (x402) or `Authorization: Payment` (MPP)

This means existing x402 clients continue to work unchanged.

## Comparison with other strategies

| Strategy | Payment methods | Headers | Best for |
|---|---|---|---|
| `facilitator` | USDC stablecoins | x402 only | Simple x402 setups |
| `nanopayments` | USDC (batched) | x402 only | Sub-cent micropayments |
| **`mpp`** | **Stablecoins + fiat cards** | **x402 + MPP** | **Universal agent payments** |
| Custom | Anything | x402 only | Specialized logic |

## Learn more

- [MPP specification](https://mpp.dev)
- [Stripe MPP documentation](https://docs.stripe.com/payments/machine/mpp)
- [Settlement strategies](/how-it-works/settlement/) — full comparison of all tollbooth settlement options
