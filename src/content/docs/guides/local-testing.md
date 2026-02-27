---
title: Local Development & Testing
description: Run tollbooth locally with a dummy API, test 402 responses, and run end-to-end payments on testnet.
keywords:
  - local development
  - testing
  - testnet
  - Base Sepolia
  - e2e
  - end-to-end
  - dummy API
  - wallet
  - USDC faucet
  - EIP-3009
  - test client
---

## Local development (no wallet needed)

Try tollbooth locally with a dummy API — no wallets or real payments needed.

### 1. Clone and install

```bash
git clone https://github.com/Loa212/x402-tollbooth.git
cd x402-tollbooth
bun install
```

### 2. Start the dummy upstream API

```bash
bun run examples/dummy-api.ts
```

This starts a fake API on `http://localhost:4000` with three endpoints:

| Endpoint | Response |
|----------|----------|
| `GET /weather` | Weather data |
| `POST /chat` | Echoes back the model name |
| `GET /data/:id` | Mock query results |

### 3. Start tollbooth

In a second terminal:

```bash
bun run src/cli.ts -- --config=examples/tollbooth.config.dev.yaml
```

Tollbooth starts on `http://localhost:3000` and proxies to the dummy API with x402 payment requirements.

### 4. Test the 402 flow

In a third terminal:

```bash
bun run examples/test-client.ts
```

This fires requests at tollbooth and prints the 402 responses. You should see different prices depending on the route:

| Request | Price | Why |
|---------|-------|-----|
| `GET /weather` | $0.01 (10,000) | Static price |
| `POST /chat` body `model: "haiku"` | $0.005 (5,000) | Body-match rule |
| `POST /chat` body `model: "opus"` | $0.075 (75,000) | Body-match rule |
| `GET /data/12345` | $0.05 (50,000) | Param extraction + static price |
| `GET /.well-known/x402` | 200 | V2 discovery metadata |
| `GET /health` | 200 | Health check |

Since no real wallet is signing payments, every request gets a 402 back with the `PAYMENT-REQUIRED` header — which is exactly what you want to verify.

---

## End-to-end test with real payments

Run a full payment cycle on Base Sepolia testnet: `GET /weather` → 402 → sign → pay → 200 with tx hash.

### 1. Set up two wallets

You need two separate Ethereum wallets:

- **Payer wallet** — the "buyer" that signs and pays for requests. Must hold testnet USDC.
- **Gateway wallet** — the "seller" that receives USDC. Can be any address (no funds needed).

```bash
# Using cast (install Foundry: https://getfoundry.sh)
cast wallet new   # run twice — one payer, one gateway
```

### 2. Configure your env file

```bash
cp .env.test.example .env.test
```

```bash
# .env.test

# Payer wallet (the "buyer") — needs testnet USDC
TEST_PRIVATE_KEY=0x...          # private key of the payer wallet
TEST_WALLET_ADDRESS=0x...       # public address of the payer wallet

# Gateway wallet (the "seller") — receives USDC payments
TEST_GATEWAY_ADDRESS=0x...      # must be a different address from TEST_WALLET_ADDRESS
```

:::caution
Never commit `.env.test` — it contains your private key. It's already in `.gitignore`.
:::

### 3. Get testnet USDC

The payer wallet needs USDC on Base Sepolia. The x402 facilitator sponsors gas, so you only need USDC — no ETH required.

1. Go to the [Circle USDC Faucet](https://faucet.circle.com)
2. Select **Base Sepolia** as the network
3. Paste your **payer** wallet address and request USDC

USDC contract on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### 4. Run the test

Open three terminals:

**Terminal 1 — dummy upstream:**
```bash
bun run examples/dummy-api.ts
```

**Terminal 2 — tollbooth gateway:**
```bash
bun run --env-file=.env.test src/cli.ts start --config=examples/tollbooth.config.e2e.yaml
```

**Terminal 3 — e2e test:**
```bash
bun run --env-file=.env.test examples/e2e-payment.ts
```

### Expected output

```
🔑 Payer wallet:   0xYourPayerAddress
   Network:        Base Sepolia (chain 84532)
   USDC contract:  0x036CbD53842c5426634e7929541eC2318f3dCF7e
   Gateway:        http://localhost:3000

── Step 1: GET /weather (expect 402) ──
✓ Got 402 with payment requirements:
  scheme:             exact
  network:            base-sepolia
  asset:              0x036CbD53842c5426634e7929541eC2318f3dCF7e
  maxAmountRequired:  1000 (0.001 USDC)
  payTo:              0xYourGatewayAddress
  maxTimeoutSeconds:  300

── Step 2: Sign EIP-3009 transferWithAuthorization ──
✓ Payment signed

── Step 3: Resend GET /weather + payment-signature (expect 200) ──
Status: 200

── Step 4: Verify payment-response header ──

✅ E2E test passed!
──────────────────────────────────────────────────────────────
  Tx hash:  0xabc123...
  Network:  base-sepolia
  Payer:    0xYourPayerAddress
  Amount:   1000 raw units
──────────────────────────────────────────────────────────────

🔗 View on Basescan: https://sepolia.basescan.org/tx/0xabc123...
```

:::note[Proof it works]
The first successful e2e payment was settled on Base Sepolia. You can verify it on [Basescan](https://sepolia.basescan.org).
:::

---

**Next:** [OpenAPI Integration →](/guides/openapi/)
