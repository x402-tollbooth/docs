---
title: Monitoring & Observability
description: Prometheus metrics and structured logging for production tollbooth deployments.
keywords:
  - monitoring
  - observability
  - metrics
  - logging
  - Prometheus
  - Grafana
---

## Enable Prometheus metrics

```yaml
gateway:
  metrics:
    enabled: true
    path: /metrics # default
```

## Available metrics

### Counters

| Metric | Labels | Description |
|---|---|---|
| `tollbooth_requests_total` | `route`, `method`, `status` | Total requests |
| `tollbooth_payments_total` | `route`, `outcome` | Payment attempts (`success`, `rejected`, `missing`) |
| `tollbooth_settlements_total` | `strategy`, `outcome` | Settlement attempts (`success`, `failure`) |
| `tollbooth_cache_hits_total` | `route` | Verification cache hits |
| `tollbooth_cache_misses_total` | `route` | Verification cache misses |
| `tollbooth_rate_limit_blocks_total` | `route` | Requests blocked by rate limiting |
| `tollbooth_upstream_errors_total` | `upstream`, `status` | Non-2xx responses from upstreams |
| `tollbooth_revenue_usd_total` | `route` | Cumulative revenue in USD |

### Histograms

| Metric | Labels | Description |
|---|---|---|
| `tollbooth_request_duration_seconds` | `route`, `method` | End-to-end request latency |
| `tollbooth_settlement_duration_seconds` | `strategy` | Settlement latency |
| `tollbooth_upstream_duration_seconds` | `upstream` | Upstream response latency |

### Gauges

| Metric | Description |
|---|---|
| `tollbooth_active_requests` | Currently in-flight requests |

## Useful queries

```promql
# p95 latency per route
histogram_quantile(0.95, sum by (le, route, method) (rate(tollbooth_request_duration_seconds_bucket[5m])))

# 402 rate
sum(rate(tollbooth_requests_total{status="402"}[5m])) / sum(rate(tollbooth_requests_total[5m]))

# Settlement success rate
rate(tollbooth_settlements_total{outcome="success"}[5m]) / rate(tollbooth_settlements_total[5m])

# Revenue rate by route
rate(tollbooth_revenue_usd_total[5m])
```

## Prometheus scrape config

```yaml
scrape_configs:
  - job_name: tollbooth
    metrics_path: /metrics
    static_configs:
      - targets: ["localhost:3000"]
```

## Structured logs

Every log line is JSON. Key fields:

| Field | Description |
|---|---|
| `request_id` | Unique per request (from `X-Request-Id` header or auto-generated) |
| `route_id` | Matched route pattern |
| `status` | HTTP status returned |
| `latency_ms` | Total request duration |
| `settlement_latency_ms` | Settlement round-trip time |
| `upstream_latency_ms` | Upstream response time |
| `error` | Error message, if any |

Log levels: `info` (successful requests), `warn` (402s, rate limits), `error` (settlement/upstream failures), `debug` (verbose, disable in production).

:::caution
Never log raw API keys or full payment headers. Use truncated payer addresses for `client_id`.
:::

## Troubleshooting

**High 402 rate** — Check if clients are sending the payment header. Verify route prices haven't changed unexpectedly.

**Settlement failures** — Check facilitator endpoint health. Look at `settlement_latency_ms` for timeouts.

**High upstream latency** — Compare `upstream_latency_ms` with `latency_ms`. If they're close, tollbooth isn't the bottleneck.

---

**Next:** [Refund Protection →](/guides/refund-protection/)
