---
title: "Example: Paid Articles Blog"
description: A static blog where individual articles are paywalled via x402 with per-article dynamic pricing set by authors.
keywords:
  - blog
  - articles
  - paywall
  - micropayments
  - journalism
  - Bun
  - Hono
  - markdown
  - dynamic pricing
  - pricing function
  - pay-per-article
  - content monetization
---

A static blog where readers pay per-article in USDC via x402. Free previews, paid full content — each author sets their own price in markdown frontmatter.

:::tip[Full implementation]
See [paid-articles-blog](https://github.com/Loa212/paid-articles-blog) for the complete Bun + Hono server with sample articles and pricing function.
:::

## Use case

You run a blog with multiple authors. Each article has a free preview (first ~200 words) and a paid full version. Authors set their own price per article via markdown frontmatter — a short post might cost $0.01, a deep-dive $0.05. No subscriptions, no accounts, just pay and read.

Tollbooth sits in front of the blog server. Free routes (homepage, previews, metadata) pass through. Paid routes (`GET /articles/:slug`) return a `402` and tollbooth resolves the price dynamically by calling a pricing function that reads the article's metadata.

## Config

```yaml
# tollbooth.config.yaml
gateway:
  port: 3000

wallets:
  base-sepolia: "${WALLET_ADDRESS}"

accepts:
  - network: base-sepolia
    asset: USDC

upstreams:
  blog:
    url: "http://localhost:4000"

routes:
  "GET /":
    upstream: blog
  "GET /articles/*/meta":
    upstream: blog
  "GET /articles/*/preview":
    upstream: blog
  "GET /articles/*":
    upstream: blog
    price:
      fn: "./pricing/article-price.ts"
```

### What's going on

- **Single upstream** pointing at the Bun blog server running on port 4000.
- **Three free routes** — the homepage (`/`), article metadata (`/meta`), and article previews (`/preview`) all pass through without payment.
- **One paid route** (`GET /articles/*`) gates full article content behind x402.
- **`price.fn`** — instead of a static price, tollbooth calls a TypeScript function at request time to resolve the price. The function fetches the article's metadata from the blog backend and returns the author-set price. See the [Dynamic Pricing](/guides/dynamic-pricing/) guide for more on pricing functions.

## The pricing function

The pricing function runs at request time. It extracts the article slug from the request, calls the blog's `/meta` endpoint, and returns the price the author set in their markdown frontmatter.

```typescript
// pricing/article-price.ts
const BLOG_URL = process.env.BLOG_URL ?? "http://localhost:4000";

export default async function ({ params }: { params: Record<string, string> }) {
  const slug = params["*"];
  const res = await fetch(`${BLOG_URL}/articles/${slug}/meta`);

  if (!res.ok) {
    return "$0.01"; // fallback price
  }

  const { price } = (await res.json()) as { price: string };
  return price;
}
```

Each article's markdown frontmatter sets its own price:

```markdown
---
title: "Why Micropayments Will Save Journalism"
date: "2025-12-01"
price: "$0.01"
excerpt: "The subscription model is broken..."
---
```

## Run it

```bash
# Start the blog server
cd paid-articles-blog
bun run dev

# In another terminal, start tollbooth
export WALLET_ADDRESS="0xYourWalletAddress"
npx tollbooth start
```

## Expected flow

```
Client                        Tollbooth                     Blog Server
  │                              │                              │
  │  GET /                       │                              │
  │─────────────────────────────>│  (free route)                │
  │                              │──────────────────────────────>│
  │  200 + article list          │                              │
  │<─────────────────────────────│<──────────────────────────────│
  │                              │                              │
  │  GET /articles/my-post/      │                              │
  │      preview                 │                              │
  │─────────────────────────────>│  (free route)                │
  │                              │──────────────────────────────>│
  │  200 + first 200 words       │                              │
  │<─────────────────────────────│<──────────────────────────────│
  │                              │                              │
  │  GET /articles/my-post       │                              │
  │─────────────────────────────>│                              │
  │                              │  call price.fn →             │
  │                              │  GET /articles/my-post/meta  │
  │                              │──────────────────────────────>│
  │                              │  { price: "$0.01" }          │
  │                              │<──────────────────────────────│
  │  402 + payment instructions  │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  │  (sign $0.01 USDC payment)   │                              │
  │                              │                              │
  │  GET /articles/my-post       │                              │
  │  + X-PAYMENT header          │                              │
  │─────────────────────────────>│                              │
  │                              │  verify + settle payment     │
  │                              │                              │
  │                              │  GET /articles/my-post       │
  │                              │──────────────────────────────>│
  │                              │                              │
  │                              │  { content: "..." }          │
  │                              │<──────────────────────────────│
  │  200 + full article          │                              │
  │<─────────────────────────────│                              │
```

## Try it with curl

```bash
# List all articles (free)
curl -s http://localhost:3000/

# Preview an article (free)
curl -s http://localhost:3000/articles/why-micropayments-will-save-journalism/preview

# Read the full article — triggers 402
curl -s http://localhost:3000/articles/why-micropayments-will-save-journalism
```

The full article request returns a `402 Payment Required` with payment instructions. An x402-compatible client signs the USDC payment and resends the request with the payment proof attached.

:::tip
To test locally without real payments, see the [Local Testing](/guides/local-testing/) guide.
:::

---

**Next:** [AI API Reseller →](/examples/ai-api-reseller/)
