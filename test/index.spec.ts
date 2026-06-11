import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

function makeRequest(body: object) {
	return new IncomingRequest('http://example.com/next-episode', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

const mockEpisode = {
	id: 'ep123',
	name: 'Morning Brush with Sharks',
	uri: 'spotify:episode:ep123',
	description: 'Learn about sharks!',
	duration_ms: 120000,
};

beforeEach(async () => {
	await env.EPISODE_TRACKER.delete('episode_state');
	await env.EPISODE_TRACKER.delete('spotify_token');
});

describe('OPTIONS', () => {
	it('returns CORS headers', async () => {
		const request = new IncomingRequest('http://example.com/next-episode', { method: 'OPTIONS' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});
});

describe('unknown routes', () => {
	it('returns 404', async () => {
		const request = new IncomingRequest('http://example.com/unknown');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
	});
});

describe('POST /next-episode', () => {
	it('returns 400 for invalid time_period', async () => {
		const ctx = createExecutionContext();
		const response = await worker.fetch(makeRequest({ time_period: 'noon', current_date: '2025-01-01' }), env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
	});

	it('returns the same episode on replay (same date and time_period)', async () => {
		await env.EPISODE_TRACKER.put(
			'episode_state',
			JSON.stringify({
				current_episode_index: 1,
				current_episode_uri: 'spotify:episode:ep123',
				last_request_date: '2025-01-01',
				last_time_period: 'am',
				total_episodes_played: 1,
				last_episode_id: 'ep123',
				last_episode_title: 'Morning Brush with Sharks',
				last_episode_duration_ms: 120000,
			})
		);

		// Mock Spotify so the worker doesn't make real network calls
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }))
		);

		const ctx = createExecutionContext();
		const response = await worker.fetch(makeRequest({ time_period: 'am', current_date: '2025-01-01' }), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body.replay).toBe(true);
		expect(body.episode_id).toBe('ep123');
		expect(body.duration_ms).toBe(120000);
	});

	it('fetches a new episode when date changes', async () => {
		await env.EPISODE_TRACKER.put(
			'episode_state',
			JSON.stringify({
				current_episode_index: 0,
				last_request_date: '2025-01-01',
				last_time_period: 'am',
				total_episodes_played: 1,
				last_episode_id: 'ep123',
			})
		);

		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ items: [mockEpisode] }))
			);

		const ctx = createExecutionContext();
		const response = await worker.fetch(makeRequest({ time_period: 'am', current_date: '2025-01-02' }), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body.replay).toBe(false);
		expect(body.episode_id).toBe('ep123');
		expect(body.episode_title).toBe('Morning Brush with Sharks');
	});

	it('skips night episodes for am requests', async () => {
		const nightEpisode = { ...mockEpisode, id: 'night1', name: 'Bedtime Night Brush' };
		const genericEpisode = { ...mockEpisode, id: 'generic1', name: 'Fun Facts About Sharks' };

		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [nightEpisode] })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [genericEpisode] })));

		const ctx = createExecutionContext();
		const response = await worker.fetch(makeRequest({ time_period: 'am', current_date: '2025-01-01' }), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body.episode_id).toBe('generic1');
	});

	it('skips morning episodes for pm requests', async () => {
		const morningEpisode = { ...mockEpisode, id: 'morning1', name: 'Good Morning Brush' };
		const genericEpisode = { ...mockEpisode, id: 'generic1', name: 'Fun Facts About Sharks' };

		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [morningEpisode] })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ items: [genericEpisode] })));

		const ctx = createExecutionContext();
		const response = await worker.fetch(makeRequest({ time_period: 'pm', current_date: '2025-01-01' }), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body.episode_id).toBe('generic1');
	});
});
