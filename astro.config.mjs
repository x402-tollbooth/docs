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
			editLink: {
				baseUrl: 'https://github.com/Loa212/tollbooth-docs/edit/main/',
			},
			lastUpdated: true,
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Loa212/x402-tollbooth' },
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{ label: 'Welcome', slug: 'welcome' },
				{ label: 'Getting Started', slug: 'getting-started' },
				{
					label: 'Guides',
					items: [
						{ label: 'Dynamic Pricing', slug: 'guides/dynamic-pricing' },
						{ label: 'Local Testing', slug: 'guides/local-testing' },
						{ label: 'How x402 Works', slug: 'guides/how-x402-works' },
						{ label: 'Refund Protection', slug: 'guides/refund-protection' },
					],
				},
				{
					label: 'Deploy',
					items: [
						{ label: 'Overview', slug: 'deploy' },
						{ label: 'Fly.io', slug: 'deploy/fly-io' },
						{ label: 'Railway', slug: 'deploy/railway' },
						{ label: 'Production (VPS)', slug: 'deploy/production' },
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
						{ label: 'AI API Reseller', slug: 'examples/ai-api-reseller' },
						{ label: 'Video Streaming Paywall', slug: 'examples/video-streaming-paywall' },
						{ label: 'Multi-Upstream Gateway', slug: 'examples/multi-upstream-gateway' },
					],
				},
			],
			components: {
				SiteTitle: './src/components/SiteTitle.astro',
				PageTitle: './src/components/PageTitle.astro',
			},
		}),
	],
});
