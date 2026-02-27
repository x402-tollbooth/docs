---
title: Security & Hardening
description: Production security checklist for tollbooth deployments.
keywords:
  - security
  - hardening
  - CORS
  - reverse proxy
  - rate limiting
  - secrets
  - production
---

## Quick checklist

- [ ] Restrict CORS origins to your frontend domain(s)
- [ ] Run behind a reverse proxy (Nginx, Caddy) for TLS termination
- [ ] Configure `trustProxy` so tollbooth sees real client IPs
- [ ] Apply rate limits, especially on free routes
- [ ] Set a `fallback` price on every route with `match` rules
- [ ] Keep secrets in env vars, never in config files
- [ ] Never use `facilitator: mock` in production

---

## Reverse proxy

tollbooth should not be directly exposed to the internet. Place it behind a reverse proxy that handles TLS.

Your proxy must forward real client context:

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Bind tollbooth to `127.0.0.1` (not `0.0.0.0`) so only the local proxy can reach it.

## CORS

Only needed if your gateway receives browser requests. For server-to-server only, skip CORS.

Set CORS at the proxy layer or in tollbooth config. Always restrict origins to your specific frontend domain(s).

:::caution
Never set `Access-Control-Allow-Origin: *` on a gateway that handles payments.
:::

## Rate limiting

Apply rate limits at the proxy or in an `onRequest` hook. Free routes (`price: "$0"`) are critical — they bypass the payment flow entirely, so rate limiting is your only protection.

```nginx
# Nginx — 10 requests/second per IP
limit_req_zone $binary_remote_addr zone=tollbooth:10m rate=10r/s;
```

## Secrets

Use `${ENV_VAR}` interpolation for all API keys and sensitive values:

```yaml
# Good
headers:
  x-api-key: "${ANTHROPIC_API_KEY}"

# Bad — ends up in git
headers:
  x-api-key: "sk-ant-abc123..."
```

Lock down your `.env` file (`chmod 600 .env`) and make sure it's in `.gitignore`.

For production beyond a single VPS, use Docker Secrets, a cloud secret manager, or CI/CD variables.

## Pricing safeguards

- **Always set `fallback`** on routes with `match` rules — without it, unmatched requests fall to `defaults.price` which could be cheaper than intended.
- **Cap prices** with an `onPriceResolved` hook if you use custom pricing functions.
- **Set `fallback` deliberately** on token-based routes — a low fallback lets callers use expensive models at a cheap price.

---

**Next:** [Local Testing →](/guides/local-testing/)
