---
title: Scaling and Shared Stores
description: Run tollbooth safely across multiple instances using Redis-backed shared state.
keywords:
  - scaling
  - horizontal scaling
  - autoscaling
  - redis
  - distributed store
  - rate limiting
  - sessions
  - verification cache
  - high availability
  - deployment
---

When you run more than one tollbooth instance (multiple containers, pods, regions, or autoscaled workers), in-memory state is no longer safe.

Use a shared external store, typically Redis, for anything that must stay consistent across instances.

## What must be shared

- **Rate-limit counters:** all instances must read and increment the same counters.
- **Time/session state:** short-lived request/payment session state must be visible no matter which instance receives the next request.
- **Verification cache:** payment verification results and replay-protection markers must be shared to avoid duplicate verification and settlement races.

## What breaks without shared stores

- **Rate limits become inconsistent:** user A can bypass limits by being routed to a different instance.
- **Session continuity breaks:** step 1 lands on instance A, step 2 on instance B, and B cannot find the session.
- **Duplicate work and race conditions:** verification cache misses across instances can trigger repeated upstream verification attempts.
- **Autoscaling amplifies drift:** scale-out events create fresh empty caches, increasing inconsistent behavior under load.

## Recommended Redis topology

### Single Redis instance (good for small production / staging)

- One Redis node, private network access only.
- Backups + persistence enabled (`AOF` or managed snapshots).
- Good default for low/medium traffic and one-region deployments.

### Managed Redis (recommended for serious production)

- Use a managed service (Upstash, Elasticache, Redis Cloud, etc.) with TLS and auth.
- Prefer regional placement close to tollbooth instances to reduce latency.
- For high availability, use provider failover/replication options.
- Set connection and operation timeouts; fail closed for payment-critical paths.

## Suggested key and TTL patterns

Use a clear `keyPrefix` per state type. Keep values small and TTL-driven.

| Concern | Key pattern (example) | Typical TTL |
|---|---|---|
| Rate limits | `tollbooth:rl:{route}:{client_hash}` | 30-120s |
| Session/time windows | `tollbooth:sess:{session_id}` | 5-30m |
| Verification cache | `tollbooth:verify:{payment_hash}` | 10m-24h |

Notes:

- Hash/sanitize user identifiers before including them in keys.
- Add jitter to TTLs when large key groups expire simultaneously.
- Use atomic Redis operations for counters and one-time markers.

## Docker Compose example (tollbooth + Redis)

```yaml
services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "allkeys-lru"]
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  tollbooth:
    image: ghcr.io/loa212/x402-tollbooth:latest
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      REDIS_URL: redis://redis:6379
    volumes:
      - ./tollbooth.config.yaml:/app/tollbooth.config.yaml:ro

volumes:
  redis_data:
```

## Intended Redis config interface (planned)

:::note
The snippets below document the intended direction for distributed store configuration. Field names may change as implementation evolves.
:::

### Option A: Single shared Redis connection

```yaml
stores:
  provider: redis
  redis:
    url: ${REDIS_URL}
    keyPrefix: tollbooth
```

### Option B: Per-store controls

```yaml
stores:
  rateLimits:
    provider: redis
    url: ${REDIS_URL}
    keyPrefix: tollbooth:rl
    ttlSeconds: 60

  sessions:
    provider: redis
    url: ${REDIS_URL}
    keyPrefix: tollbooth:sess
    ttlSeconds: 900

  verificationCache:
    provider: redis
    url: ${REDIS_URL}
    keyPrefix: tollbooth:verify
    ttlSeconds: 3600
```

### Option C: Host/port style with TLS

```yaml
stores:
  provider: redis
  redis:
    host: ${REDIS_HOST}
    port: 6379
    password: ${REDIS_PASSWORD}
    tls: true
    db: 0
    keyPrefix: tollbooth
```

## Deployment checklist

- Use shared Redis before enabling more than one tollbooth instance.
- Keep Redis private (VPC/private network), TLS-enabled, and authenticated.
- Monitor Redis latency, error rates, and memory pressure.
- Test rolling deploys and autoscaling while replaying real traffic patterns.
