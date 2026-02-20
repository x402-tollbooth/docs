---
title: "Example: Video Streaming Paywall"
description: Pay-per-video using tollbooth with pricing by quality tier (4K, HD, SD).
keywords:
  - video
  - streaming
  - paywall
  - HLS
  - quality tier
  - 4K
  - HD
  - SD
  - pay-per-view
  - CDN
  - media
---

Charge viewers per-video based on the quality tier they request. Higher quality costs more — no subscriptions, no accounts, just pay and watch.

## Use case

You run a video origin server that serves content at multiple quality tiers (4K, HD, SD). You want to charge viewers per-video in USDC via x402. A 4K stream costs more than SD because it uses more bandwidth and storage.

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
  video-origin:
    url: "https://cdn.example.com"
    headers:
      authorization: "Bearer ${CDN_API_KEY}"

routes:
  "GET /video/:video_id":
    upstream: video-origin
    path: "/streams/${params.video_id}/manifest.m3u8"
    match:
      - where: { query.quality: "4k" }
        price: "$0.25"
      - where: { query.quality: "hd" }
        price: "$0.10"
      - where: { query.quality: "sd" }
        price: "$0.03"
    fallback: "$0.10"

  "GET /video/:video_id/thumbnail":
    upstream: video-origin
    path: "/streams/${params.video_id}/thumb.jpg"
    price: "$0.001"
```

### What's going on

- **Video origin upstream** — your CDN or media server that stores the actual video files.
- **Main route** (`GET /video/:video_id`) serves the HLS manifest. The `quality` query parameter determines the price.
- **Match rules** check `query.quality` to price by tier: 4K ($0.25), HD ($0.10), SD ($0.03).
- **Thumbnail route** is a cheap separate endpoint so clients can preview content before paying for the full video.
- **Path rewriting** maps the public `/video/:video_id` path to the origin's internal `/streams/:video_id/manifest.m3u8` format.

## Run it

```bash
export CDN_API_KEY="..."
npx tollbooth start
```

## Expected flow

```
Client                        Tollbooth                   Video Origin
  │                              │                              │
  │  GET /video/abc123?quality=hd│                              │
  │─────────────────────────────>│                              │
  │                              │  match query.quality →       │
  │                              │  price: $0.10                │
  │  402 + payment instructions  │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  │  (sign $0.10 USDC payment)   │                              │
  │                              │                              │
  │  GET /video/abc123?quality=hd│                              │
  │  + X-PAYMENT header          │                              │
  │─────────────────────────────>│                              │
  │                              │  verify + settle payment     │
  │                              │                              │
  │                              │  GET /streams/abc123/        │
  │                              │      manifest.m3u8           │
  │                              │──────────────────────────────>│
  │                              │                              │
  │                              │  (HLS manifest)              │
  │                              │<──────────────────────────────│
  │  200 + manifest.m3u8         │                              │
  │<─────────────────────────────│                              │
```

## Try it with curl

```bash
# Get a cheap thumbnail (preview)
curl -s http://localhost:3000/video/abc123/thumbnail

# Request 4K video — triggers 402
curl -s http://localhost:3000/video/abc123?quality=4k

# Request SD video — cheaper 402
curl -s http://localhost:3000/video/abc123?quality=sd
```

:::note
This example gates the HLS/DASH manifest behind the paywall. Once the client has the manifest, individual segment fetches go directly to the CDN. For segment-level paywalling, you'd add a separate route for each segment path.
:::

---

**Next:** [Multi-Upstream Gateway →](/examples/multi-upstream-gateway/)
