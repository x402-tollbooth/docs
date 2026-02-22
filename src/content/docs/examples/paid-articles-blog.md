---
title: "Example: Paid Articles Blog"
description: Mix free and paid routes — serve public listings for free and charge per-article using price "$0" to bypass payment.
keywords:
  - blog
  - articles
  - free routes
  - mixed pricing
  - paywall
  - content monetization
  - price zero
  - transparent proxy
---

Monetize a blog API by keeping listings free and charging readers per-article. Free routes use `price: "$0"` to skip the x402 payment flow entirely — no 402 response, no wallet interaction.

## Use case

You run a blog backend and want to:

- Let anyone browse the homepage and article list for free
- Charge a small fee to read the full content of an article

## Config

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
  blog:
    url: "https://api.myblog.com"

routes:
  "GET /posts":
    upstream: blog
    price: "$0"              # free — list all posts

  "GET /posts/:slug":
    upstream: blog
    path: "/posts/${params.slug}"
    price: "$0.005"          # paid — read full article
```

## What's going on

- **`GET /posts`** is free. `price: "$0"` tells tollbooth to skip the x402 flow and proxy the request directly — no payment required, no 402 response.
- **`GET /posts/:slug`** is paid. Clients receive a `402 Payment Required` response with payment instructions, sign a $0.005 USDC payment, and resend the request to get the full article.

## Expected flow

```
Client                        Tollbooth                     Blog API
  │                              │                              │
  │  GET /posts                  │                              │
  │─────────────────────────────>│  price: $0 → skip payment    │
  │                              │  GET /posts                  │
  │                              │─────────────────────────────>│
  │                              │  [{ slug, title, … }, …]     │
  │  200 + post list             │<─────────────────────────────│
  │<─────────────────────────────│                              │
  │                              │                              │
  │  GET /posts/my-article       │                              │
  │─────────────────────────────>│  price: $0.005 → require pay │
  │  402 + payment instructions  │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  │  (sign $0.005 USDC payment)  │                              │
  │                              │                              │
  │  GET /posts/my-article       │                              │
  │  + X-PAYMENT header          │                              │
  │─────────────────────────────>│                              │
  │                              │  verify + settle payment     │
  │                              │  GET /posts/my-article       │
  │                              │─────────────────────────────>│
  │                              │  { slug, title, body, … }    │
  │  200 + full article          │<─────────────────────────────│
  │<─────────────────────────────│                              │
```

Notice that `GET /posts` goes straight through — no 402 step, no payment headers. The route behaves like a plain reverse proxy.

## Run it

```bash
npx tollbooth start
```

## Try it with curl

Free route — returns immediately:

```bash
curl http://localhost:3000/posts
```

Paid route — returns 402 with payment instructions:

```bash
curl http://localhost:3000/posts/my-article
```

:::tip
To test locally without real payments, see the [Local Testing](/guides/local-testing/) guide.
:::

---

**Next:** [AI API Reseller →](/examples/ai-api-reseller/)
