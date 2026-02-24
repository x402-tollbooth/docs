---
title: Monitoring & Observability
description: Structured logging, Prometheus-style metrics, and troubleshooting for production tollbooth deployments.
keywords:
  - monitoring
  - observability
  - metrics
  - logging
  - Prometheus
  - Grafana
  - structured logs
  - request ID
  - latency
  - 402
  - rate limiting
  - cache
  - troubleshooting
---

tollbooth emits structured JSON logs for every request. This guide covers the log fields you should index, the metrics you should track, and how to diagnose common production issues.

## Structured log fields

Every log line tollbooth produces is a JSON object. The fields below are the most useful for filtering, alerting, and dashboarding.

| Field | Type | Description |
|---|---|---|
| `msg` | `string` | Event type — `"request"`, `"payment_settled"`, `"route_not_found"`, `"settlement_failed"`, etc. |
| `timestamp` | `string` | ISO 8601 timestamp. |
| `level` | `string` | Log level: `"debug"`, `"info"`, `"warn"`, `"error"`. |
| `method` | `string` | HTTP method, e.g. `"POST"`. |
| `path` | `string` | Request path, e.g. `"/v1/messages"`. |
| `route` | `string` | Matched route pattern, e.g. `"POST /v1/messages"`. |
| `status` | `number` | HTTP status code returned to the client. |
| `duration_ms` | `number` | Total request duration in milliseconds. |
| `price` | `string` | Price charged for the route, e.g. `"$0.075"`. |
| `payer` | `string` | Payer wallet address extracted from the payment header. |
| `tx_hash` | `string` | On-chain transaction hash from settlement. |
| `amount` | `string` | Settlement amount. |
| `upstream_status` | `number` | HTTP status code from the upstream response. |
| `reason` | `string` | Reason for rejection or failure. |
| `error` | `string` | Error message, if any. |

### Log levels

| Level | When |
|---|---|
| `info` | Successful paid requests, settlements completed. |
| `warn` | 402 responses, 429 rate-limit blocks, recoverable failures. |
| `error` | Settlement failures, upstream crashes, hook errors. |
| `debug` | Verbose tracing for development. Disable in production. |

### Privacy note

:::caution
Never log raw API keys, full payment authorization headers, or other secrets. The `payer` field contains the wallet address from the payment header. If you ship logs to a third-party service, review which fields are indexed and who has access.
:::

### Example log lines

**Successful paid request:**

```json
{
  "msg": "request",
  "level": "info",
  "timestamp": "2025-12-01T14:30:00.000Z",
  "method": "POST",
  "path": "/v1/messages",
  "route": "POST /v1/messages",
  "status": 200,
  "duration_ms": 342,
  "price": "$0.075",
  "payer": "0x1234...abcd",
  "tx_hash": "0xdeadbeef..."
}
```

**Payment settled:**

```json
{
  "msg": "payment_settled",
  "level": "info",
  "timestamp": "2025-12-01T14:30:00.187Z",
  "route": "POST /v1/messages",
  "payer": "0x1234...abcd",
  "amount": "$0.075",
  "tx_hash": "0xdeadbeef..."
}
```

**402 — missing payment:**

```json
{
  "msg": "request",
  "level": "warn",
  "timestamp": "2025-12-01T14:30:01.000Z",
  "method": "GET",
  "path": "/data",
  "route": "GET /data",
  "status": 402,
  "duration_ms": 3,
  "price": "$0.01",
  "error": "missing payment-signature header"
}
```

**Settlement failed:**

```json
{
  "msg": "settlement_failed",
  "level": "error",
  "timestamp": "2025-12-01T14:30:02.000Z",
  "route": "POST /v1/messages",
  "payer": "0x1234...abcd",
  "reason": "facilitator timeout"
}
```

## Request ID correlation

tollbooth propagates request IDs for end-to-end tracing:

1. If the incoming request has an `X-Request-Id` header, tollbooth uses it.
2. Otherwise, tollbooth generates a `req_` prefixed UUID.
3. The ID is forwarded to the upstream in `X-Request-Id`.
4. The same ID appears in the response header and in every log line for that request.

This lets you correlate a single request across tollbooth logs, upstream API logs, and client-side traces.

## Prometheus-style metrics

When `gateway.metrics` is enabled, tollbooth exposes a Prometheus-compatible `/metrics` endpoint. Names follow the `tollbooth_` prefix convention.

```yaml
gateway:
  metrics: true
```

:::note
Prometheus counters reset on process restart. Always use `rate()` or `increase()` for alerting and dashboards — never raw counter values. Avoid putting unbounded identifiers (wallet addresses, API keys, request IDs) into labels; use logs for high-cardinality analysis. Add static labels like `env` or `instance` at scrape time in your Prometheus config, not in application code.
:::

### Counters

| Metric | Labels | Description |
|---|---|---|
| `tollbooth_requests_total` | `route`, `method`, `status` | Total requests by route, method, and HTTP status. |
| `tollbooth_payments_total` | `route`, `outcome` | Payment attempts. `outcome` = `success`, `rejected`, `missing`. |
| `tollbooth_settlements_total` | `strategy`, `outcome` | Settlement attempts. `outcome` = `success`, `failure`. |
| `tollbooth_cache_hits_total` | `route` | Verification cache hits. |
| `tollbooth_cache_misses_total` | `route` | Verification cache misses. |
| `tollbooth_rate_limit_blocks_total` | `route` | Requests blocked by rate limiting. Use logs for per-client breakdown — putting `client_id` in a Prometheus label causes cardinality explosion with unbounded wallet addresses. |
| `tollbooth_upstream_errors_total` | `upstream`, `status` | Non-2xx responses from upstreams. |
| `tollbooth_revenue_usd_total` | `route` | Cumulative revenue in USD from successful settlements. Incremented by the route price on each settled request. |

### Histograms

| Metric | Labels | Description |
|---|---|---|
| `tollbooth_request_duration_seconds` | `route`, `method` | End-to-end request latency. |
| `tollbooth_settlement_duration_seconds` | `strategy` | Settlement latency. |
| `tollbooth_upstream_duration_seconds` | `upstream` | Upstream response latency. |

### Gauges

| Metric | Labels | Description |
|---|---|---|
| `tollbooth_active_requests` | — | Currently in-flight requests. |

## Payment funnel

tollbooth's request lifecycle forms a conversion funnel. Tracking drop-off at each stage tells you exactly where revenue is lost.

**Request outcomes** (from `tollbooth_requests_total`):

```
All inbound requests
  ├─ 402 — payment required (client didn't pay)
  ├─ 200 — success (free route, cached session, or paid + settled + upstream OK)
  └─ 5xx — internal / upstream error
```

**Paid-request pipeline** (separate counters):

```
402 issued
  → tollbooth_payments_total{outcome="success"}      ← payment verified
    → tollbooth_settlements_total{outcome="success"}  ← settled on-chain
      → tollbooth_requests_total{status="200"}        ← upstream responded OK
        → tollbooth_revenue_usd_total                 ← revenue collected
```

Payment verification and settlement are separate phases — a payment can be verified successfully (`payments_total{outcome="success"}`) while the subsequent settlement still fails (`settlements_total{outcome="failure"}`). A healthy funnel has minimal drop-off between verification and settlement, and between settlement and successful upstream responses. If you see a gap between those first two counters, check facilitator health. A gap between settlements and 200s means upstreams are erroring after payment (see [Refund Protection](/guides/refund-protection/)).

## Dashboards you want

If you're using Grafana (or any Prometheus-compatible dashboarding tool), these are the panels worth setting up:

### Traffic overview

- **Request rate** — `rate(tollbooth_requests_total[5m])` broken down by `route`.
- **402 rate** — `rate(tollbooth_requests_total{status="402"}[5m])`. A spike means clients aren't sending payment headers. Check if a client library updated or a route price changed.
- **Error rate** — `rate(tollbooth_requests_total{status=~"5.."}[5m])` by `route`. Upstream failures vs. tollbooth errors.

### Revenue & payments

- **Revenue rate** — `rate(tollbooth_revenue_usd_total[5m])` by `route`. Shows real-time earning velocity.
- **Cumulative revenue** — `tollbooth_revenue_usd_total` by `route`. Total revenue per route since last restart. If you need persistent revenue accounting across restarts, export metrics to a remote store (e.g. Prometheus with long-term storage) or emit settlement events to an external analytics system — tollbooth itself is not an accounting system.
- **Settlement success rate** — `rate(tollbooth_settlements_total{outcome="success"}[5m]) / rate(tollbooth_settlements_total[5m])`. Alert if this drops below 99%.
- **Settlement latency p95** — `histogram_quantile(0.95, rate(tollbooth_settlement_duration_seconds_bucket[5m]))`. Facilitator latency over 500 ms warrants investigation.
- **Payment rejection rate** — `rate(tollbooth_payments_total{outcome="rejected"}[5m])`. Rejections mean invalid signatures or insufficient funds.

### Cache & rate limiting

- **Cache hit ratio** — `rate(tollbooth_cache_hits_total[5m]) / (rate(tollbooth_cache_hits_total[5m]) + rate(tollbooth_cache_misses_total[5m]))`. A high miss rate increases settlement load.
- **Rate-limit blocks** — `rate(tollbooth_rate_limit_blocks_total[5m])` by `route`. Use logs to identify specific abusive clients.

### Upstream health

- **Upstream latency p95** — `histogram_quantile(0.95, rate(tollbooth_upstream_duration_seconds_bucket[5m]))` by `upstream`.
- **Upstream error rate** — `rate(tollbooth_upstream_errors_total[5m])` by `upstream` and `status`.

## Suggested SLOs

Use these as starting points and tune based on your traffic patterns:

| SLO | Target | Metric |
|---|---|---|
| Settlement success rate | >= 99.5% | `rate(tollbooth_settlements_total{outcome="success"}[5m]) / rate(tollbooth_settlements_total[5m])` |
| Upstream p95 latency | < 800 ms | `histogram_quantile(0.95, rate(tollbooth_upstream_duration_seconds_bucket[5m]))` |
| 5xx error rate | < 0.5% | `tollbooth_requests_total{status=~"5.."} / tollbooth_requests_total` |
| Cache hit ratio | > 80% | `tollbooth_cache_hits_total / (tollbooth_cache_hits_total + tollbooth_cache_misses_total)` |

## Troubleshooting checklist

### High 402 rate

1. Check if clients are sending the `payment-signature` header.
2. Verify the route price hasn't changed unexpectedly — `grep price tollbooth.config.yaml`.
3. Check if the x402 discovery endpoint is reachable: `curl https://your-tollbooth/.well-known/x402`.
4. Look at log lines with `status: 402` — the `error` field tells you exactly why.

### Settlement failures

1. Check `tollbooth_settlements_total{outcome="failure"}` for the affected strategy.
2. For `facilitator` strategy: is the facilitator endpoint reachable? `curl https://x402.org/facilitator/health`.
3. Look at `duration_ms` on `settlement_failed` log lines — timeouts may indicate network issues.
4. Check for `msg: "settlement_failed"` entries in recent logs — the `reason` field tells you exactly why.

### High upstream latency

1. Compare `upstream_status` timing with `duration_ms` — if they're close, tollbooth isn't the bottleneck.
2. Check the upstream's own status page or health endpoint.
3. Look for `upstream_errors_total` spikes that coincide with latency increases.

### Low cache hit rate

1. Verify that verification caching is enabled in your config.
2. Check if clients are sending unique payment tokens per request (expected for fresh payments, but repeated verifications should hit cache).
3. A restart clears the in-memory cache — frequent restarts will reduce hit rate.

### Rate-limit blocks affecting legitimate traffic

1. Review the rate-limit config for the affected route.
2. Check `payer` in the blocked requests — is it a single heavy client or many?
3. Consider per-client rate limits instead of global limits if traffic patterns are uneven.

---

**Next:** [Refund Protection →](/guides/refund-protection/)
