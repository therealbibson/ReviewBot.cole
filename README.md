# ReviewBot Celo

**On-chain auditor for AI agents on Celo.** ReviewBot.Celo tests whether an agent is useful, safe, and economically viable before you trust it with your money.

Given a GitHub repository, an optional AskBot API configuration, and a Celo wallet address, it investigates the agent itself, queries real on-chain activity on Celo, and produces a structured audit with:

Any transaction-capable or attribution-sensitive flow in ReviewBot.Celo is expected to carry your assigned Celo attribution tag.

- a trust verdict: useful, safe, economically viable\n- a wallet ownership warning when ownership cannot be verified
- what works
- what is broken
- evidence, including on-chain evidence
- severity
- specific fixes
- a score
- a prioritized improvement plan

This MVP avoids static "just give it a score" behavior by collecting live evidence first, including real Celo RPC lookups, then scoring against a standardized rubric.

## Current MVP capabilities

- indexes a public GitHub repository
- fetches `README.md` and `package.json` when available
- detects basic engineering signals such as tests, CI, Docker, and implementation cues
- probes an AskBot health endpoint and review endpoint if provided
- performs a real on-chain audit of the provided Celo wallet address via JSON-RPC:
  - CELO balance
  - outgoing transaction count
  - whether the address is a smart contract or a plain wallet
- flags agents with no verifiable on-chain track record before recommending trust
- produces both structured JSON and markdown report output, including a trust verdict

## Frontend

ReviewBot.Celo now includes its own built-in frontend served by the same Express app.

Features:
- submit a repo URL, wallet, and notes
- optionally override AskBot API settings in the UI
- view scores, findings, evidence, improvement plan, and markdown report

Open the app at:

```bash
http://localhost:3000
```

## API

### `GET /health`

Returns a simple health payload.

### `POST /review`

Request body:

```json
{
  "repoUrl": "https://github.com/owner/repo",
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "projectName": "My Agent",
  "notes": "Optional context",
  "askBot": {
    "baseUrl": "https://askbots.ai/api",
    "healthPath": "/auth/openclaw",
    "reviewPath": "/projects",
    "method": "GET",
    "authHeader": "Authorization",
    "authToken": "Bearer askbots_your_api_key_here",
    "expectedResponseKeys": ["projects"]
  }
}
```

Response:
- JSON review report
- includes a `markdown` field for rendering a human-readable review
- includes an `attribution` block describing the active Celo attribution tag

You can still use the legacy `askBotUrl` field for a shallow GET probe, but `askBot` is the preferred path for real API verification.

## Environment

Copy `.env.example` to `.env` and provide real values for your AskBot API and assigned Celo attribution tag.

If `CELO_ATTRIBUTION_TAG` is missing, the frontend will still open, but `POST /review` is intentionally disabled until you configure it.

Values that belong in `.env`:
- `ASK_BOT_BASE_URL`
- `ASK_BOT_HEALTH_PATH`
- `ASK_BOT_REVIEW_PATH`
- `ASK_BOT_METHOD`
- `ASK_BOT_AUTH_HEADER`
- `ASK_BOT_AUTH_TOKEN`
- `ASK_BOT_SAMPLE_REQUEST_BODY`
- `ASK_BOT_EXPECTED_RESPONSE_KEYS`
- `CELO_ATTRIBUTION_TAG`
- `CELO_NETWORK`
- optional AskBots bot identity values for future onboarding automation:
  - `ASKBOTS_BOT_NAME`
  - `ASKBOTS_BOT_DESCRIPTION`
  - `ASKBOTS_BOT_COUNTRY`
  - `ASKBOTS_BOT_SKILLS`
  - `ASKBOTS_BOT_CELO_ADDRESS`

Values that should be sent per review request rather than stored globally:
- `repoUrl`
- `projectName`
- `walletAddress`
- project-specific notes

## AskBots defaults from docs

The AskBots docs at `https://askbots.ai/docs` describe:
- base URL: `https://askbots.ai/api`
- registration/status route: `POST /auth/openclaw`
- authenticated requests use `Authorization: Bearer <apiKey>`
- project listing route: `GET /projects`
- project response route: `POST /projects/:id/respond`
- challenge verification route: `POST /projects/:id/verify-challenge`

For this MVP, `.env.example` is prefilled to probe:
- `POST /auth/openclaw` as a lightweight authenticated status check
- `GET /projects` as the default live AskBots reviewer endpoint

Security note from the docs: never send your AskBots API key to any host other than `https://askbots.ai/api/*`.

## Run locally

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000
```

Build:

```bash
npm run build
```

Typecheck:

```bash
npm run check
```

## Important notes on AskBot defaults

The .env and .env.example files contain default AskBot API settings (ASK_BOT_BASE_URL, ASK_BOT_HEALTH_PATH, etc.) for local development and the /health endpoint status flag. **These server-level defaults are no longer injected into per-project reviews.** When a user submits a review without providing their own skBot configuration, the runtime probe is skipped entirely rather than silently checking the server's own AskBot endpoint. This was a bug fix: previously, every audit would hit the same hardcoded openclaw health endpoint regardless of which project was being reviewed.

## Next recommended upgrades

- ~~clone repos into a temp workspace and run real build/test commands~~ (still recommended)
- inspect README claims and verify them against runtime behavior
- ~~add multi-turn AskBot conversation probes~~ (still recommended)
- ~~add real Celo RPC checks for balances, transaction activity, and deployed contracts~~ (done)
- persist reports and evaluation jobs
- add authentication, rate limiting, and async job execution
