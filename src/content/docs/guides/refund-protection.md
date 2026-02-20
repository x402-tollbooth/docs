---
title: Refund Protection
description: Use after-response settlement and hooks to avoid charging for failed upstream requests.
keywords:
  - refund
  - settlement
  - after-response
  - before-response
  - hooks
  - onResponse
  - upstream failure
  - 5xx
  - charge protection
  - rate limit
---

By default, tollbooth settles payment **before** proxying to the upstream API. This is fast, but it means the client pays even if the upstream returns an error. With `after-response` settlement, tollbooth defers settlement until the upstream responds — and only charges if the response is successful.

## Settlement modes

tollbooth supports two settlement strategies:

| Mode | When payment settles | Default? |
|------|---------------------|----------|
| `before-response` | Before the upstream is called | Yes |
| `after-response` | After the upstream responds successfully | No |

### `before-response` (default)

```
Client → Tollbooth → Facilitator (settle) → Upstream → Client
```

Payment is settled as soon as the signature is verified. The upstream request happens after. If the upstream fails, the payment has already been collected.

### `after-response`

```
Client → Tollbooth → Facilitator (verify) → Upstream → Facilitator (settle) → Client
```

The facilitator verifies the payment signature upfront but doesn't settle on-chain until the upstream responds. If the upstream fails, the payment is never settled and the client keeps their funds.

## Tradeoffs

| | `before-response` | `after-response` |
|---|---|---|
| **Latency** | Lower — single facilitator round-trip | Higher — two facilitator round-trips |
| **Refund risk** | Client pays even on upstream failure | Client only pays on success |
| **Best for** | Fast, reliable upstreams | Expensive calls, unreliable upstreams |
| **Complexity** | Simple | Requires deciding what "success" means |

## Configuration

Set `settlement: after-response` on any route:

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    price: "$0.075"
    settlement: after-response
```

You can mix modes — some routes settle before, others after:

```yaml
routes:
  "GET /weather":
    upstream: weather
    price: "$0.001"
    # default: before-response (fast, cheap, reliable upstream)

  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    price: "$0.075"
    settlement: after-response  # expensive call, protect the client
```

## Default settlement behavior

When using `after-response`, tollbooth decides whether to settle based on the upstream's HTTP status code:

| Status code | Settles? | Reason |
|-------------|----------|--------|
| `2xx` | Yes | Successful response |
| `3xx` | Yes | Redirect (upstream handled the request) |
| `4xx` | Yes | Client error (not the upstream's fault) |
| `5xx` | No | Server error — upstream failed |
| Timeout / no response | No | Upstream unreachable |

In short: the client is only protected from upstream failures (`5xx` and timeouts). Client-side errors like `400 Bad Request` still settle because the upstream processed the request correctly.

## Custom refund logic with `onResponse`

The default rules work for most cases, but you can override them with an `onResponse` hook for full control over what settles:

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    price: "$0.075"
    settlement: after-response
    hooks:
      onResponse: "hooks/refund-policy.ts"
```

The hook receives the upstream response and can prevent settlement by returning `{ settle: false }`:

```ts
// hooks/refund-policy.ts
import type { ResponseHookContext } from "x402-tollbooth";

export default async (ctx: ResponseHookContext) => {
  const { status, body } = ctx.response;

  // Don't settle on any error
  if (status >= 400) {
    return { settle: false };
  }

  // Don't settle if the model returned an empty response
  if (!body?.content?.length || body.content[0]?.text?.length === 0) {
    return { settle: false };
  }

  // Settle normally
  return { settle: true };
};
```

### What the hook can check

| Field | Type | Description |
|-------|------|-------------|
| `ctx.response.status` | `number` | Upstream HTTP status code |
| `ctx.response.body` | `unknown` | Parsed response body (if JSON) |
| `ctx.response.headers` | `Record<string, string>` | Upstream response headers |
| `ctx.request.body` | `unknown` | Original request body |
| `ctx.route` | `RouteConfig` | The matched route configuration |
| `ctx.payment` | `PaymentInfo` | Payment details (amount, payer, etc.) |

### Example: refund on rate limit

```ts
// hooks/refund-on-rate-limit.ts
export default async (ctx) => {
  // Anthropic returns 429 when rate-limited
  if (ctx.response.status === 429) {
    return { settle: false };
  }

  return { settle: true };
};
```

### Example: refund on empty completions

```ts
// hooks/refund-empty-completion.ts
export default async (ctx) => {
  const body = ctx.response.body as
    | { choices?: unknown[]; content?: unknown[] }
    | undefined;

  // OpenAI-style: check if choices array is empty
  if (body?.choices?.length === 0) {
    return { settle: false };
  }

  // Anthropic-style: check if content is empty
  if (body?.content?.length === 0) {
    return { settle: false };
  }

  return { settle: true };
};
```

---

**Next:** [Configuration Reference →](/reference/configuration/)
