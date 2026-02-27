---
title: Pricing Functions Cookbook
description: Copy-paste patterns for custom price.fn logic in tollbooth.
keywords:
  - pricing functions
  - price.fn
  - dynamic pricing
  - cookbook
  - tiered pricing
---

Use these when `match` rules aren't enough and you need request-aware logic.

All examples use this config pattern:

```yaml
routes:
  "POST /some/route":
    upstream: myapi
    price:
      fn: "pricing/some-function.ts"
```

## 1. Parameter-based pricing

Price based on query parameters with clamped ranges and safe defaults.

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

  const rawMinutes = Number.parseInt(query.duration ?? "1", 10);
  const minutes = Number.isFinite(rawMinutes) ? Math.max(1, Math.min(rawMinutes, 240)) : 1;

  return Number((rate * minutes).toFixed(4));
};

export default priceFn;
```

## 2. Body-based pricing

Extract fields from the JSON body and default gracefully when missing.

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
  const rate = TEMPLATE_RATE[input.template ?? "basic"] ?? TEMPLATE_RATE.basic;
  const pages = Number.isFinite(input.pages) ? Math.max(1, Math.min(Number(input.pages), 500)) : 1;

  return Number((rate * pages).toFixed(4));
};

export default priceFn;
```

## 3. Caps and floors

Clamp computed prices to a minimum and maximum.

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

## 4. Tiered pricing

Full price for the first block, discounted after.

```ts
// pricing/tiered-batch.ts
import type { PricingFn } from "x402-tollbooth";

const FIRST_TIER_UNITS = 100;
const FIRST_TIER_RATE = 0.0006;
const SECOND_TIER_RATE = 0.0003;

const priceFn: PricingFn = ({ body }) => {
  const items = (body as { items?: unknown[] })?.items;
  const units = Array.isArray(items) ? items.length : 0;

  if (units <= 0) return 0.001;

  const firstTier = Math.min(units, FIRST_TIER_UNITS);
  const secondTier = Math.max(units - FIRST_TIER_UNITS, 0);

  return Number((firstTier * FIRST_TIER_RATE + secondTier * SECOND_TIER_RATE).toFixed(4));
};

export default priceFn;
```

## Testing locally

Test pricing functions directly without sending HTTP requests:

```ts
// pricing/smoke-test.ts
import { strict as assert } from "node:assert";
import exportCapped from "./export-capped";

const run = async () => {
  const floor = await exportCapped({ body: undefined, headers: {}, params: {}, query: { rows: "1" } });
  assert.equal(floor, 0.002);

  const cap = await exportCapped({ body: undefined, headers: {}, params: {}, query: { rows: "99999999" } });
  assert.equal(cap, 0.25);

  console.log("pricing smoke tests passed");
};

run();
```

## When to use `match` vs `price.fn`

- Use `match` for simple glob-based branching.
- Use `price.fn` when you need arithmetic, tiers, caps, or cross-field logic.

---

**Next:** [Streaming & SSE →](/streaming/streaming-sse/)
