---
title: Dynamic Pricing
description: Configure per-model, per-param, and custom function pricing in tollbooth.
keywords:
  - pricing
  - match rules
  - glob pattern
  - body match
  - query match
  - header match
  - fallback price
  - custom pricing function
  - PricingFn
  - per-model pricing
  - static pricing
---

tollbooth supports several pricing strategies, from a single static price to request-aware dynamic pricing with custom functions.

## Static pricing

The simplest approach. Set a fixed `price` on the route:

```yaml
routes:
  "GET /weather":
    upstream: myapi
    price: "$0.01"
```

Every request to `GET /weather` costs $0.01 USDC regardless of content.

## Match rules

Match on request content to set different prices based on body fields, query parameters, headers, or path parameters. Rules are evaluated **top-to-bottom** — the first match wins.

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    match:
      - where: { body.model: "claude-haiku-*" }
        price: "$0.005"
      - where: { body.model: "claude-sonnet-*" }
        price: "$0.015"
      - where: { body.model: "claude-opus-*" }
        price: "$0.075"
    fallback: "$0.015"
```

### `where` clause sources

| Prefix | Source | Example |
|--------|--------|---------|
| `body.*` | JSON request body | `body.model: "claude-opus-*"` |
| `query.*` | URL query parameters | `query.tier: "premium"` |
| `headers.*` | Request headers | `headers.x-priority: "high"` |
| `params.*` | Path parameters | `params.query_id: "123*"` |

### Glob patterns

Values in `where` clauses support glob matching:

- `"claude-*"` matches `claude-haiku-3`, `claude-sonnet-4`, etc.
- `"gpt-4o*"` matches `gpt-4o`, `gpt-4o-mini`
- `"*"` matches anything

## Fallback price

When using `match` rules, always provide a `fallback` price. If no rule matches the request, the fallback is used instead of rejecting the request.

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    match:
      - where: { body.model: "claude-opus-*" }
        price: "$0.075"
    fallback: "$0.015"  # all other models
```

If no `fallback` is specified, the global `defaults.price` is used.

## Custom pricing functions

For complex pricing logic that goes beyond pattern matching, use a custom function:

```yaml
routes:
  "POST /ai/completions":
    upstream: anthropic
    price:
      fn: "pricing/completions.ts"
```

The function receives the request details and returns a price:

```ts
// pricing/completions.ts
import type { PricingFn } from "x402-tollbooth";

const priceFn: PricingFn = ({ body }) => {
  const model = (body as any)?.model ?? "claude-sonnet";
  const maxTokens = (body as any)?.max_tokens ?? 1024;
  const rate = model.includes("opus") ? 0.015 : 0.003;
  return rate * Math.ceil(maxTokens / 1000);
};

export default priceFn;
```

### `PricingFn` signature

```ts
interface PricingFnInput {
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: Record<string, string>;
}

type PricingFn = (input: PricingFnInput) => string | number | Promise<string | number>;
```

The function can return:
- A **number** — interpreted as a dollar amount (e.g. `0.01` = $0.01)
- A **string** — interpreted as a dollar string (e.g. `"$0.01"`)

## Example: pricing by model name

A multi-provider AI gateway with per-model pricing:

```yaml
upstreams:
  anthropic:
    url: "https://api.anthropic.com"
    headers:
      x-api-key: "${ANTHROPIC_API_KEY}"
      anthropic-version: "2023-06-01"
  openai:
    url: "https://api.openai.com"
    headers:
      authorization: "Bearer ${OPENAI_API_KEY}"

routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    match:
      - where: { body.model: "claude-haiku-*" }
        price: "$0.005"
      - where: { body.model: "claude-sonnet-*" }
        price: "$0.015"
      - where: { body.model: "claude-opus-*" }
        price: "$0.075"
    fallback: "$0.015"

  "POST /ai/gpt":
    upstream: openai
    path: "/v1/chat/completions"
    match:
      - where: { body.model: "gpt-4o" }
        price: "$0.01"
      - where: { body.model: "gpt-4o-mini" }
        price: "$0.002"
    fallback: "$0.01"
```

## Example: pricing by query parameter

Charge different rates based on a query parameter:

```yaml
routes:
  "GET /data/:query_id":
    upstream: dune
    path: "/v1/query/${params.query_id}/results"
    match:
      - where: { query.format: "csv" }
        price: "$0.10"
      - where: { query.format: "json" }
        price: "$0.05"
    fallback: "$0.05"
```

`GET /data/12345?format=csv` costs $0.10, `GET /data/12345?format=json` costs $0.05.

---

**Next:** [Local Testing →](/guides/local-testing/)
