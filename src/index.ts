import { Episode, EpisodeResult, RequestBody, SpotifyEpisodesResponse, SpotifyTokenCache, SpotifyTokenResponse } from './types';

export interface Env {
	EPISODE_TRACKER: KVNamespace;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				},
			});
		}

		if (request.method === 'POST' && new URL(request.url).pathname === '/next-episode') {
			return handleNextEpisode(request, env);
		}

		return new Response('Not Found', { status: 404 });
	},
};

const TOTAL_EPISODES = 3565;
const CHOMPERS_SHOW_ID = '21ASCcEXgUlbFSmoqjroZm';
const BLACKLISTED_EPISODES: string[] = [
	// Add episode IDs to skip here
	'episode_id_1',
	'episode_id_2',
	// Add more as needed
];

async function handleNextEpisode(request: Request, env: Env): Promise<Response> {
	try {
		const body: RequestBody = await request.json();
		const { time_period, current_date } = body;

		if (!['am', 'pm'].includes(time_period)) {
			return new Response('Invalid time_period', { status: 400 });
		}

		const stateKey = 'episode_state';
		const currentStateJson = await env.EPISODE_TRACKER.get(stateKey);
		const currentState: EpisodeState = currentStateJson
			? JSON.parse(currentStateJson)
			: {
					current_episode_index: 0,
					last_request_date: null,
					last_time_period: null,
					total_episodes_played: 0,
					last_episode_id: null,
			  };

		const shouldReplay =
			currentState.last_request_date === current_date && currentState.last_time_period === time_period && currentState.last_episode_id;

		if (shouldReplay) {
			return new Response(
				JSON.stringify({
					episode_id: currentState.last_episode_id,
					episode_title: currentState.last_episode_title || 'Previous Episode',
					replay: true,
					episode_index: currentState.current_episode_index,
				}),
				{
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
					},
				}
			);
		}

		const episodeResult = await findNextValidEpisode(env, currentState.current_episode_index, time_period);

		if (!episodeResult) {
			return new Response('No more episodes available', { status: 404 });
		}

		const newState: EpisodeState = {
			current_episode_index: episodeResult.nextIndex,
			last_request_date: current_date,
			last_time_period: time_period,
			total_episodes_played: currentState.total_episodes_played + 1,
			last_episode_id: episodeResult.episode.id,
			last_episode_title: episodeResult.episode.name,
		};

		await env.EPISODE_TRACKER.put(stateKey, JSON.stringify(newState));

		return new Response(
			JSON.stringify({
				episode_id: episodeResult.episode.id,
				episode_title: episodeResult.episode.name,
				replay: false,
				episode_index: episodeResult.nextIndex,
				description: episodeResult.episode.description,
			}),
			{
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	} catch (error) {
		console.error('Error processing request:', error);
		return new Response(
			JSON.stringify({
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : 'Unknown error',
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	}
}

async function findNextValidEpisode(env: Env, currentIndex: number, timePeriod: string): Promise<EpisodeResult | null> {
	const maxAttempts = 50;
	let attempts = 0;
	let searchIndex = currentIndex;

	while (attempts < maxAttempts) {
		const offset = TOTAL_EPISODES - searchIndex - 1;

		if (offset < 0 || searchIndex >= TOTAL_EPISODES) {
			return null;
		}

		try {
			const episode = await fetchEpisodeAtOffset(env, offset);

			if (!episode) {
				searchIndex++;
				attempts++;
				continue;
			}

			if (BLACKLISTED_EPISODES.includes(episode.id)) {
				searchIndex++;
				attempts++;
				continue;
			}

			const episodeTitle = episode.name.toLowerCase();
			const isValidTimeMatch = checkTimePeriodMatch(episodeTitle, timePeriod);

			if (isValidTimeMatch) {
				return {
					episode: episode,
					nextIndex: searchIndex + 1,
				};
			}

			searchIndex++;
			attempts++;
		} catch (error) {
			console.error(`Error fetching episode at offset ${offset}:`, error);
			searchIndex++;
			attempts++;
		}
	}

	return null;
}

function checkTimePeriodMatch(episodeTitle: string, requestedPeriod: string): boolean {
	const hasNight = episodeTitle.includes('night');
	const hasMorning = episodeTitle.includes('morning');

	if (hasMorning && requestedPeriod === 'pm') {
		return false;
	}

	if (hasNight && requestedPeriod === 'am') {
		return false;
	}

	return true;
}

async function fetchEpisodeAtOffset(env: Env, offset: number): Promise<Episode | null> {
	const spotifyToken = await getSpotifyToken(env);

	const response = await fetch(`https://api.spotify.com/v1/shows/${CHOMPERS_SHOW_ID}/episodes?market=GB&limit=1&offset=${offset}`, {
		headers: {
			Authorization: `Bearer ${spotifyToken}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error(`Spotify API error: ${response.status} - ${response.statusText}`);
	}

	// Type assertion with validation
	const data = (await response.json()) as SpotifyEpisodesResponse;

	// Validate the response structure
	if (!data.items || !Array.isArray(data.items)) {
		throw new Error('Invalid episodes response from Spotify API');
	}

	return data.items.length > 0 ? data.items[0] : null;
}

async function getSpotifyToken(env: Env): Promise<string> {
	const cachedTokenJson = await env.EPISODE_TRACKER.get('spotify_token');
	const cachedToken: SpotifyTokenCache | null = cachedTokenJson ? JSON.parse(cachedTokenJson) : null;

	if (cachedToken && cachedToken.expires_at > Date.now()) {
		return cachedToken.access_token;
	}

	const basicAuth = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);

	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${basicAuth}`,
		},
		body: 'grant_type=client_credentials',
	});

	if (!response.ok) {
		throw new Error(`Failed to get Spotify token: ${response.status}`);
	}

	// Type assertion with validation
	const tokenData = (await response.json()) as SpotifyTokenResponse;

	// Validate the response structure
	if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
		throw new Error('Invalid token response from Spotify API');
	}

	const tokenWithExpiry: SpotifyTokenCache = {
		access_token: tokenData.access_token,
		expires_at: Date.now() + 55 * 60 * 1000,
	};

	await env.EPISODE_TRACKER.put('spotify_token', JSON.stringify(tokenWithExpiry));

	return tokenData.access_token;
}

function btoa(str: string): string {
	return Buffer.from(str).toString('base64');
}
