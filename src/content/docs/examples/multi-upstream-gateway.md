---
title: "Example: Multi-Upstream Gateway"
description: Route to different backends based on path and price each upstream independently.
keywords:
  - multi-upstream
  - routing
  - multiple backends
  - path rewriting
  - aggregator
  - weather API
  - geocoding
  - OpenAI
  - independent pricing
---

A single tollbooth instance that routes to multiple backend APIs, each with its own pricing. One gateway, many upstreams.

## Use case

You aggregate several third-party APIs behind one paid gateway. Each upstream has different costs and value, so you price them independently. Clients hit a single domain and pay per-request — tollbooth handles routing, auth injection, and payment for all of them.

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
  weather:
    url: "https://api.weatherapi.com/v1"
    headers:
      key: "${WEATHER_API_KEY}"

  geocoding:
    url: "https://api.mapbox.com"
    headers:
      access_token: "${MAPBOX_TOKEN}"

  ai:
    url: "https://api.openai.com"
    headers:
      authorization: "Bearer ${OPENAI_API_KEY}"

routes:
  # Cheap data endpoint
  "GET /weather/:city":
    upstream: weather
    path: "/current.json?q=${params.city}"
    price: "$0.005"

  # Mid-tier geocoding
  "GET /geocode/:query":
    upstream: geocoding
    path: "/geocoding/v5/mapbox.places/${params.query}.json"
    price: "$0.01"

  # Expensive AI — priced by model
  "POST /v1/chat/completions":
    upstream: ai
    type: token-based
    models:
      gpt-4o: "$0.05"
      gpt-4o-mini: "$0.005"
    fallback: "$0.01"
```

### How this config works

- **Three upstreams** — weather, geocoding, and AI — each with their own base URL and auth headers.
- **Path-based routing** sends requests to the right backend based on the public URL path.
- **Independent pricing** — weather is cheap ($0.005), geocoding is mid-tier ($0.01), AI uses per-model pricing via `type: token-based`.
- **Path rewriting** — each route maps the public-facing path to the upstream's actual API format.
- **One wallet** collects payments from all routes.

## Run it

```bash
export WEATHER_API_KEY="..."
export MAPBOX_TOKEN="..."
export OPENAI_API_KEY="sk-..."
npx tollbooth start
```

## Expected flow

```
Client                        Tollbooth                   Upstreams
  │                              │                              │
  │  GET /weather/london         │                              │
  │─────────────────────────────>│                              │
  │                              │  route → weather upstream    │
  │                              │  price: $0.005               │
  │  402 + payment instructions  │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  │  (sign $0.005 USDC)          │                              │
  │                              │                              │
  │  GET /weather/london         │                              │
  │  + payment-signature header   │                              │
  │─────────────────────────────>│                              │
  │                              │  GET /current.json?q=london  │
  │                              │───────────────────────────> Weather API
  │                              │                              │
  │                              │  { temp: 12, ... }           │
  │                              │<───────────────────────────  │
  │  200 + weather data          │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  ├──────────────────────────────┤                              │
  │                              │                              │
  │  POST /v1/chat/completions   │                              │
  │  { model: "gpt-4o" }        │                              │
  │─────────────────────────────>│                              │
  │                              │  route → ai upstream         │
  │                              │  model: gpt-4o → $0.05      │
  │  402 + payment instructions  │                              │
  │<─────────────────────────────│                              │
  │                              │                              │
  │  ...pay and get response...  │                              │
```

## Try it with curl

```bash
# Weather — cheap
curl -s http://localhost:3000/weather/london

# Geocoding — mid-tier
curl -s http://localhost:3000/geocode/tokyo

# AI — model-based pricing
curl -s http://localhost:3000/v1/chat/completions \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hi"}]}'
```

Each request returns a `402` with a price matching that route's configuration. An x402-compatible client handles payment automatically.

:::tip
The discovery endpoint at `GET /.well-known/x402` lists all routes and their prices, so clients can display a pricing table before making requests.
:::

---

**Next:** [Configuration Reference →](/reference/configuration/)
