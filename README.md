# tollbooth docs

Documentation site for [tollbooth](https://github.com/x402-tollbooth/gateway) — an x402 payment gateway for APIs.

**Live:** https://docs.tollbooth.sh

## What is tollbooth?

tollbooth is an API gateway that monetizes any API by enforcing micro-payments via the x402 protocol. Route requests through tollbooth, set prices, and get paid in USDC on Base.

## Development

```bash
pnpm install
pnpm dev      # Start at localhost:4321
pnpm build    # Build static site
```

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

## Contributing

1. Fork this repo and create a branch
2. Make your changes — docs live in `src/content/docs/`
3. Run `pnpm dev` to preview locally at `localhost:4321`
4. Open a PR against `main`

Every page has an "Edit this page" link in the footer that takes you directly to the right file on GitHub.
