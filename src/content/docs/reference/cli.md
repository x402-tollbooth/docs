---
lastUpdated: 2026-02-27
title: CLI Reference
description: All tollbooth CLI commands — init, start, dev, validate, and help.
keywords:
  - CLI
  - commands
  - tollbooth init
  - tollbooth start
  - tollbooth dev
  - tollbooth validate
  - OpenAPI
  - programmatic API
  - library
  - createGateway
---

tollbooth provides a CLI for managing your gateway.

## `tollbooth init`

Generate a `tollbooth.config.yaml` interactively.

```bash
tollbooth init
```

Walks you through setting up wallets, upstreams, and routes with prompts.

### Import from OpenAPI

Generate a config from an existing OpenAPI spec:

```bash
tollbooth init --from openapi spec.yaml
```

This reads the OpenAPI spec and creates route entries for each endpoint with default pricing.

---

## `tollbooth start`

Start the gateway.

```bash
tollbooth start [--config=path]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `tollbooth.config.yaml` | Path to the config file |

```bash
# Start with default config location
tollbooth start

# Start with a custom config path
tollbooth start --config=examples/tollbooth.config.dev.yaml
```

On startup, tollbooth:
1. Loads and validates the config
2. Resolves environment variables
3. Loads hook modules (if any)
4. Starts the HTTP server
5. Registers the `/.well-known/x402` discovery endpoint (if `gateway.discovery` is `true`)

---

## `tollbooth dev`

Start the gateway in development mode with watch.

```bash
tollbooth dev [--config=path]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `tollbooth.config.yaml` | Path to the config file |

Same as `start` but with file watching enabled — the gateway restarts when your config or hook files change.

---

## `tollbooth validate`

Validate a config file without starting the gateway.

```bash
tollbooth validate [--config=path]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `tollbooth.config.yaml` | Path to the config file |

Outputs:

```
✅ Config is valid
   2 upstream(s), 5 route(s)
```

Or on error:

```
❌ Invalid "price" value in route "GET /data"
```

Use this in CI to catch config errors before deployment.

---

## `tollbooth help`

Show the help message with all available commands.

```bash
tollbooth help
```

```
⛩️  tollbooth — Turn any API into a paid x402 API

Usage:
  tollbooth init                        Generate a config file interactively
  tollbooth init --from openapi <path>  Generate config from an OpenAPI spec
  tollbooth start [--config=path]       Start the gateway
  tollbooth dev [--config=path]         Start in dev mode (with watch)
  tollbooth validate [--config=path]    Validate config without starting
  tollbooth help                        Show this help message
```

---

## Programmatic API

You can also use tollbooth as a library:

```ts
import { createGateway, loadConfig } from "x402-tollbooth";

const config = loadConfig("./tollbooth.config.yaml");
const gateway = createGateway(config);
await gateway.start();
```

The `TollboothGateway` interface:

```ts
interface TollboothGateway {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
  readonly config: TollboothConfig;
}
```

---

**Next:** [Configuration Reference →](/reference/configuration/)
