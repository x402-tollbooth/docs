---
title: Streaming & SSE
description: Run paid streaming endpoints with clear settlement timing, pricing models, and operational guardrails.
keywords:
  - streaming
  - SSE
  - settlement timing
  - before-response
  - after-response
  - LLM streaming
  - session pricing
  - troubleshooting
---

Streaming works in tollbooth without response buffering, including Server-Sent Events (SSE). The important decision is settlement timing: when payment is finalized relative to when stream bytes start flowing.

## How timing works for streaming

For streaming routes, `before-response` and `after-response` behave differently at the first-byte boundary:

| Mode | What happens before first byte to client | Good fit | Main risk |
|---|---|---|---|
| `before-response` | Payment is settled first, then upstream stream is opened | Premium streams where you must guarantee payment before content | Client is charged even if upstream fails later |
| `after-response` | Payment is verified, upstream is called, then settlement is attempted once upstream response is known | Unreliable/expensive upstreams where charge protection matters | Extra latency before stream starts; settlement can fail after upstream already did work |

In practice, first-byte latency for streaming is:

1. x402 verification/settlement round-trips
2. upstream time-to-first-byte
3. any reverse-proxy buffering or timeout behavior

## Known limitations and trade-offs

### 1) `after-response` does not protect against mid-stream failure

With SSE, a `200` can be returned and then the stream can still terminate early. If settlement already happened, the request is still charged.

Use `after-response` to protect against obvious upstream failures (`5xx`, timeouts, no response), not token-perfect delivery guarantees.

### 2) Settlement failure path is different by mode

- `before-response`: settlement failure stops the request before upstream is called.
- `after-response`: upstream may already be called; if settlement fails, the stream cannot be delivered as a paid success response.

If your upstream bills you per request/token, this can create provider-cost exposure even when the client was not charged.

### 3) Proxy defaults can break SSE even when tollbooth is correct

SSE often fails because of proxy buffering or short read timeouts, not tollbooth routing logic. See troubleshooting below.

## Recommended patterns

| Use case | Settlement mode | Why |
|---|---|---|
| Paid LLM/chat stream where payment certainty matters most | `before-response` | No stream starts until payment is finalized |
| Upstream is flaky and refund protection matters most | `after-response` | Avoid charging on upstream `5xx` or timeout |
| Long-lived sessions (10-60 min stream windows) | Session purchase route + free stream route | Avoid per-message payment friction |

## Example 1: Pay-per-request LLM streaming proxy

Charge each streaming completion request. This is the simplest model for AI APIs.

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

Why this works well:

- Works for both non-stream and `stream: true` requests.
- Payment is guaranteed before bytes start.
- No custom hooks required.

Client UX pattern:

1. Call stream endpoint.
2. If `402`, show pay prompt and sign.
3. Retry same request with payment headers.
4. Render stream chunks as they arrive.

## Example 2: Time-window session streaming (pay once, stream N minutes)

Use one paid route to mint a short-lived session, then allow free SSE calls while session is valid.

```yaml
# tollbooth.config.yaml
gateway:
  port: 3000

upstreams:
  stream-api:
    url: "https://stream.example.com"
    timeout: 900

routes:
  # Step 1: paid session purchase
  "POST /session/start":
    upstream: stream-api
    path: "/session/start"
    price: "$0.25"
    settlement: before-response

  # Step 2: stream within the active session
  "GET /session/:id/events":
    upstream: stream-api
    path: "/session/${params.id}/events"
    price: "$0.00"
    hooks:
      onRequest: "hooks/require-valid-session.ts"
```

`hooks/require-valid-session.ts` validates a signed session token (for example, 15-minute TTL). Reject with `401` when expired. This keeps pricing predictable for long streams and avoids re-paying every reconnect.

## Pricing model guidance

| Model | Best for | Notes |
|---|---|---|
| Fixed upfront per request | Most LLM streaming APIs | Easiest to reason about and document |
| Post-hoc exact usage | Advanced billing systems | Requires custom metering + settlement logic outside simple route pricing |
| Time-window sessions | Live feeds, dashboards, room streams | Better reconnect UX and fewer payment prompts |

For most teams, start with fixed upfront pricing, then move to session windows only when reconnect behavior becomes a UX problem.

## Troubleshooting streaming issues

### Stream stalls after headers

- Disable proxy buffering (`proxy_buffering off;`) in Nginx.
- Ensure `Cache-Control: no-cache` and `Connection: keep-alive` headers are preserved.
- Increase upstream/proxy read timeouts for long-lived responses.

### Partial stream then disconnect

- Check upstream logs first; many providers close idle streams.
- Increase route/upstream timeout.
- Add client auto-reconnect with idempotency keys to avoid duplicate work.

### Client sees repeated `402` prompts

- Reuse signed payment headers only within their validity window.
- Ensure client retries the same request payload after a `402`.
- If reconnect frequency is high, move to a time-window session model.

### Works locally, breaks in production

- Verify CDN/WAF is not buffering or transforming SSE.
- Confirm HTTP/1.1 keep-alive behavior across load balancers.
- Compare with the production proxy guidance in [Production (VPS)](/deploy/production/).

## See also

- [Refund Protection](/guides/refund-protection/)
- [Configuration Reference](/reference/configuration/)
- [Example: Video Streaming Paywall](/examples/video-streaming-paywall/)

---

**Next:** [Refund Protection →](/guides/refund-protection/)
