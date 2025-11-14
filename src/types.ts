export interface Episode {
	id: string;
	name: string;
	description: string;
	uri: string;
	duration_ms: number;
}

export interface EpisodeState {
	current_episode_index: number;
	current_episode_uri: string;
	last_request_date: string | null;
	last_time_period: string | null;
	total_episodes_played: number;
	last_episode_id: string | null;
	last_episode_title?: string;
	last_episode_duration_ms?: number;
}

export interface EpisodeResult {
	episode: Episode;
	nextIndex: number;
}

export interface SpotifyTokenCache {
	access_token: string;
	expires_at: number;
}

export interface RequestBody {
	time_period: string;
	current_date: string;
}

export interface SpotifyTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

export interface SpotifyEpisodesResponse {
	items: Episode[];
	total: number;
	limit: number;
	offset: number;
	next: string | null;
	previous: string | null;
}
