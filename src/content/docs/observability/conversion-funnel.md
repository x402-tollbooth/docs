---
title: Analytics & Conversion
description: Define tollbooth's payment funnel, event taxonomy, and core conversion metrics from request to settlement and response completion.
keywords:
  - analytics
  - conversion
  - funnel
  - observability
  - metrics
  - settlement
  - drop-off
  - revenue
---

Use this model to answer the questions that matter for paid APIs:

- Which requests hit a paywall but never convert?
- Which paid requests fail before a response completes?
- Which routes convert best and generate the most revenue?
- Where does settlement fail and why?

## Funnel definition

For routes that require payment, model one request through these stages:

1. `total_request`
2. `requires_payment` (402 challenge issued)
3. `payment_attempted` (client sends payment proof/signature)
4. `payment_verified`
5. `settled` (if settlement occurs)
6. `upstream_served` or `response_stream_started`
7. `response_completed`

For free routes, emit `total_request` and `response_completed` only.

## Event taxonomy

Emit structured events with a shared `request_id` so one request can be joined across all stages.

### Required fields on every event

| Field | Type | Notes |
|---|---|---|
| `ts` | RFC3339 timestamp | Event time in UTC |
| `event` | string | One of the event names below |
| `request_id` | string | Stable per incoming request |
| `trace_id` | string | Optional distributed trace id |
| `route_id` | string | Logical route key (for example `POST /ai/chat`) |
| `upstream_id` | string | Mapped upstream name |
| `method` | string | HTTP method |
| `path_template` | string | Normalized route template, never raw path params |
| `status_code` | int | HTTP status visible at this stage |
| `pricing_mode` | enum | `static`, `rule-based`, `token-based`, `custom-fn` |
| `settlement_mode` | enum | `before-response` or `after-response` |
| `identity_type` | enum | `wallet`, `api_key`, `ip`, `anonymous`, etc |
| `identity_hash` | string | Privacy-safe hashed identity key |
| `client_app` | string | SDK/app identifier if present |

### Funnel stage events

| Event | Required stage fields |
|---|---|
| `total_request` | `is_paid_route` |
| `requires_payment` | `quoted_amount_atomic`, `asset`, `network`, `challenge_timeout_s` |
| `payment_attempted` | `payment_scheme`, `proof_size_bytes` |
| `payment_verified` | `payer_hash`, `verified_amount_atomic` |
| `settled` | `settled_amount_atomic`, `settlement_latency_ms`, `tx_hash` |
| `upstream_served` / `response_stream_started` | `upstream_status_code`, `ttfb_ms` |
| `response_completed` | `response_bytes`, `duration_ms` |

### Non-funnel outcome events (recommended)

These make drop-off reasons explicit:

- `payment_verification_failed` with `failure_code`, `failure_reason`
- `settlement_failed` with `failure_code`, `failure_reason`, `retryable`
- `upstream_failed` with `failure_code`, `upstream_status_code`
- `response_aborted` with `abort_reason` (`client_disconnect`, `timeout`, etc.)

## Core metrics

Use event counts and sums by time window (for example 5m, 1h, 1d):

- `paywall_rate = count(requires_payment) / count(total_request where is_paid_route=true)`
- `attempt_rate = count(payment_attempted) / count(requires_payment)`
- `verification_success_rate = count(payment_verified) / count(payment_attempted)`
- `settlement_success_rate = count(settled) / count(payment_verified)` for routes where settlement should occur
- `served_rate = count(response_completed) / count(payment_verified)` (or `/ count(settled)` if you only care about post-settlement serving)
- `end_to_end_conversion = count(response_completed) / count(requires_payment)`
- `avg_revenue_per_request = sum(settled_amount_atomic) / count(total_request)` for paid routes
- `avg_revenue_per_paid_request = sum(settled_amount_atomic) / count(settled)`
- `settlement_latency_p50/p95` from `settlement_latency_ms`

## Segment dimensions

Always slice metrics by:

- `route_id`
- `upstream_id`
- `pricing_mode`
- `settlement_mode`
- `identity_type`
- `client_app`
- `network` and `asset`

Common high-signal cuts:

- Route conversion: `route_id`
- Revenue concentration: `route_id`, `upstream_id`
- Abuse/debugging: `identity_type`, `client_app`, `failure_code`

## Example queries

### SQL-ish: funnel conversion by route

```sql
WITH e AS (
  SELECT
    date_trunc('hour', ts) AS bucket,
    route_id,
    event,
    request_id
  FROM gateway_events
  WHERE ts >= now() - interval '7 days'
)
SELECT
  bucket,
  route_id,
  COUNT(DISTINCT request_id) FILTER (WHERE event = 'requires_payment') AS paywalled,
  COUNT(DISTINCT request_id) FILTER (WHERE event = 'payment_attempted') AS attempted,
  COUNT(DISTINCT request_id) FILTER (WHERE event = 'payment_verified') AS verified,
  COUNT(DISTINCT request_id) FILTER (WHERE event = 'settled') AS settled,
  COUNT(DISTINCT request_id) FILTER (WHERE event = 'response_completed') AS completed,
  ROUND(
    COUNT(DISTINCT request_id) FILTER (WHERE event = 'response_completed')::numeric
    / NULLIF(COUNT(DISTINCT request_id) FILTER (WHERE event = 'requires_payment'), 0),
    4
  ) AS end_to_end_conversion
FROM e
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

### SQL-ish: drop-off reasons after payment verification

```sql
SELECT
  route_id,
  COALESCE(failure_code, abort_reason, 'unknown') AS reason,
  COUNT(*) AS failures
FROM gateway_events
WHERE ts >= now() - interval '7 days'
  AND event IN ('settlement_failed', 'upstream_failed', 'response_aborted')
GROUP BY 1, 2
ORDER BY failures DESC;
```

### SQL-ish: revenue per route

```sql
SELECT
  route_id,
  SUM(settled_amount_atomic) / 1000000.0 AS usdc_revenue,
  COUNT(*) AS successful_settlements,
  AVG(settlement_latency_ms) AS avg_settlement_latency_ms
FROM gateway_events
WHERE event = 'settled'
  AND ts >= now() - interval '30 days'
GROUP BY route_id
ORDER BY usdc_revenue DESC;
```

### PromQL-ish: conversion and settlement health

```txt
# 5m end-to-end conversion on paid routes
sum(rate(tollbooth_event_total{event="response_completed",is_paid_route="true"}[5m]))
/
sum(rate(tollbooth_event_total{event="requires_payment"}[5m]))

# Settlement success rate
sum(rate(tollbooth_event_total{event="settled"}[5m]))
/
sum(rate(tollbooth_event_total{event="payment_verified"}[5m]))

# P95 settlement latency
histogram_quantile(
  0.95,
  sum by (le) (rate(tollbooth_settlement_latency_seconds_bucket[5m]))
)
```

## Privacy-safe identity guidance

- Never log raw API keys, wallet addresses, email addresses, or full IPs.
- Derive `identity_hash = sha256(salt || canonical_identity)` and keep salt outside logs.
- Rotate the salt on a defined cadence and keep historical mapping only where required.
- Prefer low-cardinality tags (`identity_type`, `client_app`) over high-cardinality raw identifiers.
- Keep payload logging off by default; log only request metadata needed for pricing, auditing, and debugging.

## Implementation notes

- Emit one event per stage transition as structured JSON logs and/or metrics counters.
- Ensure all events for one request share `request_id` and normalized `route_id`.
- Record explicit failure events instead of inferring failures from missing success events.
- Keep amount fields in atomic units (`USDC = 6 decimals`) and convert in dashboards.
