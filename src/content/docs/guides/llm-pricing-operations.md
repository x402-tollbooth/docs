---
title: LLM Pricing Operations
description: Operational playbook for keeping LLM pricing accurate, safe, and profitable as model catalogs change.
keywords:
  - LLM pricing
  - token pricing
  - model mapping
  - fine-tunes
  - fallback pricing
  - autopricing
  - rollout strategy
  - guardrails
  - metrics
---

Use this playbook to run LLM pricing in production without constant fire drills. It focuses on operational safety: model churn, unknown IDs, gradual rollouts, and measurable tuning.

## 1) Keep model tables current (and safe by default)

For `type: token-based` routes, keep a route-level `models` map for the models you care about most. Treat it as your operator override layer on top of tollbooth defaults.

```yaml
routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: token-based
    models:
      gpt-4o: "$0.05"
      gpt-4o-mini: "$0.005"
      claude-sonnet-4-5: "$0.02"
    fallback: "$0.02" # safe default for unknown models
```

Why this helps:
- New model IDs appear frequently and may not match your target margin.
- A conservative `fallback` prevents silent undercharging.

## 2) Handle fine-tunes and custom model IDs

Fine-tunes often use custom IDs (`ft:*`, provider-specific suffixes, or deployment names). Map known IDs explicitly and keep a safe fallback.

```yaml
routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: token-based
    models:
      gpt-4o: "$0.05"
      ft:gpt-4o:acme-support-v2: "$0.08"
      ft:gpt-4o-mini:triage: "$0.015"
    fallback: "$0.03"
```

If you want fail-closed behavior for unknown models, reject them in a request hook:

```yaml
routes:
  "POST /v1/chat/completions":
    upstream: openai
    type: token-based
    hooks:
      onRequest: "hooks/enforce-model-allowlist.ts"
```

```ts
// hooks/enforce-model-allowlist.ts
const allowed = new Set(["gpt-4o", "gpt-4o-mini", "ft:gpt-4o:acme-support-v2"]);

export default async (ctx) => {
  const body = (ctx.request.body ?? {}) as { model?: string };
  const model = body.model;
  if (!model || !allowed.has(model)) {
    return { reject: true, status: 400, body: "Unsupported model" };
  }
};
```

## 3) Choose the right pricing basis

Use the pricing basis that matches cost variance:

| Basis | Best for | Tradeoff |
|---|---|---|
| Token-based (`type: token-based`) | Chat/completion APIs with variable output length | Price is less predictable per request |
| Flat per request (`price` or `match`) | Short, bounded requests | Heavy requests can erode margin |
| Time/window tiers (via `match` + policy) | Batch or session products | More operational complexity |

Practical rule:
- Start with token-based for general LLM APIs.
- Use flat pricing only when output size is tightly bounded.

## 4) Autopricing loop (analytics-driven)

Treat pricing as a control loop, not a one-time config:

1. Capture usage and payment outcomes.
2. Compute margin and conversion per model.
3. Propose a bounded price update.
4. Roll out gradually and compare results.

Recommended constraints for automatic changes:
- Max upward change per deploy: `+15%`
- Max downward change per deploy: `-10%`
- Global floor/ceiling per model family (for safety)

## 5) Roll out price changes gradually

Avoid global flips. Canary with headers or route variants, then expand.

```yaml
routes:
  "POST /v1/chat/completions":
    upstream: openai
    match:
      - where: { headers.x-pricing-version: "v2" }
        price: "$0.012" # canary cohort
      - where: { headers.x-pricing-version: "v1" }
        price: "$0.01"  # control cohort
    fallback: "$0.01"
```

During rollout, compare:
- Payment success rate
- Upstream success rate
- Conversion after first `402`
- Margin per request and per model

## 6) Guardrails you should always have

- Set conservative `fallback` for unknown models.
- Define per-model floors and ceilings in your pricing pipeline.
- Keep an allowlist for approved model IDs in high-risk routes.
- Add a denylist for deprecated/blocked models.
- Prefer `settlement: after-response` on expensive upstreams where failures are common. See [Refund Protection](/guides/refund-protection/).

## Logging and metrics for tuning

At minimum, log these fields on each request:

- `timestamp`
- `route`
- `provider`
- `requested_model`
- `resolved_pricing_mode` (`token-based`, `match`, `flat`)
- `resolved_price`
- `pricing_source` (`route.models`, `default-table`, `fallback`, `price.fn`)
- `tokens_in`, `tokens_out` (when available)
- `payment_required` amount
- `payment_settled` (boolean) and settlement latency
- `upstream_status` and upstream latency

Dashboards to build first:
- Margin by model and provider
- 402-to-paid conversion by model and client cohort
- Unknown-model rate over time
- Fallback-price hit rate (should trend down as mappings improve)
- Settlement failure and timeout rates

## Operational checklist

- [ ] Confirm provider model list updates and deprecations.
- [ ] Add/adjust `models` overrides for top traffic models.
- [ ] Review unknown-model and fallback hit rates.
- [ ] Review fine-tune IDs in production traffic and map hot paths.
- [ ] Recompute margin and conversion by model.
- [ ] Apply bounded price updates (respect floors/ceilings).
- [ ] Roll out to canary cohort, compare against control.
- [ ] Promote rollout only after conversion and settlement checks pass.
- [ ] Archive pricing change notes (what changed, why, measured impact).

---

**Related:**
- [Dynamic Pricing](/guides/dynamic-pricing/)
- [Configuration Reference: Token-Based Routes](/reference/configuration/#token-based-routes)
- [Example: AI API Reseller](/examples/ai-api-reseller/)
