---
lastUpdated: 2026-02-27
title: Settlement Strategies
description: Understand tollbooth's pluggable settlement system and choose the right strategy for your use case.
keywords:
  - settlement
  - facilitator
  - self-hosted
  - on-chain
  - custom strategy
  - SettlementStrategy
  - OpenFacilitator
  - local settlement
  - x402
---

tollbooth uses a pluggable settlement system to verify and collect payments. By default it delegates to a remote facilitator, but you can swap in a different strategy depending on your needs — from zero-config hosted settlement to fully self-sovereign on-chain verification.

## Built-in strategies

### `facilitator` (default)

Delegates payment verification and on-chain settlement to an x402 facilitator service. The default facilitator is `https://x402.org/facilitator`.

```yaml
# Optional — this is the default behavior
facilitator: https://x402.org/facilitator
```

The facilitator verifies the payer's EIP-712 signature, submits the USDC `transferWithAuthorization` transaction on-chain, and sponsors gas so you don't need to hold ETH.

**When to use:** production deployments where you want zero infrastructure overhead. Works out of the box with no wallets, RPC nodes, or gas management.

**Tradeoff:** depends on a third-party service for settlement.

## Self-hosting options

The built-in facilitator covers most use cases, but you can go further when you need more control.

### Run your own facilitator

[OpenFacilitator](https://github.com/coinbase/x402/tree/main/packages/facilitator) is the open-source facilitator that powers `x402.org/facilitator`. You can self-host it and point tollbooth at your own instance:

```yaml
facilitator: https://facilitator.yourdomain.com
```

This gives you full control over the settlement service — your own logs, your own uptime, your own infrastructure — while keeping the same facilitator protocol tollbooth already speaks.

You can also override the facilitator per-route:

```yaml
facilitator: https://primary-facilitator.example.com

routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    price: "$0.075"
    facilitator: https://backup-facilitator.example.com
```

### Local on-chain settlement (future)

Skip the facilitator entirely and settle payments directly from tollbooth. This means verifying EIP-712 signatures locally and submitting transactions via viem to an RPC endpoint.

**Requirements:**
- A gas wallet with ETH to pay for on-chain transactions
- An RPC endpoint (Alchemy, Infura, or your own node)

**Tradeoff:** you manage gas and RPC infrastructure, but remove all third-party dependencies. Settlement is fully self-sovereign.

:::note
Local on-chain settlement is not yet implemented. Track progress in the tollbooth repo.
:::

### Custom strategy module

For settlement logic that doesn't fit the facilitator model, implement the `SettlementStrategy` interface. This lets you handle payment verification however you want — off-chain ledgers, subscription checks, free tiers, or hybrid approaches.

```ts
import type { SettlementStrategy } from "x402-tollbooth";

const myStrategy: SettlementStrategy = {
  async verify(payment) {
    // Check if the payment is valid
    // Return { valid: true } or { valid: false, reason: "..." }
  },

  async settle(payment) {
    // Execute the settlement (on-chain tx, ledger update, etc.)
    // Return { settled: true, txHash: "..." }
  },
};

export default myStrategy;
```

**Example use cases:**

- **Free tier** — verify an API key and skip settlement for free-tier users
- **Subscription check** — validate against a Stripe subscription instead of per-request payment
- **Off-chain ledger** — debit from a prepaid balance in your database
- **Hybrid** — use the facilitator for on-chain payments but fall back to a ledger for known customers

## Comparison

| Strategy | Infra needed | Speed | Decentralization | Use case |
|---|---|---|---|---|
| `facilitator` | None | ~200 ms | Depends on facilitator | Production default |
| `local` (future) | Gas wallet + RPC | ~2–5 s | Fully self-sovereign | Production, no dependencies |
| Custom | Varies | Varies | Varies | Free tiers, subscriptions, hybrid |

## Settlement timing

The settlement *strategy* (which service settles) is separate from settlement *timing* (when settlement happens relative to the upstream request). tollbooth supports two timing modes:

- **`before-response`** (default) — settle before calling the upstream
- **`after-response`** — settle only after the upstream responds successfully

Settlement timing applies to any strategy. See the [Refund Protection guide](/streaming/refund-protection/) for details on configuring timing and writing custom refund hooks.

---

**Next:** [Dynamic Pricing →](/pay-per-request/dynamic-pricing/)
