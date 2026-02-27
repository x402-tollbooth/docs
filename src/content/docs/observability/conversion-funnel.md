---
title: Analytics & Conversion
description: Payment funnel stages and core conversion metrics.
keywords:
  - analytics
  - conversion
  - funnel
  - metrics
  - settlement
  - revenue
---

## Payment funnel

For paid routes, each request moves through these stages:

```
402 issued  →  payment sent  →  payment verified  →  settled  →  upstream served  →  response completed
```

Drop-off between any two stages tells you where revenue is lost.

## Core metrics

| Metric | Formula |
|---|---|
| Attempt rate | `payment_attempted / requires_payment` |
| Verification success | `payment_verified / payment_attempted` |
| Settlement success | `settled / payment_verified` |
| End-to-end conversion | `response_completed / requires_payment` |
| Revenue per paid request | `sum(settled_amount) / count(settled)` |

## What to track per event

Every event should carry a shared `request_id` plus:

- `route_id` — which route
- `status_code` — HTTP status at this stage
- `pricing_mode` — `static`, `rule-based`, `token-based`, or `custom-fn`
- `settlement_mode` — `before-response` or `after-response`

For failure events, include `failure_code` and `failure_reason` so drop-off reasons are explicit rather than inferred from missing success events.

## Segment by

- `route_id` — which routes convert best
- `upstream_id` — upstream health impact on conversion
- `pricing_mode` — how pricing strategy affects conversion
- `network` / `asset` — payment method performance

## Key signals

- **Gap between verification and settlement** — check facilitator health
- **Gap between settlement and 200s** — upstreams are failing after payment (see [Refund Protection](/guides/refund-protection/))
- **High 402 rate with low attempt rate** — clients aren't paying, could be price too high or SDK issue

:::caution
Never log raw wallet addresses or API keys. Hash identifiers before storing.
:::
