# Chompers Episode Tracker

A Cloudflare Workers API for tracking and serving episodes from the [Chompers](https://open.spotify.com/show/21ASCcEXgUlbFSmoqjroZm) podcast. Chompers is a kids' podcast that guides children through brushing their teeth with fun themed episodes. The podcast stopped production in July 2023, so this API picks up where it left off — keeping the habit going by serving episodes sequentially, one per brushing session.

**Fully free to run.** This uses Cloudflare Workers and KV on the free tier, and the Spotify API with no premium account required.

## What It Does

- Tracks which episode is up next across all requests (sequential playback)
- Filters by time of day: morning episodes for AM, night episodes for PM, generic episodes for either
- Skips blacklisted episodes (trailers, bonus episodes)
- Returns the same episode if requested more than once on the same date and time period (replay protection)
- Caches Spotify access tokens in KV to minimise API calls

## API

### `POST /next-episode`

**Request body:**
```json
{
  "time_period": "am",
  "current_date": "2025-11-14"
}
```

`time_period` must be `"am"` or `"pm"`.

**Response (new episode):**
```json
{
  "episode_id": "abc123",
  "episode_title": "Fun Facts About Sharks",
  "episode_uri": "spotify:episode:abc123",
  "replay": false,
  "episode_index": 42,
  "description": "Learn about sharks while you brush!",
  "duration_ms": 120000
}
```

**Response (same session replay):**
```json
{
  "episode_id": "abc123",
  "episode_uri": "spotify:episode:abc123",
  "episode_title": "Fun Facts About Sharks",
  "replay": true,
  "episode_index": 42,
  "duration_ms": 120000
}
```

## Deploying Your Own Instance

Everything here runs on the free tier — no credit card needed.

### 1. Cloudflare account

Sign up at [cloudflare.com](https://cloudflare.com) if you don't have an account. The Workers and KV free tiers are generous enough for personal use.

### 2. Spotify API credentials

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app (name and description don't matter)
3. Note your **Client ID** and **Client Secret**

### 3. Clone and install

```bash
git clone https://github.com/yourusername/chompers-episode-tracker.git
cd chompers-episode-tracker
npm install
```

### 4. Create a KV namespace

```bash
npx wrangler kv namespace create EPISODE_TRACKER
```

This prints an ID — paste it into `wrangler.jsonc` replacing the existing `id` value.

### 5. Set up local credentials

Copy `.dev.vars.example` to `.dev.vars` and fill in your Spotify credentials:

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars`:
```
SPOTIFY_CLIENT_ID="your_client_id_here"
SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

### 6. Deploy

```bash
npx wrangler login
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npm run deploy
```

That's it. Your worker URL will be printed at the end.

## Local Development

```bash
npm run dev
```

API available at `http://localhost:8787`.

```bash
npm test
```

## Configuration

Constants in [`src/const.ts`](src/const.ts):

- `CHOMPERS_SHOW_ID` — Spotify show ID (no need to change this)
- `TOTAL_EPISODES` — total episode count; update if you want to limit playback range
- `BLACKLISTED_EPISODES` — episode IDs to skip; add any you want to exclude

## Tech

- [Cloudflare Workers](https://workers.cloudflare.com/) — serverless edge runtime
- [Cloudflare KV](https://developers.cloudflare.com/kv/) — persistent state storage
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — episode metadata
- TypeScript, Vitest, Wrangler

## License

MIT
