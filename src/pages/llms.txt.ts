import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

const SITE = 'https://docs.tollbooth.sh';

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');
	const byId = new Map(docs.map((d) => [d.id, d]));

	// Ordered list matching the sidebar structure
	const ordered = [
		// Getting Started
		'getting-started',
		// How It Works
		'how-it-works/x402-protocol',
		'how-it-works/settlement',
		// Pay-per-request
		'pay-per-request/dynamic-pricing',
		'pay-per-request/llm-pricing',
		'pay-per-request/pricing-functions',
		// Streaming
		'streaming/streaming-sse',
		'streaming/refund-protection',
		// Going to Production
		'production/security',
		'production/monitoring',
		'production/scaling',
		'production/fly-io',
		'production/railway',
		'production/vps',
		'production/cloudflare-workers',
		// Reference
		'reference/configuration',
		'reference/cli',
		// Guides
		'guides/local-testing',
		'guides/openapi',
		'guides/analytics',
		// Examples
		'examples/ai-api-reseller',
		'examples/multi-upstream-gateway',
		'examples/paid-articles-blog',
		'examples/video-streaming-paywall',
	];

	const lines: string[] = [
		'# tollbooth docs',
		'',
		'> Documentation for tollbooth — an x402 payment gateway that turns any API into a paid API with one line of config.',
		'',
		'## Pages',
		'',
	];

	for (const id of ordered) {
		const entry = byId.get(id);
		if (!entry) continue;
		lines.push(`- [${entry.data.title}](${SITE}/${id}/): [markdown](${SITE}/${id}.md)`);
	}

	// Append any entries not in the ordered list
	for (const entry of docs) {
		if (!ordered.includes(entry.id)) {
			lines.push(`- [${entry.data.title}](${SITE}/${entry.id}/): [markdown](${SITE}/${entry.id}.md)`);
		}
	}

	lines.push('');

	return new Response(lines.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
