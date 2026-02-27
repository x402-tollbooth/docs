---
title: Production (VPS)
description: Deploy tollbooth on a VPS with Nginx reverse proxy, TLS, and process management.
keywords:
  - VPS
  - deploy
  - Docker
  - Nginx
  - reverse proxy
  - TLS
  - SSL
  - Let's Encrypt
  - certbot
  - systemd
  - PM2
  - Ubuntu
  - self-hosted
---

## Prerequisites

- A VPS (Ubuntu/Debian) with root or sudo access
- A domain name with DNS A record pointed to the VPS
- Node.js 18+ or Docker installed
- Nginx installed (`sudo apt install nginx`)
- A `tollbooth.config.yaml` ready (see [Getting Started](/getting-started/))

## 1. Run tollbooth

### Docker (recommended)

```bash
docker run -d \
  --name tollbooth \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/tollbooth.config.yaml:/app/tollbooth.config.yaml \
  --env-file .env \
  ghcr.io/x402-tollbooth/gateway:latest
```

> **Tip:** Pin a specific image tag (e.g. `ghcr.io/x402-tollbooth/gateway:1.0.0`) instead of `latest` for reproducible deploys.

### npx

```bash
npx tollbooth start
```

If using npx, you'll need a process manager to keep tollbooth running — see the next section.

## 2. Process manager

Skip this if you're using Docker with `--restart unless-stopped`.

### systemd

Create `/etc/systemd/system/tollbooth.service`:

```ini
[Unit]
Description=tollbooth API gateway
After=network.target

[Service]
Type=simple
User=tollbooth
WorkingDirectory=/opt/tollbooth
ExecStart=/usr/bin/npx tollbooth start
Restart=on-failure
EnvironmentFile=/opt/tollbooth/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable tollbooth
sudo systemctl start tollbooth
```

### PM2 (alternative)

```bash
pm2 start "npx tollbooth start" --name tollbooth
pm2 save
pm2 startup
```

## 3. Nginx reverse proxy

Create `/etc/nginx/sites-available/tollbooth`:

```nginx
server {
    listen 80;
    server_name tollbooth.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tollbooth.example.com;

    # TLS — managed by certbot (see step 4)
    ssl_certificate     /etc/letsencrypt/live/tollbooth.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tollbooth.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;

        # Standard proxy headers
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Streaming / SSE — tollbooth streams responses from upstream APIs,
        # so Nginx must not buffer them.
        proxy_buffering off;
        proxy_cache off;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
        proxy_set_header X-Accel-Buffering no;

        # Long timeout for streaming AI responses
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/tollbooth /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 4. TLS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tollbooth.example.com
```

Certbot will obtain the certificate and configure auto-renewal. If you run certbot **before** creating the Nginx config above, use `certbot --nginx` and it will scaffold the TLS directives for you.

## 5. Environment variables

Create an `.env` file with any secrets your config references (e.g. `${API_KEY}`):

```bash
# /opt/tollbooth/.env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

Lock down permissions:

```bash
chmod 600 /opt/tollbooth/.env
```

Docker reads this via `--env-file .env`. systemd reads it via `EnvironmentFile=`. See [Configuration → Environment variables](/reference/configuration/) for the `${VAR}` interpolation syntax.

## 6. Verify

```bash
# Health check
curl https://tollbooth.example.com/health
# → {"status":"ok"}

# x402 discovery
curl https://tollbooth.example.com/.well-known/x402

# Test a paid route — should return 402
curl -i https://tollbooth.example.com/weather
# → HTTP/2 402
```

## Notes

- Logs: `journalctl -u tollbooth -f` (systemd) or `docker logs -f tollbooth` (Docker).
- To run multiple tollbooth instances, add an `upstream` block in Nginx with multiple `server` entries and use `proxy_pass http://upstream_name`. Use shared Redis stores so rate limits/sessions/cache stay consistent: [Scaling & Shared Stores](/production/scaling/).
- If you put Cloudflare in front of Nginx, disable response buffering for streaming routes or use Cloudflare Tunnel.
