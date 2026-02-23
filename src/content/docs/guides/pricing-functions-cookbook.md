---
title: Pricing Functions Cookbook
description: Advanced, copy-paste patterns for custom price.fn logic in tollbooth.
keywords:
  - pricing functions
  - price.fn
  - dynamic pricing
  - cookbook
  - token-based pricing
  - guardrails
  - tiered pricing
  - testing
---

Use this guide when `match` rules are not enough and you need request-aware logic in a TypeScript pricing function.

All examples use the same config pattern:

```yaml
routes:
  "POST /some/route":
    upstream: myapi
    price:
      fn: "pricing/some-function.ts"
```

## 1. Parameter-based pricing (duration + quality + resolution)

Price a video request based on query parameters.

```yaml
upstreams:
  media:
    url: "https://media.example.com"

routes:
  "GET /stream/:assetId":
    upstream: media
    path: "/v1/assets/${params.assetId}/stream"
    price:
      fn: "pricing/stream-by-params.ts"
```

```ts
// pricing/stream-by-params.ts
import type { PricingFn } from "x402-tollbooth";

const QUALITY_RATE: Record<string, number> = {
  sd: 0.01,
  hd: 0.03,
  "4k": 0.08,
};

const priceFn: PricingFn = ({ query }) => {
  const quality = (query.quality ?? "hd").toLowerCase();
  const rate = QUALITY_RATE[quality] ?? QUALITY_RATE.hd;

  const resolution = (query.resolution ?? "1080p").toLowerCase();
  const resolutionMultiplier = resolution === "2160p" ? 1.5 : 1;

  const rawMinutes = Number.parseInt(query.duration ?? "1", 10);
  const minutes = Number.isFinite(rawMinutes) ? Math.max(1, Math.min(rawMinutes, 240)) : 1;

  return Number((rate * resolutionMultiplier * minutes).toFixed(4));
};

export default priceFn;
```

Behavior: clamps duration to `1-240` minutes and falls back to safe defaults when params are missing.

## 2. Body-based pricing with default fallbacks

Extract fields from JSON body and default gracefully when missing.

```yaml
upstreams:
  render:
    url: "https://render.example.com"

routes:
  "POST /render":
    upstream: render
    path: "/v1/jobs"
    price:
      fn: "pricing/render-by-body.ts"
```

```ts
// pricing/render-by-body.ts
import type { PricingFn } from "x402-tollbooth";

type RenderBody = {
  pages?: number;
  template?: "basic" | "pro" | "enterprise";
};

const TEMPLATE_RATE: Record<NonNullable<RenderBody["template"]>, number> = {
  basic: 0.002,
  pro: 0.005,
  enterprise: 0.01,
};

const priceFn: PricingFn = ({ body }) => {
  const input = (body ?? {}) as RenderBody;

  const template = input.template ?? "basic";
  const rate = TEMPLATE_RATE[template] ?? TEMPLATE_RATE.basic;

  const pages = Number.isFinite(input.pages) ? Math.max(1, Math.min(Number(input.pages), 500)) : 1;

  return Number((rate * pages).toFixed(4));
};

export default priceFn;
```

Behavior: handles empty or partial body payloads without throwing.

## 3. Token-based pricing with model table + overrides

Use a per-model table and apply multipliers for premium options.

```yaml
upstreams:
  ai:
    url: "https://api.example.com"

routes:
  "POST /v1/chat/completions":
    upstream: ai
    price:
      fn: "pricing/chat-tokens-overrides.ts"
```

```ts
// pricing/chat-tokens-overrides.ts
import type { PricingFn } from "x402-tollbooth";

type ChatBody = {
  model?: string;
  max_tokens?: number;
  prompt_tokens?: number;
  priority?: "standard" | "urgent";
  vision?: boolean;
};

const MODEL_RATE_PER_1K: Record<string, number> = {
  "gpt-4o": 0.05,
  "gpt-4o-mini": 0.005,
  "claude-sonnet-4": 0.03,
};

const DEFAULT_RATE = 0.01;

const priceFn: PricingFn = ({ body }) => {
  const input = (body ?? {}) as ChatBody;

  const model = input.model ?? "gpt-4o-mini";
  const ratePer1k = MODEL_RATE_PER_1K[model] ?? DEFAULT_RATE;

  const estimatedTokens = Math.max(
    1,
    Math.ceil(((input.prompt_tokens ?? 0) + (input.max_tokens ?? 1024)) / 1000),
  );

  let multiplier = 1;
  if (input.priority === "urgent") multiplier *= 1.25;
  if (input.vision) multiplier *= 1.4;

  return Number((ratePer1k * estimatedTokens * multiplier).toFixed(4));
};

export default priceFn;
```

Behavior: defaults unknown models to `DEFAULT_RATE` and still computes a deterministic price.

## 4. Caps and floors

Clamp computed prices to a minimum and maximum.

```yaml
upstreams:
  analytics:
    url: "https://analytics.example.com"

routes:
  "GET /reports/export":
    upstream: analytics
    path: "/v2/export"
    price:
      fn: "pricing/export-capped.ts"
```

```ts
// pricing/export-capped.ts
import type { PricingFn } from "x402-tollbooth";

const MIN_PRICE = 0.002;
const MAX_PRICE = 0.25;

const priceFn: PricingFn = ({ query }) => {
  const rows = Number.parseInt(query.rows ?? "1000", 10);
  const safeRows = Number.isFinite(rows) ? Math.max(1, rows) : 1000;

  const rawPrice = safeRows * 0.00002; // $0.02 per 1k rows
  return Number(Math.min(MAX_PRICE, Math.max(MIN_PRICE, rawPrice)).toFixed(4));
};

export default priceFn;
```

Behavior: prevents undercharging tiny requests and overcharging massive exports.

## 5. Tiered pricing (first N units full price, rest discounted)

Charge full price for the first block, then reduce marginal cost.

```yaml
upstreams:
  embeddings:
    url: "https://embeddings.example.com"

routes:
  "POST /embeddings/batch":
    upstream: embeddings
    path: "/v1/batch"
    price:
      fn: "pricing/tiered-batch.ts"
```

```ts
// pricing/tiered-batch.ts
import type { PricingFn } from "x402-tollbooth";

type BatchBody = {
  items?: unknown[];
};

const FIRST_TIER_UNITS = 100;
const FIRST_TIER_RATE = 0.0006;
const SECOND_TIER_RATE = 0.0003;

const priceFn: PricingFn = ({ body }) => {
  const input = (body ?? {}) as BatchBody;
  const units = Array.isArray(input.items) ? input.items.length : 0;

  if (units <= 0) return 0.001;

  const firstTierUnits = Math.min(units, FIRST_TIER_UNITS);
  const secondTierUnits = Math.max(units - FIRST_TIER_UNITS, 0);

  const total = firstTierUnits * FIRST_TIER_RATE + secondTierUnits * SECOND_TIER_RATE;
  return Number(total.toFixed(4));
};

export default priceFn;
```

Behavior: rewards larger batches while keeping small requests economically viable.

## 6. Guardrails: reject if computed price exceeds caller max

Let callers set a maximum acceptable price and fail fast when exceeded.

```yaml
upstreams:
  video:
    url: "https://video.example.com"

routes:
  "POST /video/render":
    upstream: video
    path: "/v1/render"
    price:
      fn: "pricing/render-with-max-guard.ts"
```

```ts
// pricing/render-with-max-guard.ts
import type { PricingFn } from "x402-tollbooth";

type RenderBody = {
  durationSeconds?: number;
  quality?: "sd" | "hd" | "4k";
};

const QUALITY_RATE_PER_MINUTE: Record<NonNullable<RenderBody["quality"]>, number> = {
  sd: 0.01,
  hd: 0.03,
  "4k": 0.08,
};

const parseDollar = (input: string, fallback: number): number => {
  const numeric = Number(input.replace("$", "").trim());
  return Number.isFinite(numeric) ? numeric : fallback;
};

const priceFn: PricingFn = ({ body, headers }) => {
  const input = (body ?? {}) as RenderBody;

  const durationMinutes = Math.max(1, Math.ceil((input.durationSeconds ?? 60) / 60));
  const rate = QUALITY_RATE_PER_MINUTE[input.quality ?? "hd"] ?? QUALITY_RATE_PER_MINUTE.hd;
  const computed = Number((durationMinutes * rate).toFixed(4));

  const callerMax = parseDollar(headers["x-max-price"] ?? "$1.00", 1.0);
  if (computed > callerMax) {
    throw new Error(`Computed price $${computed.toFixed(4)} exceeds caller max $${callerMax.toFixed(4)}`);
  }

  return computed;
};

export default priceFn;
```

Behavior: enforces a hard ceiling from `x-max-price` and rejects unexpectedly expensive jobs.

## 7. Missing or invalid inputs handled defensively

Normalize bad input values and return consistent pricing.

```yaml
upstreams:
  search:
    url: "https://search.example.com"

routes:
  "GET /search":
    upstream: search
    path: "/v1/search"
    price:
      fn: "pricing/search-defensive.ts"
```

```ts
// pricing/search-defensive.ts
import type { PricingFn } from "x402-tollbooth";

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const priceFn: PricingFn = ({ query }) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 200);

  const premium = (query.tier ?? "standard").toLowerCase() === "premium";
  const base = premium ? 0.01 : 0.004;

  // Higher pages are more expensive due to cache miss likelihood.
  const pageMultiplier = page > 50 ? 1.5 : page > 10 ? 1.2 : 1;
  const sizeMultiplier = limit > 100 ? 1.3 : 1;

  return Number((base * pageMultiplier * sizeMultiplier).toFixed(4));
};

export default priceFn;
```

Behavior: invalid query strings (negative, NaN, empty) fall back to sane defaults.

## Testing pricing rules locally

Use a small harness so each pricing function can be tested without sending live HTTP requests.

```ts
// pricing/smoke-test.ts
import { strict as assert } from "node:assert";
import streamByParams from "./stream-by-params";
import exportCapped from "./export-capped";

const run = async () => {
  const stream = await streamByParams({
    body: undefined,
    headers: {},
    params: { assetId: "abc" },
    query: { duration: "30", quality: "hd", resolution: "1080p" },
  });
  assert.equal(stream, 0.9);

  const floorPrice = await exportCapped({
    body: undefined,
    headers: {},
    params: {},
    query: { rows: "1" },
  });
  assert.equal(floorPrice, 0.002);

  const capPrice = await exportCapped({
    body: undefined,
    headers: {},
    params: {},
    query: { rows: "99999999" },
  });
  assert.equal(capPrice, 0.25);

  console.log("pricing smoke tests passed");
};

run();
```

```bash
npx tsx pricing/smoke-test.ts
```

For schema-level validation, place your `price.fn` routes into `tollbooth.config.yaml` and start tollbooth locally. Startup will fail early if route config is invalid:

```bash
npx tollbooth start --config tollbooth.config.yaml
```

## When to use `match` vs `price.fn`

- Use `match` for simple glob-based branching.
- Use `price.fn` when you need arithmetic, tiers, caps, cross-field logic, or hard guardrails.

---

**Next:** [Local Development & Testing →](/guides/local-testing/)
