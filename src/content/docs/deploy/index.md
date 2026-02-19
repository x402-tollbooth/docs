---
title: Deploy
description: Deploy tollbooth to production on your preferred platform.
---

Tollbooth ships as a Docker image at `ghcr.io/loa212/x402-tollbooth`, so it runs anywhere that can pull and run a container.

| Platform | Status | Guide |
|---|---|---|
| Fly.io | **Supported** | [Fly.io guide](/deploy/fly-io/) |
| Railway | **Supported** | [Railway guide](/deploy/railway/) |
| VPS + Nginx | **Supported** | [Production guide](/deploy/production/) |
| Cloudflare Workers | **Not compatible** | [Compatibility notes](/deploy/cloudflare-workers/) |
| Any Docker host | **Supported** | See [Getting Started](/getting-started/) |

All guides assume you already have a `tollbooth.config.yaml`. If you don't, see [Getting Started](/getting-started/) first.
