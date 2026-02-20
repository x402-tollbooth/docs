import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

/** Strip MDX import statements and JSX tags, keeping inner text content. */
function stripMdx(md: string): string {
	return (
		md
			// Remove import lines
			.replace(/^import\s.+$/gm, '')
			// Remove self-closing JSX tags (e.g. <Card … />)
			.replace(/<\w[\w.-]*\b[^>]*\/>/g, '')
			// Remove opening JSX tags (e.g. <Card title="…">)
			.replace(/<\w[\w.-]*\b[^>]*>/g, '')
			// Remove closing JSX tags (e.g. </Card>)
			.replace(/<\/\w[\w.-]*>/g, '')
			// Collapse 3+ consecutive blank lines into 2
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');
	const byId = new Map(docs.map((d) => [d.id, d]));

	// Ordered list matching the sidebar structure
	const ordered = [
		'welcome',
		'getting-started',
		'guides/dynamic-pricing',
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

	// Collect entries in order, then append any extras
	const entries: { id: string; data: { title: string }; body?: string }[] = [];
	for (const id of ordered) {
		const entry = byId.get(id);
		if (entry) entries.push(entry);
	}
	for (const entry of docs) {
		if (!ordered.includes(entry.id)) entries.push(entry);
	}

	const lines: string[] = [
		'# tollbooth docs',
		'',
		'> Documentation for tollbooth — an x402 payment gateway that turns any API into a paid API with one line of config.',
		'',
	];

	for (const entry of entries) {
		const body = stripMdx(entry.body ?? '');
		lines.push('---', '', `# ${entry.data.title}`, '', body, '');
	}

	return new Response(lines.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
