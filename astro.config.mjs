// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site: 'https://docs.tollbooth.sh',
	integrations: [
		starlight({
			title: 'tollbooth',
			favicon: '/favicon.svg',
			head: [
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: 'https://docs.tollbooth.sh/og-image.png' },
				},
				{
					tag: 'meta',
					attrs: { property: 'og:site_name', content: 'tollbooth docs' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:card', content: 'summary_large_image' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:image', content: 'https://docs.tollbooth.sh/og-image.png' },
				},
			],
			editLink: {
				baseUrl: 'https://github.com/Loa212/tollbooth-docs/edit/main/',
			},
			lastUpdated: true,
			social: [
				{ icon: 'github', label: 'Tollbooth on GitHub', href: 'https://github.com/Loa212/x402-tollbooth' },
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{ label: 'Getting Started', slug: 'getting-started' },
				{
					label: 'How It Works',
					items: [
						{ label: 'The x402 Protocol', slug: 'how-it-works/x402-protocol' },
						{ label: 'Settlement Strategies', slug: 'how-it-works/settlement' },
					],
				},
				{
					label: 'Pay-per-request',
					items: [
						{ label: 'Dynamic Pricing', slug: 'pay-per-request/dynamic-pricing' },
						{ label: 'LLM Pricing', slug: 'pay-per-request/llm-pricing' },
						{ label: 'Pricing Functions', slug: 'pay-per-request/pricing-functions' },
					],
				},
				{
					label: 'Streaming',
					items: [
						{ label: 'Streaming & SSE', slug: 'streaming/streaming-sse' },
						{ label: 'Refund Protection', slug: 'streaming/refund-protection' },
					],
				},
				{
					label: 'Going to Production',
					items: [
						{ label: 'Security & Hardening', slug: 'production/security' },
						{ label: 'Monitoring', slug: 'production/monitoring' },
						{ label: 'Scaling & Shared Stores', slug: 'production/scaling' },
						{ label: 'Fly.io', slug: 'production/fly-io' },
						{ label: 'Railway', slug: 'production/railway' },
						{ label: 'VPS + Nginx', slug: 'production/vps' },
						{ label: 'Cloudflare Workers', slug: 'production/cloudflare-workers' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Configuration', slug: 'reference/configuration' },
						{ label: 'CLI', slug: 'reference/cli' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Local Testing', slug: 'guides/local-testing' },
						{ label: 'OpenAPI Integration', slug: 'guides/openapi' },
						{ label: 'Analytics & Conversion', slug: 'guides/analytics' },
					],
				},
				{
					label: 'Examples',
					items: [
						{ label: 'AI API Reseller', slug: 'examples/ai-api-reseller' },
						{ label: 'Multi-Upstream Gateway', slug: 'examples/multi-upstream-gateway' },
						{ label: 'Paid Articles Blog', slug: 'examples/paid-articles-blog' },
						{ label: 'Video Streaming Paywall', slug: 'examples/video-streaming-paywall' },
					],
				},
			],
			components: {
				SiteTitle: './src/components/SiteTitle.astro',
				PageTitle: './src/components/PageTitle.astro',
				Footer: './src/components/Footer.astro',
			},
		}),
	],
});
