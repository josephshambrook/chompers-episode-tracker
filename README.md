# Chompers Episode Tracker

A Cloudflare Workers API for tracking and serving episodes from the Chompers podcast. Chompers is a kids' podcast that provides interesting content to listen to while brushing teeth, with guidance on brushing all sides of their teeth. The podcast ceased production in July 2023, so this API aims to continue the habit for kids wanting to continue using the podcast in a consistent way.

## Purpose

This API intelligently manages episode playback by:

- **Sequential Episode Tracking**: Keeps track of which episode should play next across all users
- **Time-Based Filtering**: Automatically skips episodes based on time of day:
  - Morning episodes (containing "morning" in the title) only play during AM requests
  - Night episodes (containing "night" in the title) only play during PM requests
  - Generic episodes (without time indicators) play at any time
- **Episode Blacklisting**: Skips specific episodes like trailers and early bonus episodes
- **Replay Prevention**: Returns the same episode if requested multiple times on the same date and time period
- **Spotify Integration**: Fetches episode metadata from the Spotify API

## How It Works

The API uses Cloudflare's KV storage to maintain state across requests:

1. When a POST request is made to `/next-episode` with a time period (`am` or `pm`) and current date
2. The worker checks if the same time period was already requested today
3. If yes, it returns the same episode (replay mode)
4. If no, it finds the next valid episode that matches the time period
5. It skips blacklisted episodes and episodes that don't match the requested time
6. Episode state and Spotify access tokens are cached in Cloudflare KV

### Key Features

- **Smart Episode Selection**: Searches through up to 50 episodes to find the next valid match
- **Spotify Token Caching**: Caches Spotify access tokens for 55 minutes to reduce API calls
- **CORS Support**: Allows cross-origin requests for web-based clients
- **Error Handling**: Comprehensive error handling with informative responses

## API Endpoint

### POST /next-episode

Request body:

```json
{
	"time_period": "am", // or "pm"
	"current_date": "2025-11-14"
}
```

Response (new episode):

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

Response (replay):

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

## Setup

### Prerequisites

- Node.js (see `.nvmrc` for version)
- npm
- A Cloudflare account
- Spotify API credentials (Client ID and Secret)

### Environment Variables

Create a `.dev.vars` file in the root directory with your Spotify credentials:

```txt
SPOTIFY_CLIENT_ID="your_client_id_here"
SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

For production deployment, set these as secrets in Cloudflare:

```bash
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
```

### Installation

```bash
npm install
```

## Available Scripts

### Development

```bash
npm run dev
# or
npm start
```

Starts the Wrangler development server locally. The API will be available at `http://localhost:8787`.

### Testing

```bash
npm test
```

Runs the test suite using Vitest with Cloudflare Workers test environment.

### Deployment

```bash
npm run deploy
```

Deploys the worker to Cloudflare. Ensure you have:

1. Logged in to Wrangler: `wrangler login`
2. Set up the KV namespace (or use the one in `wrangler.jsonc`)
3. Configured your Spotify secrets

### Type Generation

```bash
npm run types
```

Generates TypeScript type definitions from your Wrangler configuration.

## Configuration

The `wrangler.jsonc` file contains the Cloudflare Workers configuration:

- **KV Namespace**: `EPISODE_TRACKER` - stores episode state and Spotify tokens
- **Compatibility Date**: Set to 2025-06-01
- **Node.js Compatibility**: Enabled for Buffer support

## Constants

Found in `src/const.ts`:

- **TOTAL_EPISODES**: 3565 episodes available
- **CHOMPERS_SHOW_ID**: Spotify show ID for Chompers
- **BLACKLISTED_EPISODES**: Array of episode IDs to skip (trailers and early bonus episodes)

## Architecture

### Main Components

1. **Request Handler** (`src/index.ts`): Main entry point handling POST requests
2. **Episode State Management**: Tracks current position, last request date, and statistics
3. **Episode Finder**: Searches for valid episodes matching time period criteria
4. **Spotify Integration**: Fetches episodes and manages authentication
5. **Time Period Matcher**: Filters episodes based on morning/night keywords

### Storage Schema

**Episode State** (key: `episode_state`):

```typescript
{
  current_episode_index: number,
  current_episode_uri: string,
  last_request_date: string | null,
  last_time_period: string | null,
  total_episodes_played: number,
  last_episode_id: string | null,
  last_episode_title?: string,
  last_episode_duration_ms?: number
}
```

**Spotify Token Cache** (key: `spotify_token`):

```typescript
{
  access_token: string,
  expires_at: number  // Unix timestamp in milliseconds
}
```

## Episode Selection Algorithm

The worker searches for episodes from the beginning of the podcast, working forward:

1. Calculates offset from the end of the episode list (episodes are reversed in Spotify API)
2. Fetches episode at current index
3. Checks if episode is blacklisted - if yes, skip to next
4. Checks if episode matches time period:
   - Episodes with "morning" in title only match "am" requests
   - Episodes with "night" in title only match "pm" requests
   - Episodes without time indicators match any request
5. If valid, returns episode and increments index
6. If not valid, tries next episode (up to 50 attempts)

## Technologies

- **Cloudflare Workers**: Serverless edge computing platform
- **Cloudflare KV**: Key-value storage for state persistence
- **TypeScript**: Type-safe development
- **Vitest**: Fast unit testing framework
- **Spotify Web API**: Episode metadata and content
- **Wrangler**: Cloudflare Workers CLI tool

## License

Private project
