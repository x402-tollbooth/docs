---
title: Scaling and Shared Stores
description: Run tollbooth across multiple instances using Redis-backed shared state.
keywords:
  - scaling
  - redis
  - distributed store
  - rate limiting
  - sessions
  - verification cache
---

When running multiple tollbooth instances, in-memory state is no longer safe. Use Redis for anything that must stay consistent across instances.

## What must be shared

| Store | Why |
|---|---|
| Rate-limit counters | All instances must read/increment the same counters |
| Time/session state | Session started on instance A must be visible on instance B |
| Verification cache | Prevents duplicate verification and settlement races |

Without shared stores: rate limits become per-instance, sessions break across instances, and autoscaling creates fresh empty caches.

## Configuration

```yaml
stores:
  redis:
    url: "redis://localhost:6379"
    prefix: "tollbooth-prod"

  rateLimit:
    backend: redis

  verificationCache:
    backend: redis

  timeSession:
    backend: redis
```

You can override Redis connection details per store:

```yaml
stores:
  redis:
    url: "redis://shared-cache:6379"
    prefix: "tollbooth"

  verificationCache:
    backend: redis
    redis:
      url: "redis://verification-cache:6379"
      prefix: "tollbooth-vc"
```

## Docker Compose example

```yaml
services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  tollbooth:
    image: ghcr.io/loa212/x402-tollbooth:latest
    depends_on: [redis]
    ports:
      - "3000:3000"
    environment:
      REDIS_URL: redis://redis:6379
    volumes:
      - ./tollbooth.config.yaml:/app/tollbooth.config.yaml:ro

volumes:
  redis_data:
```

## Production recommendations

- Use a managed Redis service (Upstash, Elasticache, Redis Cloud) with TLS and auth.
- Place Redis close to tollbooth instances to minimize latency.
- Enable shared Redis **before** scaling to multiple instances.
- Monitor Redis latency, error rates, and memory.
