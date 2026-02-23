// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site: 'https://docs.tollbooth.loa212.com',
	integrations: [
		starlight({
			title: 'tollbooth',
			favicon: '/favicon.svg',
			head: [
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: 'https://docs.tollbooth.loa212.com/og-image.png' },
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
					attrs: { name: 'twitter:image', content: 'https://docs.tollbooth.loa212.com/og-image.png' },
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
				{ label: 'Welcome', slug: 'welcome' },
				{ label: 'Getting Started', slug: 'getting-started' },
				{
					label: 'Guides',
					items: [
						{ label: 'Dynamic Pricing', slug: 'guides/dynamic-pricing' },
						{ label: 'Pricing Functions Cookbook', slug: 'guides/pricing-functions-cookbook' },
						{ label: 'LLM Pricing Operations', slug: 'guides/llm-pricing-operations' },
						{ label: 'Settlement Strategies', slug: 'guides/settlement-strategies' },
						{ label: 'Security & Hardening', slug: 'guides/security-hardening' },
						{ label: 'Streaming & SSE', slug: 'guides/streaming-sse' },
						{ label: 'OpenAPI Integration', slug: 'guides/openapi' },
						{ label: 'Local Testing', slug: 'guides/local-testing' },
						{ label: 'How x402 Works', slug: 'guides/how-x402-works' },
						{ label: 'Refund Protection', slug: 'guides/refund-protection' },
						{ label: 'Monitoring & Observability', slug: 'guides/monitoring' },
					],
				},
				{
					label: 'Observability',
					items: [{ label: 'Analytics & Conversion', slug: 'observability/conversion-funnel' }],
				},
				{
					label: 'Deploy',
					items: [
						{ label: 'Overview', slug: 'deploy' },
						{ label: 'Fly.io', slug: 'deploy/fly-io' },
						{ label: 'Railway', slug: 'deploy/railway' },
						{ label: 'Production (VPS)', slug: 'deploy/production' },
						{ label: 'Scaling & Shared Stores', slug: 'deploy/scaling-shared-stores' },
						{ label: 'Cloudflare Workers', slug: 'deploy/cloudflare-workers' },
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
					label: 'Examples',
					items: [
						{ label: 'Paid Articles Blog', slug: 'examples/paid-articles-blog' },
						{ label: 'AI API Reseller', slug: 'examples/ai-api-reseller' },
						{ label: 'Video Streaming Paywall', slug: 'examples/video-streaming-paywall' },
						{ label: 'Multi-Upstream Gateway', slug: 'examples/multi-upstream-gateway' },
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
