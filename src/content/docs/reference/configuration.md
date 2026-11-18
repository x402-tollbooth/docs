---
lastUpdated: 2026-11-18
title: Configuration Reference
description: Complete reference for tollbooth.config.yaml — every field, type, default, and example.
keywords:
  - config
  - YAML
  - tollbooth.config.yaml
  - gateway
  - wallets
  - accepts
  - defaults
  - upstreams
  - routes
  - match
  - hooks
  - environment variables
  - path parameters
  - path rewriting
  - token-based
  - OpenAI-compatible
  - pricing format
  - settlement
  - cors
  - trustProxy
  - metrics
  - stores
  - rateLimit
  - verificationCache
---

tollbooth is configured via a single `tollbooth.config.yaml` file. All fields are documented below.

## Full example

```yaml
# tollbooth.config.yaml

gateway:
  port: 3000
  discovery: true
  trustProxy: true
  cors:
    allowedOrigins: ["https://app.example.com"]

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
  rateLimit:
    requests: 100
    window: 1m

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
    settlement: after-response
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
    type: token-based
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
| `discovery` | `boolean` | `true` | Expose `/.well-known/x402` and `/.well-known/openapi.json` discovery endpoints |
| `hostname` | `string` | — | Optional hostname to bind to |
| `cors` | `CorsConfig` | — (CORS off) | Enable CORS headers. `allowedOrigins` is required. Optional: `allowedMethods`, `allowedHeaders`, `exposedHeaders`, `credentials` (default `false`; `"*"` origin not allowed with credentials), `maxAge`. See [Security & Hardening](/production/security/#cors) |
| `trustProxy` | `boolean \| number \| { hops?, cidrs? }` | `false` | Trust `X-Forwarded-For` / `X-Forwarded-Proto` from a reverse proxy: `true`, a number of trusted hops, or specific CIDRs. Enable when running behind Nginx, Caddy, or a cloud load balancer |
| `metrics` | `{ enabled?, path? }` | `{ enabled: false, path: "/metrics" }` | Expose a Prometheus-compatible metrics endpoint |

```yaml
gateway:
  port: 8080
  discovery: true
  trustProxy: true
  cors:
    allowedOrigins: ["https://app.example.com"]
  metrics:
    enabled: true
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
| `rateLimit` | `RateLimitConfig` | — | Default rate-limit applied to all routes. Override per-route with `routes.<route>.rateLimit` |

```yaml
defaults:
  price: "$0.001"
  timeout: 60
  rateLimit:
    requests: 100
    window: 1m
```

`RateLimitConfig` fields:

| Field | Type | Description |
|-------|------|-------------|
| `requests` | `number` | Maximum requests per window (positive integer) |
| `window` | `string` | Window duration, e.g. `"30s"`, `"1m"`, `"1h"`, `"1d"` |

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

## `settlement`

Configures the settlement strategy used to verify and collect payments. When omitted, tollbooth uses the `facilitator` strategy by default.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strategy` | `"facilitator" \| "nanopayments" \| "mpp" \| "tempo" \| "custom"` | `"facilitator"` | Which settlement strategy to use |
| `network` | `"testnet" \| "mainnet"` | `"testnet"` | Circle Gateway environment (nanopayments only) |
| `url` | `string` | — | Gateway URL override (nanopayments), facilitator URL (mpp, tempo) |
| `methods` | `MppMethod[]` | — | Payment methods (mpp only, at least one) |
| `tempo` | `TempoConfig` | — | Tempo settings (tempo only) |
| `module` | `string` | — | Path to a custom strategy module (custom only) |

### Facilitator (default)

```yaml
# No settlement block needed — facilitator is the default.
# Equivalent to:
settlement:
  strategy: facilitator
```

### Nanopayments

Uses [Circle's Nanopayments Gateway](https://www.circle.com/nanopayments) for gas-free, batched USDC settlement. Ideal for sub-cent micropayments and high-frequency use cases.

```yaml
settlement:
  strategy: nanopayments
  network: testnet   # "testnet" (default) or "mainnet"
```

Or with a custom gateway URL:

```yaml
settlement:
  strategy: nanopayments
  url: https://my-gateway.example.com
```

### MPP

Accept stablecoins and Stripe card payments through the [Machine Payments Protocol](/how-it-works/mpp/).

```yaml
settlement:
  strategy: mpp
  methods:
    - type: tempo                          # stablecoins via the x402 facilitator
    - type: stripe                         # card payments
      secretKey: "${STRIPE_SECRET_KEY}"
```

| Method field | Type | Description |
|---|---|---|
| `type` | `"tempo" \| "stripe"` | Payment method |
| `secretKey` | `string` | Stripe secret key (`stripe` only, required) |

When running more than one instance with the `stripe` method, set `stores.verificationCache.backend: redis` so used PaymentIntents are shared across instances. See [MPP](/how-it-works/mpp/#what-the-gateway-checks).

### Tempo

Settle on Tempo with attribution and invoice memos. See [Tempo Settlement](/how-it-works/tempo/).

```yaml
settlement:
  strategy: tempo
  tempo:
    url: "${TEMPO_FACILITATOR_URL}"
    recipient: "0xYourMerchantAddress"
    network: mainnet
    token: pathUSD
    recurring:
      interval: monthly
      autoPay: false
    memo:
      invoice_id: "{customer_id}-{period}"
```

`TempoConfig` fields:

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `settlement.url` | **Required** (here or as `settlement.url`). x402 facilitator that supports Tempo |
| `recipient` | `string` | **required** | Merchant address for attribution and memos. Should match your `wallets` address |
| `network` | `"mainnet" \| "testnet"` | `"mainnet"` | Label for attribution and memos |
| `token` | `string` | `"pathUSD"` | Label for attribution and memos |
| `recurring.interval` | `"daily" \| "weekly" \| "monthly" \| "yearly"` | — | Plan label (`{period}` placeholder) |
| `recurring.autoPay` | `boolean` | `false` | Recorded in attribution. tollbooth doesn't pull funds automatically |
| `memo` | `Record<string, string>` | — | Memo templates. Placeholders: `{customerId}`, `{customer_id}`, `{payer}`, `{period}`, `{recipient}`, `{network}`, `{token}` |

### Custom

Point to your own `SettlementStrategy` implementation:

```yaml
settlement:
  strategy: custom
  module: "./settlement/my-strategy.ts"
```

See [Settlement Strategies](/how-it-works/settlement/) for details on each strategy.

---

## `upstreams`

Named upstream API configurations. Each upstream defines where requests are proxied to.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | **required** | Base URL of the upstream API |
| `headers` | `Record<string, string>` | — | Headers to inject into proxied requests |
| `timeout` | `number` | — | Request timeout in seconds for this upstream |
| `openapi` | `string` | — | URL or file path to an OpenAPI spec. Routes are auto-imported at startup. See [OpenAPI integration](/guides/openapi/) |
| `defaultPrice` | `string` | — | Default price applied to auto-imported routes (e.g. `"$0.01"`). Optional — when omitted, imported routes use `defaults.price` |

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

  myapi:
    url: "https://api.example.com"
    openapi: "https://api.example.com/openapi.json"   # auto-import routes at startup
    defaultPrice: "$0.01"                              # applied to all imported routes
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
| `settlement` | `"before-response" \| "after-response"` | `"before-response"` | When to settle payment relative to the upstream request. See [Refund Protection](/streaming/refund-protection/) |
| `rateLimit` | `RateLimitConfig` | from `defaults.rateLimit` | Override rate-limit for this route |
| `verificationCache` | `VerificationCacheConfig` | — | Cache payment verification results to reduce facilitator calls on repeated payments (facilitator strategy only) |
| `pricing` | `RoutePricingConfig` | — | Pricing model (`model`, `duration`) plus `price` / `match` / `fallback`. See [Time-based pricing](#time-based-pricing) |

### Free routes (no payment)

Set `price: "$0"` to bypass the x402 payment flow entirely. The route acts as a transparent proxy — no `402` response, no payment required.

```yaml
routes:
  "GET /health":
    upstream: myapi
    price: "$0"           # free — proxied directly, no payment

  "GET /data":
    upstream: myapi
    price: "$0.01"        # paid — requires x402 payment
```

This is useful for health checks, public listings, or mixed free/paid APIs where some endpoints should be openly accessible.

:::note
If `defaults.price` is set to `"$0"`, all routes without an explicit `price` are free by default.
:::

### Time-based pricing

Charge once for a period of access instead of per request. The simplest way is a period suffix on the route price:

```yaml
routes:
  "GET /premium/*":
    upstream: myapi
    price: "$10/month"      # pay once, access for 30 days
```

This is shorthand for:

```yaml
routes:
  "GET /premium/*":
    upstream: myapi
    pricing:
      model: time
      duration: 30d
      price: "$10"
```

The first paid request settles and starts a session for that payer on that route. Until the session expires, requests carrying a valid payment header from the same payer are let through without another charge. After it expires, the route returns `402` and the client pays again. Nothing renews automatically.

Supported suffixes (case-insensitive):

| Suffix | Duration |
|---|---|
| `/request`, `/req` | Per request (same as no suffix) |
| `/second`, `/sec`, `/s` | 1 second |
| `/minute`, `/min`, `/m` | 1 minute |
| `/hour`, `/hr`, `/h` | 1 hour |
| `/day`, `/daily`, `/d` | 1 day |
| `/week`, `/weekly`, `/w` | 7 days |
| `/month`, `/monthly`, `/mo` | 30 days |
| `/year`, `/yearly`, `/yr`, `/y` | 365 days |

Rules:

- An unknown suffix (e.g. `"$10/fortnight"`) is a config error, and the gateway won't start.
- An explicit `pricing.model` or `pricing.duration` takes precedence over the suffix.
- The suffix changes the pricing model only on a route's `price` or `pricing.price`. In `match` rules, `fallback` and `defaults.price`, only the amount is used.
- `pricing.model: time` without a suffix requires `pricing.duration` (e.g. `"12h"`, `"7d"`).

Sessions are stored in the time-session store: in memory by default, and reset on restart. Use `stores.timeSession.backend: redis` when running more than one instance. See [`stores`](#stores).

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

Use `*` as a catch-all wildcard that matches the rest of the path. Access the matched value with `params["*"]`:

```yaml
routes:
  "GET /articles/*":
    upstream: blog
    price:
      fn: "./pricing/article-price.ts"
```

### Path rewriting

The `path` field lets your public API shape differ from the upstream:

```yaml
routes:
  "POST /ai/claude":
    upstream: anthropic
    path: "/v1/messages"     # upstream path differs from public path
    price: "$0.015"
```

### Token-Based Routes

For proxying OpenAI-compatible APIs (OpenAI, OpenRouter, LiteLLM, Ollama, etc.), set `type: token-based` to enable automatic model-based pricing without writing match rules. `openai-compatible` is also accepted as an alias.

The gateway auto-extracts the `model` field from the JSON request body and prices the request using a built-in table of common models (GPT-4o, Claude, Gemini, Llama, Mistral, DeepSeek, etc.).

:::tip[Operational playbook]
For model lifecycle handling, custom fine-tune mapping strategy, rollout safety, and tuning metrics, see [LLM Pricing](/pay-per-request/llm-pricing/).
:::

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
    type: token-based

  "POST /v1/completions":
    upstream: openai
    type: token-based
```

#### Override or extend model pricing

Add a `models` map to set custom prices or add models not in the default table:

```yaml
routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: token-based
    models:
      gpt-4o: "$0.05"          # override default
      gpt-4o-mini: "$0.005"    # override default
      my-fine-tune: "$0.02"    # custom model
    fallback: "$0.01"          # price for models not in any table
```

#### Price resolution order

When pricing a token-based request, the gateway checks:

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
| `"$0"` | 0 | Free — skips x402 payment flow |
| `"$0.001"` | 1,000 | 0.001 USDC |
| `"$0.01"` | 10,000 | 0.01 USDC |
| `"$0.05"` | 50,000 | 0.05 USDC |
| `"$1.00"` | 1,000,000 | 1.00 USDC |

A route price can also carry a period suffix, e.g. `"$10/month"`, to make the route time-based. See [Time-based pricing](#time-based-pricing).

---

## `stores`

Optional external store configuration for sharing state across gateway instances.

| Field | Type | Description |
|-------|------|-------------|
| `redis` | `RedisConfig` | Shared Redis connection: `url` (required), `prefix`, `options` |
| `rateLimit` | `StoreSelection` | Rate-limit counters |
| `verificationCache` | `StoreSelection` | Verification cache, plus used MPP Stripe PaymentIntents |
| `timeSession` | `StoreSelection` | [Time-based pricing](#time-based-pricing) sessions |

`StoreSelection` fields: `backend` (`"memory"` default, or `"redis"`) and an optional `redis` block (`url`, `prefix`, `options`) that overrides the shared connection for that store.

Each store uses Redis only when its `backend` is `"redis"`. Setting `stores.redis` alone doesn't switch any store over.

```yaml
stores:
  redis:
    url: "redis://localhost:6379"
    prefix: "tollbooth"

  rateLimit:
    backend: redis
  verificationCache:
    backend: redis
  timeSession:
    backend: redis
```

When no store is configured, all state is kept in-memory and resets on restart. See [Scaling and Shared Stores](/production/scaling/).

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
