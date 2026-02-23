import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

const SITE = 'https://docs.tollbooth.loa212.com';

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');
	const byId = new Map(docs.map((d) => [d.id, d]));

	// Ordered list matching the sidebar structure
	const ordered = [
		'welcome',
		'getting-started',
		'guides/dynamic-pricing',
		'guides/streaming-sse',
		'guides/local-testing',
		'guides/how-x402-works',
		'guides/refund-protection',
		'deploy',
		'deploy/fly-io',
		'deploy/railway',
		'deploy/production',
		'deploy/cloudflare-workers',
		'reference/configuration',
		'reference/cli',
		'examples/ai-api-reseller',
		'examples/video-streaming-paywall',
		'examples/multi-upstream-gateway',
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
