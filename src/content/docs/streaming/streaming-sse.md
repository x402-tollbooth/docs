---
lastUpdated: 2026-02-27
title: Streaming & SSE
description: Run paid streaming endpoints with the right settlement timing.
keywords:
  - streaming
  - SSE
  - settlement timing
  - before-response
  - after-response
  - LLM streaming
---

Streaming works in tollbooth without response buffering, including Server-Sent Events (SSE). The key decision is settlement timing — when payment is finalized relative to when bytes start flowing.

## Settlement timing for streams

| Mode | Behavior | Best for |
|---|---|---|
| `before-response` | Payment settled, then stream opens | Premium streams — guarantees payment before content |
| `after-response` | Payment verified, stream opens, then settled | Unreliable upstreams — protects against 5xx/timeouts |

`after-response` does **not** protect against mid-stream failures. Once a `200` is returned and settlement happens, a stream that terminates early is still charged.

## Example: pay-per-request LLM streaming

```yaml
upstreams:
  openai:
    url: "https://api.openai.com"
    headers:
      authorization: "Bearer ${OPENAI_API_KEY}"

routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: token-based
    settlement: before-response
```

Works for both non-stream and `stream: true` requests. Payment is guaranteed before bytes start.

## Example: time-window session streaming

Use a paid route to start a session, then stream for free while the session is valid.

```yaml
routes:
  "POST /session/start":
    upstream: stream-api
    price: "$0.25"
    settlement: before-response

  "GET /session/:id/events":
    upstream: stream-api
    path: "/session/${params.id}/events"
    price: "$0.00"
    hooks:
      onRequest: "hooks/require-valid-session.ts"
```

The hook validates a signed session token and rejects with `401` when expired. This avoids re-paying on every reconnect.

## Troubleshooting

**Stream stalls after headers** — Disable proxy buffering (`proxy_buffering off;` in Nginx). Increase read timeouts for long-lived responses.

**Works locally, breaks in production** — Check CDN/WAF buffering and HTTP/1.1 keep-alive behavior across load balancers. See [VPS + Nginx](/production/vps/).

**Repeated 402 prompts on reconnect** — Consider switching to a time-window session model to reduce payment friction.

---

**See also:** [Refund Protection](/streaming/refund-protection/) · [Configuration Reference](/reference/configuration/)
