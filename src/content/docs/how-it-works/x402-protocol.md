---
lastUpdated: 2026-02-27
title: How x402 Works
description: A brief overview of the x402 payment protocol and how tollbooth implements it.
keywords:
  - x402
  - protocol
  - 402 payment required
  - EIP-3009
  - facilitator
  - USDC
  - settlement
  - payment-signature
  - payment-required header
  - discovery
  - .well-known/x402
  - transferWithAuthorization
  - EIP-712
---

[x402](https://x402.org) is an open protocol for HTTP-native payments. It repurposes the `402 Payment Required` HTTP status code — originally reserved but never standardized — to enable machine-to-machine micropayments.

This page covers the basics. For the full specification, see [x402.org](https://x402.org).

## The payment flow

```
Client                    Tollbooth                  Facilitator          Upstream API
  │                          │                           │                     │
  │  GET /weather            │                           │                     │
  │─────────────────────────>│                           │                     │
  │                          │                           │                     │
  │  402 Payment Required    │                           │                     │
  │  + payment-required hdr  │                           │                     │
  │<─────────────────────────│                           │                     │
  │                          │                           │                     │
  │  (client signs payment)  │                           │                     │
  │                          │                           │                     │
  │  GET /weather            │                           │                     │
  │  + payment-signature hdr │                           │                     │
  │─────────────────────────>│                           │                     │
  │                          │  verify + settle          │                     │
  │                          │─────────────────────────> │                     │
  │                          │  { tx, payer, ... }       │                     │
  │                          │<───────────────────────── │                     │
  │                          │                           │                     │
  │                          │  GET /weather                                   │
  │                          │───────────────────────────────────────────────> │
  │                          │  { temp: 22, ... }                              │
  │                          │<─────────────────────────────────────────────── │
  │                          │                           │                     │
  │  200 OK + data           │                           │                     │
  │  + payment-response hdr  │                           │                     │
  │<─────────────────────────│                           │                     │
```

1. **Client sends a request** — no payment attached
2. **Tollbooth returns 402** with a `payment-required` header containing base64-encoded payment requirements (amount, network, asset, recipient address, timeout)
3. **Client signs a payment** — an EIP-3009 `transferWithAuthorization` for the required USDC amount
4. **Client resends the request** with the signed payment in the `payment-signature` header
5. **Tollbooth forwards to the facilitator** which verifies the signature and settles the on-chain USDC transfer
6. **Tollbooth proxies to the upstream** and returns the response with a `payment-response` header containing the transaction hash

## Who does what

| Component | Responsibility |
|-----------|---------------|
| **Client** | Signs EIP-3009 payment, attaches it to the request |
| **Tollbooth** | Route matching, price resolution, 402 responses, proxying, hooks |
| **Facilitator** | Signature verification, on-chain USDC settlement, tx hash |
| **Upstream API** | The actual API being monetized (unchanged, unaware of payments) |

The upstream API doesn't need to know about x402 at all. Tollbooth sits in front and handles everything.

## The `payment-required` header

When tollbooth returns a 402, it includes a base64-encoded JSON payload in the `payment-required` header:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "base-sepolia",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "maxAmountRequired": "1000",
  "payTo": "0xGatewayWalletAddress",
  "maxTimeoutSeconds": 300
}
```

| Field | Description |
|-------|-------------|
| `x402Version` | Protocol version (currently `2`) |
| `scheme` | Payment scheme (`exact` for fixed-price) |
| `network` | Blockchain network for payment |
| `asset` | Token contract address (USDC) |
| `maxAmountRequired` | Amount in micro-units (1000 = $0.001 USDC) |
| `payTo` | Recipient wallet address |
| `maxTimeoutSeconds` | How long the payment authorization is valid |

## What is a facilitator?

A facilitator is a service that verifies payment signatures and settles them on-chain. It acts as a trusted intermediary:

1. Receives the signed `transferWithAuthorization` payload from tollbooth
2. Verifies the EIP-712 signature is valid and the amount matches
3. Submits the USDC transfer on-chain (the facilitator sponsors gas)
4. Returns the transaction hash and settlement details

By default, tollbooth uses `https://x402.org/facilitator`. You can run your own or point to an alternative.

## EIP-3009 `transferWithAuthorization`

The x402 `exact` scheme uses [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) — a standard for gasless USDC transfers via signed authorizations. Instead of the payer broadcasting an on-chain transaction, they sign an off-chain EIP-712 typed-data message authorizing a specific transfer. The facilitator then submits this authorization on-chain, pulling the USDC from the payer's wallet to the gateway's wallet. The payer never needs ETH for gas — the facilitator covers it.

## V2 discovery

When `gateway.discovery` is `true`, tollbooth exposes a `GET /.well-known/x402` endpoint that returns metadata about all paid routes — accepted networks, assets, and pricing. Clients can use this to discover what payments are required before making requests.

---

**Next:** [Settlement Strategies →](/how-it-works/settlement/)
