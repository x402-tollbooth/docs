---
lastUpdated: 2026-11-18
title: Tempo Settlement
description: Settle x402 payments on Tempo with subscription-style pricing, per-customer attribution, and invoice memos.
keywords:
  - tempo
  - pathUSD
  - recurring payments
  - subscriptions
  - time-based pricing
  - invoice memo
  - customer attribution
  - settlement strategy
---

The `tempo` settlement strategy settles x402 payments on [Tempo](https://tempo.xyz) through an x402 facilitator that supports Tempo. It adds three things on top of the regular facilitator flow:

- **Subscription-style routes.** Price a route as `"$10/month"`. A customer pays once and can then use the route for the whole period.
- **Per-customer attribution.** Every settlement carries a `customerId` and an `attribution` block (recipient, token, network, plan).
- **Invoice memos.** Templates like `{customer_id}-{period}` are filled in for each settlement.

Available since v1.2.1.

:::caution[Bring a Tempo facilitator]
tollbooth doesn't ship a default Tempo facilitator, because there is no canonical one. You must set `settlement.tempo.url` (or `settlement.url`) to an x402 facilitator that supports Tempo. Tempo support has been tested against a mocked facilitator. Check your facilitator on Tempo testnet before going live.
:::

## Configuration

```yaml
wallets:
  tempo-mainnet: "0xYourMerchantAddress"     # payments go here

accepts:
  - asset: "0x20c0000000000000000000000000000000000000"   # pathUSD
    network: tempo-mainnet

routes:
  "GET /premium/*":
    upstream: api
    price: "$10/month"          # pay once, access for 30 days

  "GET /search":
    upstream: api
    price: "$0.01"              # regular per-request route

settlement:
  strategy: tempo
  tempo:
    url: "${TEMPO_FACILITATOR_URL}"
    recipient: "0xYourMerchantAddress"
    network: mainnet
    token: pathUSD
    recurring:
      interval: monthly
    memo:
      invoice_id: "{customer_id}-{period}"
```

A complete example is in the gateway repo at [`examples/tollbooth.config.tempo.yaml`](https://github.com/x402-tollbooth/gateway/blob/main/examples/tollbooth.config.tempo.yaml).

### `settlement.tempo` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `settlement.url` | **Required** (here or as `settlement.url`). x402 facilitator that supports Tempo |
| `recipient` | `string` | **required** | Merchant address shown in attribution and memos. Set it to the same address as in `wallets` |
| `network` | `"mainnet" \| "testnet"` | `"mainnet"` | Network label used in attribution and memos |
| `token` | `string` | `"pathUSD"` | Token label used in attribution and memos |
| `recurring.interval` | `"daily" \| "weekly" \| "monthly" \| "yearly"` | — | Plan label. Fills `{period}` and `attribution.recurring` |
| `recurring.autoPay` | `boolean` | `false` | Recorded in `attribution.recurring` |
| `memo` | `Record<string, string>` | — | Memo templates (see below) |

**Where the money goes:** payments go to the route's pay-to address, which comes from `wallets` (or a route's `payTo`), and are paid in the `accepts` asset. `recipient`, `network`, `token` and `recurring` are labels. They don't change who gets paid or how much. If `recipient` doesn't match any address in `wallets`, tollbooth logs a `tempo_recipient_not_in_wallets` warning at startup.

**Network and asset names:** tollbooth has no built-in token metadata for Tempo, so the `network` and `asset` values in `accepts` are passed to your facilitator as written. Use the identifiers your facilitator expects. The pathUSD token address on Tempo mainnet is `0x20c0000000000000000000000000000000000000`.

Top-level and route-level `facilitator` settings are ignored with this strategy. tollbooth logs a warning if they're set.

## Subscription-style routes

A price with a period suffix makes the route time-based:

```yaml
routes:
  "GET /premium/*":
    upstream: api
    price: "$10/month"
```

How it works:

1. The first request with a valid payment is verified and **settled** for $10. tollbooth then starts a session for that payer on that route, lasting 30 days.
2. During the session, the client keeps sending its `payment-signature` header. tollbooth checks that the signature is valid but **doesn't charge again**.
3. When the period ends, the route returns `402` again and the client pays for the next period.

:::note[No automatic renewal]
tollbooth doesn't create an on-chain subscription or pull funds automatically, even with `recurring.autoPay: true`. Each period is a new payment made by the client. `recurring` only labels the settlement.
:::

The billing period comes from the **price suffix**, not from `recurring.interval`. Keep them consistent (for example, `"$10/month"` with `interval: monthly`).

Sessions live in the time-session store: in memory by default, and lost on restart. When running more than one instance, use Redis:

```yaml
stores:
  redis:
    url: "redis://localhost:6379"
  timeSession:
    backend: redis
```

Periodic prices work with every settlement strategy, not just `tempo`. See [Time-based pricing](/reference/configuration/#time-based-pricing) for the full list of suffixes.

## Attribution and memos

Each Tempo settlement carries extra fields:

| Field | Value |
|---|---|
| `customerId` | The payer address, lowercased |
| `attribution` | `{ recipient, token, network }`, plus `recurring: { interval, autoPay }` when configured |
| `memo` | Your `memo` templates with placeholders filled in (omitted when no templates are set) |

Memo placeholders:

| Placeholder | Value |
|---|---|
| `{customerId}`, `{customer_id}` | Payer address, lowercased |
| `{payer}` | Payer address as returned by the facilitator |
| `{period}` | `day`, `week`, `month` or `year` from `recurring.interval`, or `request` when `recurring` isn't set |
| `{recipient}`, `{network}`, `{token}` | The configured values |

Unknown placeholders are left as-is.

Memos and attribution are tollbooth-side metadata. They are **not written on-chain**. They appear in:

- the `payment_settled` log line (`customer_id`, `memo`, `attribution`)
- the `settlement` object passed to the [`onSettled` hook](/reference/configuration/#hooks), which you can use to write to your own billing system
- the payment receipt returned to the client (`payment-response` header)

Because the receipt goes to the client, don't put secrets in memo templates.

## Comparison with `mpp`

The `mpp` strategy also has a `tempo` *method*. The two do different jobs:

| | `strategy: tempo` | `strategy: mpp` with `type: tempo` |
|---|---|---|
| Headers | x402 | x402 + MPP (`WWW-Authenticate: Payment`) |
| Card payments | No | Yes, with the `stripe` method |
| Attribution and memos | Yes | No |
| Facilitator | `settlement.tempo.url` (or `settlement.url`) | `settlement.url`, then top-level `facilitator` |

Pick `strategy: tempo` for Tempo-only billing with attribution and memos. Pick [`mpp`](/how-it-works/mpp/) to accept several payment methods at once.

---

**Next:** [Settlement Strategies →](/how-it-works/settlement/)
