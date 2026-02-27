---
lastUpdated: 2026-02-27
title: OpenAPI Integration
description: Import routes from an OpenAPI spec and export an enriched spec with x402 payment extensions.
keywords:
  - OpenAPI
  - import
  - export
  - x402 extensions
  - agent discovery
  - well-known
  - openapi.json
  - auto-discover
  - tollbooth init
---

tollbooth has two-way OpenAPI integration: it can **import** routes from an existing spec at startup, and **export** an enriched spec that combines the upstream API shape with x402 payment metadata.

## Import — auto-generate routes from a spec

Point an upstream at an OpenAPI spec and tollbooth auto-discovers all routes at startup:

```yaml
upstreams:
  myapi:
    url: "https://api.example.com"
    openapi: "https://api.example.com/openapi.json"
    defaultPrice: "$0.01"
```

tollbooth fetches the spec, creates a route for each operation, and applies `defaultPrice` as the price. If `defaultPrice` is omitted, imported routes use `defaults.price`. You can also point at a local file:

```yaml
upstreams:
  myapi:
    url: "https://api.example.com"
    openapi: "./api-spec.yaml"
    defaultPrice: "$0.005"
```

Supported spec locations:

| Value | Example |
|-------|---------|
| HTTPS URL | `"https://api.example.com/openapi.json"` |
| HTTP URL | `"http://localhost:4000/openapi.json"` |
| Relative file path | `"./specs/myapi.yaml"` |
| Absolute file path | `"/etc/specs/myapi.json"` |

Supported formats: `.json`, `.yaml`, `.yml` (OpenAPI 3.x).

### Route precedence

Config-defined routes always take precedence over auto-imported ones. Use this to override pricing for specific endpoints without listing every route manually:

```yaml
upstreams:
  myapi:
    url: "https://api.example.com"
    openapi: "https://api.example.com/openapi.json"
    defaultPrice: "$0.01"        # applied to all imported routes

routes:
  "POST /v1/generate":           # override just this one
    upstream: myapi
    price: "$0.05"
```

Everything from the spec is imported at `$0.01`, except `POST /v1/generate` which charges `$0.05`.

---

## Export — serve an enriched OpenAPI spec

When `gateway.discovery` is enabled (the default), tollbooth serves an enriched OpenAPI 3.1 spec at:

```
GET /.well-known/openapi.json
```

The spec includes:

- All tollbooth routes as operations
- `402` response documented per paid route
- x402 payment extensions per operation:
  - `x-x402-price` — the resolved price
  - `x-x402-accepts` — accepted assets and networks
  - `x-x402-pricing-type` — `"static"`, `"dynamic"`, `"match"`, or `"token-based"`

Example response (truncated):

```json
{
  "openapi": "3.1.0",
  "info": { "title": "tollbooth gateway", "version": "1.0.0" },
  "paths": {
    "/v1/data": {
      "get": {
        "x-x402-price": "$0.01",
        "x-x402-accepts": [{ "asset": "USDC", "network": "base" }],
        "x-x402-pricing-type": "static",
        "responses": {
          "200": { "description": "OK" },
          "402": { "description": "Payment required" }
        }
      }
    }
  }
}
```

No config changes are needed — the endpoint is active whenever `gateway.discovery: true`.

---

## Enrichment pipeline

When an upstream has an `openapi` field, the export endpoint merges that spec with tollbooth pricing info. Agents get one spec that describes both the API shape and what each call costs:

```
[upstream OpenAPI spec] → [tollbooth] → [OpenAPI + x402 payment info]
```

If the upstream spec is unavailable at export time, tollbooth builds the export spec from config instead.

---

## Generate a config from a spec

Use `tollbooth init` to bootstrap a config from an existing spec without running the gateway:

```bash
tollbooth init --from openapi spec.yaml
```

This creates a `tollbooth.config.yaml` with route entries for each endpoint at a default price. Useful for onboarding an existing API quickly — edit the generated config and adjust pricing as needed.

---

## Agent discovery

The exported spec at `/.well-known/openapi.json` is how AI agents and tool-calling frameworks can discover what your gateway offers and what each call costs. Point an agent's tool-loading step at that URL, and it gets a complete picture of available operations plus payment requirements — no separate discovery step needed.

If your client is browser-based, make sure [`gateway.cors`](/production/security/#cors) is configured so the spec endpoint is accessible cross-origin.

---

## Configuration reference

### Upstream fields

| Field | Type | Description |
|-------|------|-------------|
| `openapi` | `string` | URL or file path to an OpenAPI spec. Routes are auto-imported at startup. |
| `defaultPrice` | `string` | Price applied to all imported routes (e.g. `"$0.01"`). Optional — when omitted, imported routes use `defaults.price`. |

### Gateway fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gateway.discovery` | `boolean` | `true` | Enables `/.well-known/x402` and `/.well-known/openapi.json` |

---

**Next:** [Analytics & Conversion →](/guides/analytics/)
