---
title: Cloudflare Workers
description: Why tollbooth can't run on Cloudflare Workers and what alternatives to use instead.
keywords:
  - Cloudflare Workers
  - serverless
  - compatibility
  - limitations
  - Cloudflare Tunnel
  - cloudflared
  - edge
  - alternative
---

Tollbooth **cannot run on Cloudflare Workers** in its current form. This page explains why and lists alternatives that still let you use Cloudflare's network.

## Incompatibilities

| Tollbooth dependency | Workers support | Issue |
|---|---|---|
| `Bun.serve()` | No | Workers use a `fetch()` handler export, not a long-lived HTTP server |
| `Bun.file()` | No | Workers have no filesystem access |
| YAML config loading from disk | No | No filesystem — would need KV or R2 |
| Dynamic `import()` for hooks/pricing | Limited | Workers require static imports |
| Long-lived HTTP server | No | Workers are request-scoped |
| `node:` built-ins | Partial | Only a subset is available via the `nodejs_compat` flag |

## What a port would require

To run tollbooth natively on Workers, you'd need to:

1. Replace `Bun.serve()` with a Workers `fetch()` handler export
2. Externalize config into KV, R2, or environment variables
3. Remove all dynamic `import()` calls in favor of static imports
4. Replace Bun-specific APIs (`Bun.file()`, etc.) with Workers equivalents
5. Test the full x402 payment flow under Workers request-scoping constraints

This is a non-trivial effort and not currently planned.

## Alternatives

### Cloudflare Tunnel

Run tollbooth on any server (VPS, local machine, etc.) and expose it through Cloudflare's network using `cloudflared`. You get Cloudflare's CDN, DDoS protection, and SSL — without needing Workers.

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Authenticate
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create tollbooth

# Route your domain to the tunnel
cloudflared tunnel route dns tollbooth tollbooth.example.com

# Run the tunnel, pointing to your local tollbooth instance
cloudflared tunnel run --url http://localhost:3000 tollbooth
```

### VPS + Cloudflare proxy

Run tollbooth in Docker on any VPS, point your domain's DNS to the VPS via Cloudflare, and enable the orange-cloud proxy. This gives you Cloudflare's CDN and SSL with a standard Docker deployment.

### Managed platforms

For the simplest managed deployment, see the [Fly.io](/production/fly-io/) and [Railway](/production/railway/) guides.
