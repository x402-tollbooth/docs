---
title: Security & Hardening
description: Production security checklist and best practices for tollbooth deployments — CORS, reverse proxies, abuse mitigation, and secret management.
keywords:
  - security
  - hardening
  - CORS
  - reverse proxy
  - trust proxy
  - rate limiting
  - abuse
  - secrets
  - environment variables
  - headers
  - production
  - checklist
---

tollbooth sits between the public internet and your upstream APIs. A misconfigured gateway can leak API keys, allow abuse, or expose upstream services. This page covers the security posture you should aim for in production.

## Quick checklist

Use this as a pre-launch sweep. Each item links to its detailed section below.

- [ ] [CORS](#cors) — restrict origins to your frontend domain(s)
- [ ] [Reverse proxy](#reverse-proxy--load-balancer) — terminate TLS, forward real client IPs
- [ ] [Trust proxy](#trust-proxy-and-client-ip) — configure so tollbooth sees real IPs, not `127.0.0.1`
- [ ] [Rate limiting](#rate-limiting) — apply per-IP or per-wallet limits
- [ ] [Pricing safeguards](#pricing-safeguards) — set max price caps and deny unexpectedly expensive requests
- [ ] [Payload size limits](#payload-size-limits) — cap request body size at the proxy layer
- [ ] [Secrets in env vars](#environment-variables) — never commit API keys to config files or git
- [ ] [Secret rotation](#secret-rotation) — rotate upstream API keys periodically
- [ ] [Request tracing headers](#request-tracing-headers) — forward or generate request/trace IDs

---

## CORS

If your tollbooth gateway is called directly from browser-based frontends (e.g. a JavaScript SDK), you need to handle Cross-Origin Resource Sharing (CORS). If your gateway only receives server-to-server requests, CORS headers are not required.

### Recommended defaults

Set CORS headers at the reverse proxy layer (Nginx, Caddy, Cloudflare) rather than in tollbooth itself:

```nginx
# Nginx — restrict to your frontend origin
add_header Access-Control-Allow-Origin "https://app.example.com" always;
add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Payment, X-Payment-Response" always;
add_header Access-Control-Max-Age 86400 always;

if ($request_method = OPTIONS) {
    return 204;
}
```

### Allowlist patterns

- **Single origin** — set `Access-Control-Allow-Origin` to the exact origin (`https://app.example.com`).
- **Multiple origins** — use a map block or `if` directive to dynamically return the matching origin from a set of allowed values. Never reflect the `Origin` header blindly.
- **Avoid `*`** — a wildcard origin disables credential-based CORS and signals that you haven't thought about who should call your gateway.

:::caution
Never set `Access-Control-Allow-Origin: *` on a gateway that handles payments. Browsers will block credential headers, and it invites cross-origin abuse.
:::

---

## Reverse proxy & load balancer

tollbooth should not be directly exposed to the internet. Place it behind a reverse proxy (Nginx, Caddy, Traefik, cloud LB) that handles TLS termination and header injection. See [Production (VPS)](/deploy/production/) for a full Nginx setup.

### Forwarded headers

Your proxy must set these headers so tollbooth and your upstream APIs see the real client context:

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Without these, tollbooth sees all requests as coming from `127.0.0.1` over plain HTTP, which breaks rate limiting, logging, and any IP-based access control in hooks.

### Trust proxy and client IP

If tollbooth runs behind one or more proxies, you need to ensure it trusts the `X-Forwarded-For` header from your proxy but not from arbitrary clients. The standard approach:

1. Bind tollbooth to `127.0.0.1` (not `0.0.0.0`) so only the local proxy can reach it.
2. Configure your proxy to overwrite (not append) `X-Forwarded-For` so clients cannot spoof their IP.
3. In your [`onRequest` hook](/reference/configuration/#hooks), read the IP from `X-Real-IP` or the last entry in `X-Forwarded-For`:

```ts
// hooks/extract-ip.ts
export default async (ctx) => {
  const clientIp =
    ctx.req.headers["x-real-ip"] ||
    ctx.req.headers["x-forwarded-for"]?.split(",").pop()?.trim();
  // use clientIp for rate limiting, logging, etc.
};
```

:::note
If you're behind multiple proxies (e.g. Cloudflare → Nginx → tollbooth), use `CF-Connecting-IP` (Cloudflare) or the equivalent header from your edge provider instead of `X-Forwarded-For`.
:::

---

## Abuse mitigation

### Rate limiting

tollbooth does not ship a built-in rate limiter. Apply rate limits at one of these layers:

**At the reverse proxy (recommended for simple cases):**

```nginx
# Nginx — 10 requests/second per IP, burst of 20
limit_req_zone $binary_remote_addr zone=tollbooth:10m rate=10r/s;

server {
    location / {
        limit_req zone=tollbooth burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

**In an `onRequest` hook (for per-wallet or per-route logic):**

```ts
// hooks/rate-limit.ts
import { RateLimiter } from "./your-rate-limiter";

const limiter = new RateLimiter({ windowMs: 60_000, max: 100 });

export default async (ctx) => {
  const ip = ctx.req.headers["x-real-ip"] || "unknown";
  if (!limiter.allow(ip)) {
    return { reject: true, status: 429, body: "Too many requests" };
  }
};
```

**Suggested limits by endpoint class:**

| Endpoint class | Suggested rate | Why |
|---|---|---|
| Discovery (`/.well-known/x402`) | 30 req/s per IP | Lightweight, but no reason to hammer it |
| Health (`/health`) | 10 req/s per IP | Monitoring only |
| Paid AI routes | 5–20 req/s per IP | Each request costs money — limit protects your upstream spend |
| Free routes (`price: "$0"`) | 50–100 req/s per IP | No payment gate — rate limit is your only protection |

:::tip
Free routes (`price: "$0"`) bypass the payment flow entirely, so rate limiting is critical. Without it, anyone can flood your upstream at no cost.
:::

### Pricing safeguards

Misconfigured pricing can lead to surprisingly cheap (or expensive) requests:

- **Set a `fallback` price on every route with `match` rules** — if no rule matches and there's no fallback, the request may use `defaults.price` which could be lower than intended.
- **Cap maximum prices** — use an `onPriceResolved` hook to reject requests above a threshold:

```ts
// hooks/price-cap.ts
const MAX_PRICE = 1_000_000; // $1.00 in USDC micro-units

export default async (ctx) => {
  if (ctx.price > MAX_PRICE) {
    return { reject: true, status: 400, body: "Price exceeds cap" };
  }
};
```

- **Deny unknown models on token-based routes** — without a `fallback`, an unknown model returns an error. With a low fallback, a caller could use an expensive model at the fallback price. Set your fallback deliberately.

### Payload size limits

Large request bodies can be used to abuse upstream APIs or exhaust memory. Set limits at the proxy layer:

```nginx
# Nginx — 1 MB max body
client_max_body_size 1m;
```

For Cloudflare, the free tier enforces a 100 MB limit; configure a WAF rule for a tighter cap.

---

## Secret management

### Environment variables

tollbooth supports `${ENV_VAR}` interpolation in config values. Always use this for API keys, wallet addresses, and anything sensitive:

```yaml
# Good — secret stays in .env
upstreams:
  anthropic:
    headers:
      x-api-key: "${ANTHROPIC_API_KEY}"

# Bad — secret in version control
upstreams:
  anthropic:
    headers:
      x-api-key: "sk-ant-abc123..."
```

Lock down your `.env` file:

```bash
chmod 600 .env
```

And make sure `.env` is in `.gitignore`.

### Secret stores

For production deployments beyond a single VPS, consider a dedicated secret store:

- **Docker Secrets** — mount secrets as files in `/run/secrets/` and reference them in your env.
- **Cloud provider** — AWS Secrets Manager, GCP Secret Manager, or Doppler can inject secrets into your container environment at deploy time.
- **CI/CD variables** — store secrets in your CI provider (GitHub Actions secrets, Railway variables) and inject them during deploy.

### Secret rotation

Rotate upstream API keys periodically. A rotation process looks like:

1. Generate a new key in the upstream provider.
2. Update the environment variable (`.env`, secret store, CI variable).
3. Restart tollbooth to pick up the new value.
4. Revoke the old key after confirming the new key works.

tollbooth reads environment variables at startup, so a restart (or container redeploy) is required to pick up rotated secrets.

---

## Request tracing headers

In a proxy chain (client → CDN → reverse proxy → tollbooth → upstream), tracing a single request across logs is difficult without a shared identifier. Forward or generate these headers:

| Header | Purpose |
|---|---|
| `X-Request-Id` | Unique ID per request — generate at the edge if the client doesn't send one |
| `X-Trace-Id` | Distributed trace ID for multi-service tracing (OpenTelemetry, Datadog, etc.) |

**Nginx — generate a request ID if absent:**

```nginx
map $http_x_request_id $req_id {
    default $http_x_request_id;
    ""      $request_id;
}

proxy_set_header X-Request-Id $req_id;
```

Use your `onRequest` hook to log the request ID alongside payment info for audit trails.

---

## Common misconfigurations

### Exposing tollbooth directly on 0.0.0.0

If tollbooth binds to `0.0.0.0` without a firewall, anyone can bypass your reverse proxy and hit tollbooth directly — skipping TLS, rate limits, and header injection.

**Fix:** Bind tollbooth to `127.0.0.1` or use Docker's published port syntax `127.0.0.1:3000:3000`.

### Committing secrets to tollbooth.config.yaml

Hardcoding API keys in your config file means they end up in git history. Even if you remove them later, they're recoverable.

**Fix:** Use `${ENV_VAR}` interpolation for all secrets. If you've already committed a secret, rotate it immediately — don't just delete the line.

### Missing fallback price on match routes

If you use `match` rules without a `fallback`, requests that don't match any rule fall through to `defaults.price`. If that's lower than expected (or `"$0"`), callers get cheap access to expensive models.

**Fix:** Always set an explicit `fallback` on routes with `match` rules.

### Using `mock` facilitator in production

The `mock` facilitator accepts every payment without verification. If it reaches production, all routes are effectively free.

**Fix:** Never set `facilitator: mock` outside of local development. See [Settlement Strategies](/guides/settlement-strategies/) for production options.

### Wildcard CORS on a payment gateway

Setting `Access-Control-Allow-Origin: *` on a gateway that handles `X-Payment` headers disables credentialed CORS and signals to attackers that cross-origin access is unrestricted.

**Fix:** Set the origin to your specific frontend domain(s). If you don't have a browser frontend, omit CORS headers entirely.

### No rate limit on free routes

Routes with `price: "$0"` skip the payment gate entirely. Without rate limiting, anyone can flood your upstream API at zero cost.

**Fix:** Apply aggressive rate limits to all free routes — the payment flow is not there to slow down abusers.

---

**Next:** [Local Testing →](/guides/local-testing/)
