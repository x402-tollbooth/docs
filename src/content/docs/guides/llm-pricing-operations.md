---
title: LLM Pricing Operations
description: Keep LLM pricing accurate and safe as model catalogs change.
keywords:
  - LLM pricing
  - token pricing
  - model mapping
  - fine-tunes
  - fallback pricing
  - guardrails
---

Practical advice for running LLM pricing in production without surprises.

## Keep model tables current

For `type: token-based` routes, maintain a `models` map for the models you care about. New model IDs appear frequently and may not match your target margin.

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

A conservative `fallback` prevents silent undercharging when new models appear.

## Handle fine-tunes and custom model IDs

Fine-tunes often use custom IDs (`ft:*`, provider suffixes, deployment names). Map known IDs explicitly:

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

For fail-closed behavior on unknown models, reject them in a hook:

```ts
// hooks/enforce-model-allowlist.ts
const allowed = new Set(["gpt-4o", "gpt-4o-mini", "ft:gpt-4o:acme-support-v2"]);

export default async (ctx) => {
  const body = (ctx.request.body ?? {}) as { model?: string };
  if (!body.model || !allowed.has(body.model)) {
    return { reject: true, status: 400, body: "Unsupported model" };
  }
};
```

## Flat vs token-based pricing

| Basis | Best for | Tradeoff |
|---|---|---|
| Token-based (`type: token-based`) | Chat/completion APIs with variable output | Price varies per request |
| Flat per request (`price` or `match`) | Short, bounded requests | Heavy requests can erode margin |

Start with token-based for general LLM APIs. Use flat pricing only when output size is tightly bounded.

## Guardrails

- Always set a conservative `fallback` for unknown models.
- Keep an allowlist for approved model IDs on high-risk routes.
- Prefer `settlement: after-response` on expensive upstreams where failures are common. See [Refund Protection](/guides/refund-protection/).

---

**Related:**
- [Dynamic Pricing](/guides/dynamic-pricing/)
- [Configuration Reference: Token-Based Routes](/reference/configuration/#token-based-routes)
- [Example: AI API Reseller](/examples/ai-api-reseller/)
