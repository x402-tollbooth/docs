---
title: Configuration Reference
description: Complete reference for tollbooth.config.yaml — every field, type, default, and example.
---

tollbooth is configured via a single `tollbooth.config.yaml` file. All fields are documented below.

## Full example

```yaml
# tollbooth.config.yaml

gateway:
  port: 3000
  discovery: true

wallets:
  base: "0xYourBaseWallet"
  solana: "YourSolanaWallet"

accepts:
  - asset: USDC
    network: base
  - asset: USDC
    network: solana

defaults:
  price: "$0.001"
  timeout: 60

facilitator: https://x402.org/facilitator

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

  "POST /v1/chat/completions":
    upstream: openai
    type: openai-compatible
    models:
      gpt-4o: "$0.05"
      gpt-4o-mini: "$0.005"

hooks:
  onSettled: "hooks/log-payment.ts"
  onError: "hooks/handle-error.ts"
```

---

## `gateway`

Top-level server configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `3000` | Port the gateway listens on |
| `discovery` | `boolean` | `true` | Expose `/.well-known/x402` discovery endpoint |
| `hostname` | `string` | — | Optional hostname to bind to |

```yaml
gateway:
  port: 8080
  discovery: true
```

---

## `wallets`

Maps network names to your wallet addresses. These are the addresses that receive payments.

| Field | Type | Description |
|-------|------|-------------|
| `<network>` | `string` | Wallet address for the given network |

```yaml
wallets:
  base: "0xYourBaseWallet"
  base-sepolia: "0xYourTestnetWallet"
  solana: "YourSolanaWallet"
```

The network names must match the networks in your `accepts` array.

---

## `accepts`

Array of payment methods the gateway accepts. Each entry specifies an asset and network combination.

| Field | Type | Description |
|-------|------|-------------|
| `asset` | `string` | Token symbol (e.g. `USDC`) |
| `network` | `string` | Network name (e.g. `base`, `base-sepolia`, `solana`) |

```yaml
accepts:
  - asset: USDC
    network: base
  - asset: USDC
    network: solana
```

Routes can override accepted payments with a route-level `accepts` field.

---

## `defaults`

Default values applied to all routes unless overridden.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `price` | `string` | — | Default price for routes without an explicit price (e.g. `"$0.001"`) |
| `timeout` | `number` | `60` | Default payment timeout in seconds |

```yaml
defaults:
  price: "$0.001"
  timeout: 60
```

Prices are specified as dollar strings. `"$0.01"` = 10,000 USDC micro-units (6 decimals).

---

## `facilitator`

URL of the x402 facilitator service that verifies and settles payments.

| Field | Type | Default |
|-------|------|---------|
| `facilitator` | `string` | `https://x402.org/facilitator` |

```yaml
facilitator: https://custom-facilitator.example.com
```

Can be overridden per-route. Route-level `facilitator` takes precedence over this top-level setting. If neither is specified, defaults to `https://x402.org/facilitator`.

---

## `upstreams`

Named upstream API configurations. Each upstream defines where requests are proxied to.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | **required** | Base URL of the upstream API |
| `headers` | `Record<string, string>` | — | Headers to inject into proxied requests |
| `timeout` | `number` | — | Request timeout in seconds for this upstream |

```yaml
upstreams:
  anthropic:
    url: "https://api.anthropic.com"
    headers:
      x-api-key: "${ANTHROPIC_API_KEY}"
      anthropic-version: "2023-06-01"
    timeout: 120

  dune:
    url: "https://api.dune.com/api"
    headers:
      x-dune-api-key: "${DUNE_API_KEY}"
```

### Environment variable interpolation

Header values support `${ENV_VAR}` syntax. Variables are resolved from `process.env` at startup. This keeps secrets out of your config file.

```yaml
headers:
  authorization: "Bearer ${API_KEY}"
```

---

## `routes`

The core of your config. Maps public-facing routes to upstream APIs with pricing.

Route keys use the format `"METHOD /path"`:

```yaml
routes:
  "GET /weather":
    upstream: myapi
    price: "$0.01"

  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"
    price: "$0.015"

  "GET /data/:query_id":
    upstream: dune
    path: "/v1/query/${params.query_id}/results"
    price: "$0.05"
```

### Route fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `upstream` | `string` | **required** | Name of the upstream (must match a key in `upstreams`) |
| `path` | `string` | same as route path | Path to forward to on the upstream. Supports `${params.*}` interpolation |
| `price` | `string \| { fn: string }` | from `defaults.price` | Static price or path to a custom pricing function |
| `match` | `MatchRule[]` | — | Array of conditional pricing rules (evaluated top-to-bottom) |
| `fallback` | `string` | from `defaults.price` | Price when no `match` rule matches |
| `accepts` | `AcceptedPayment[]` | from top-level `accepts` | Override accepted payments for this route |
| `payTo` | `string \| PayToSplit[]` | from `wallets` | Override payment recipient or configure split payments |
| `hooks` | `RouteHooksConfig` | — | Per-route lifecycle hooks (override global hooks) |
| `metadata` | `Record<string, unknown>` | — | Arbitrary metadata included in discovery responses |
| `facilitator` | `string` | from top-level `facilitator` | Override the facilitator URL for this route |

### Path parameters

Route paths support Express-style parameters with `:param` syntax:

```yaml
routes:
  "GET /data/:query_id":
    upstream: dune
    path: "/v1/query/${params.query_id}/results"
    price: "$0.05"
```

`GET /data/12345` → proxied to `https://api.dune.com/api/v1/query/12345/results`

### Path rewriting

The `path` field lets your public API shape differ from the upstream:

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"     # upstream path differs from public path
    price: "$0.015"
```

### OpenAI-Compatible Routes

For proxying OpenAI-compatible APIs (OpenAI, OpenRouter, LiteLLM, Ollama, etc.), set `type: openai-compatible` to enable automatic model-based pricing without writing match rules.

The gateway auto-extracts the `model` field from the JSON request body and prices the request using a built-in table of common models (GPT-4o, Claude, Gemini, Llama, Mistral, DeepSeek, etc.).

#### Basic example

```yaml
upstreams:
  openai:
    url: "https://api.openai.com/"
    headers:
      authorization: "Bearer ${OPENAI_API_KEY}"

routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: openai-compatible

  "POST /v1/completions":
    upstream: openai
    type: openai-compatible
```

#### Override or extend model pricing

Add a `models` map to set custom prices or add models not in the default table:

```yaml
routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: openai-compatible
    models:
      gpt-4o: "$0.05"          # override default
      gpt-4o-mini: "$0.005"    # override default
      my-fine-tune: "$0.02"    # custom model
    fallback: "$0.01"          # price for models not in any table
```

#### Price resolution order

When pricing an OpenAI-compatible request, the gateway checks:

1. `models` (your route overrides) — exact match
2. Built-in default table — exact match
3. `price` / `fallback` / `defaults.price` — standard fallback chain

#### Streaming support

Streaming responses (SSE) work out of the box — the gateway preserves the ReadableStream without buffering.

---

## `match`

Conditional pricing rules evaluated on each request. Rules are checked top-to-bottom; the first match wins.

### Match rule fields

| Field | Type | Description |
|-------|------|-------------|
| `where` | `Record<string, string \| number \| boolean>` | Conditions to match against the request |
| `price` | `string` | Price to charge when this rule matches |
| `payTo` | `string \| PayToSplit[]` | Optional payment recipient override for this rule |

### `where` clauses

The `where` object matches against request properties:

| Prefix | Source | Example |
|--------|--------|---------|
| `body.*` | JSON request body | `body.model: "claude-opus-*"` |
| `query.*` | URL query parameters | `query.tier: "premium"` |
| `headers.*` | Request headers | `headers.x-priority: "high"` |
| `params.*` | Path parameters | `params.query_id: "123*"` |

Values support **glob patterns** for flexible matching:

```yaml
match:
  - where: { body.model: "claude-haiku-*" }
    price: "$0.005"
  - where: { body.model: "claude-sonnet-*" }
    price: "$0.015"
  - where: { body.model: "claude-opus-*" }
    price: "$0.075"
fallback: "$0.015"
```

:::tip
Always provide a `fallback` price when using `match` rules, so requests that don't match any rule still get a price.
:::

---

## `hooks`

Lifecycle hooks let you run custom code at key points in the request lifecycle. Hooks can be defined globally or per-route.

### Global hooks

```yaml
hooks:
  onRequest: "hooks/on-request.ts"
  onPriceResolved: "hooks/log-price.ts"
  onSettled: "hooks/log-payment.ts"
  onResponse: "hooks/track-usage.ts"
  onError: "hooks/handle-error.ts"
```

### Per-route hooks

Route-level hooks override global hooks for that route:

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    price: "$0.015"
    hooks:
      onResponse: "hooks/track-claude-usage.ts"
```

### Hook lifecycle

| Hook | When | Signature | Use case |
|------|------|-----------|----------|
| `onRequest` | Before anything | `(ctx: RequestHookContext) => Promise<HookResult \| undefined>` | Block abusers, rate limit |
| `onPriceResolved` | After price is calculated | `(ctx: HookContext) => Promise<HookResult \| undefined>` | Override or log pricing |
| `onSettled` | After payment confirmed | `(ctx: SettledHookContext) => Promise<HookResult \| undefined>` | Log payments to DB |
| `onResponse` | After upstream responds | `(ctx: ResponseHookContext) => Promise<UpstreamResponse \| undefined>` | Transform response, track usage |
| `onError` | When upstream fails | `(ctx: ErrorHookContext) => Promise<void>` | Trigger refunds |

### Hook return values

Hooks that return `HookResult` can short-circuit the request:

```ts
// hooks/on-request.ts
export default async (ctx) => {
  if (isBlocked(ctx.req.headers['x-forwarded-for'])) {
    return { reject: true, status: 403, body: 'Blocked' };
  }
  // return undefined to continue normally
};
```

The `onResponse` hook can return a modified `UpstreamResponse` to transform the response before it's sent to the client.

---

## Pricing format

Prices are specified as dollar strings and converted to USDC micro-units (6 decimal places):

| Dollar string | USDC micro-units | Actual USDC |
|---------------|-----------------|-------------|
| `"$0.001"` | 1,000 | 0.001 USDC |
| `"$0.01"` | 10,000 | 0.01 USDC |
| `"$0.05"` | 50,000 | 0.05 USDC |
| `"$1.00"` | 1,000,000 | 1.00 USDC |

---

## Environment variables

Any string value in the config supports `${ENV_VAR}` interpolation:

```yaml
wallets:
  base-sepolia: "${GATEWAY_ADDRESS}"

upstreams:
  myapi:
    url: "https://api.example.com"
    headers:
      authorization: "Bearer ${API_KEY}"
```

Variables are resolved from `process.env` at config load time. Use a `.env` file or pass them directly.

---

**Next:** [CLI Reference →](/reference/cli/)
