# GoodieAI GEO Monitoring System

[简体中文](README.md) | **English**

GoodieAI GEO Monitoring System helps you monitor Generative Engine Optimization (GEO). Track how brands appear, are mentioned, are recommended, and are cited in AI search results and model-generated answers.

## Custom Development and Partnerships

For custom development or partnership inquiries, email [lorin.msg@gmail.com](mailto:lorin.msg@gmail.com).

## Updates

### October 18, 2026: Official DeepSeek Search Integration

- Integrated DeepSeek's standalone Search API. Monitoring searches the web before the configured model generates an answer, covering individual checks, brand project analysis, scheduled monitoring, and streaming previews.
- Search is enabled by default and uses your existing `DEEPSEEK_API_KEY`. You can configure the search toggle, result count, and endpoint. See the [environment variable guide](docs/ENVIRONMENT.md#deepseek-联网监测) (Chinese).
- Only search results actually cited in an answer are recorded as search citations, with source titles and search origin metadata. Fixed metadata loss during deduplication, conflicting citation numbers and link destinations, and Markdown backticks being included in source URLs.
- Sentiment analysis and prompt suggestion generation continue to use chat without search. Search errors fail the monitoring request instead of silently falling back to an answer without web search.
- All 385 backend tests passed. Live integration checks received HTTP 200 from both Search and model endpoints, verifying search results, answer generation, and citation extraction.

## Screenshots

The screenshots show the current Chinese-language interface.

### Brand Project Workspace

![Brand project workspace](docs/images/readme-projects.png)

### Project Visibility Dashboard

![Project visibility dashboard](docs/images/readme-dashboard.png)

### Prompt Library

![Prompt library management](docs/images/readme-prompts.png)

### Sentiment Analysis and Recent Metrics

![Sentiment analysis and recent metrics](docs/images/readme-sentiment.png)

### Citation Sources and URL Details

![Citation sources and URL details](docs/images/readme-sources.png)

## Features

- Create, archive, restore, and delete brand projects.
- Create and schedule GEO monitoring tasks, with execution history.
- Monitor answers across AI platforms, with a current focus on Doubao and DeepSeek.
- Use Doubao web search and extract citation sources.
- Use the official DeepSeek Search API with your existing API key; set `DEEPSEEK_SEARCH_ENABLED=false` to disable search.
- Analyze brand mention rates, Share of Voice, citation rates, and competitor visibility.
- Classify answer sentiment as positive, neutral, or negative, and retain explanations and risk terms.
- Manage prompts, categories, platform selection, and historical results.
- Group citations into brand-owned, competitor-owned, and third-party sources, retaining domains, URLs, platforms, prompt categories, and timestamps.
- Manage user authentication, permissions, membership tiers, and usage quotas.
- Admin tools for users, tasks, memberships, system configuration, and execution records.
- Automatic local SQLite initialization, with external PostgreSQL support for production.

## Analysis

### Sentiment

When an AI answer mentions the tracked brand, the system analyzes its sentiment and displays the result in the project dashboard, recent metrics, and historical records. Results are normalized to positive, neutral, or negative labels to help identify recommendation patterns, risk statements, and changes in brand perception.

### Citation Sources

The system extracts sources from web-grounded answers and model citation metadata, then aggregates them by domain and URL. It distinguishes brand-owned, competitor-owned, third-party, and media sources. The source analysis page shows total citations, answers with citations, source domains, competitor citation gaps, new/lost/retained citation domains, and individual URLs, helping you understand which pages and sources AI answers rely on.

## Use Cases

- Monitor brand visibility in AI search results.
- Analyze GEO, AEO, and AI Search Optimization performance.
- Research competitor visibility in generative search engines.
- Track AI answers, sentiment, and citation sources over time.
- Compare prompt performance, platform differences, and optimization opportunities.

## Architecture

- Frontend: Next.js in `nextjs-frontend/`.
- Backend: Node.js and Express in `backend/`.
- Database: SQLite by default for local use; configure `DATABASE_URL` to use external PostgreSQL in production.
- Deployment: Run frontend and backend separately, or on your own server or a platform that supports persistent Node.js services.
- API access: The frontend can proxy `/api/*` requests to the backend.

## Quick Start

Install dependencies:

```bash
npm install
cd backend && npm install
cd ../nextjs-frontend && npm install
```

From the repository root, create local environment files:

```bash
cp backend/.env.example backend/.env
cp nextjs-frontend/.env.example nextjs-frontend/.env.local
```

Edit `backend/.env` and configure at least:

- `JWT_SECRET`
- `DEFAULT_ADMIN_PASSWORD`
- API keys for the platforms you want to enable, such as `DOUBAO_API_KEY` and `DEEPSEEK_API_KEY`

For production, also configure `ALLOWED_ORIGINS` and supply sensitive settings such as `DATABASE_URL` and AI platform API keys through environment variables.

From the repository root, start both services:

```bash
npm run dev
```

Default addresses:

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:3002`
- Health check: `http://localhost:3002/api/health`

## Common Commands

Run these commands from the repository root:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the backend and Next.js frontend together. |
| `npm run dev:backend` | Start only the backend. |
| `npm run dev:frontend` | Start only the frontend. |
| `npm run build` | Build the Next.js frontend. |
| `npm run lint` | Lint the Next.js frontend. |

Run backend tests:

```bash
cd backend
npm test
```

## Production Deployment

- Deploy the frontend and backend separately, or place both behind a reverse proxy on the same server.
- Run the backend in an environment that supports a persistent Node.js process.
- Use external PostgreSQL, configured through `DATABASE_URL`.
- For same-origin API access, configure `API_BASE_URL` as the backend target for the frontend proxy.

Production backend deployments require a strong random `JWT_SECRET`, an `ALLOWED_ORIGINS` allowlist for your production domains, `DATABASE_URL`, and valid API keys for the platforms you use. Never commit real configuration files, access tokens, database connection strings, or API keys.

See the [deployment and operations guide](docs/DEPLOYMENT.md) (Chinese) for more details.

## Default Account

- `DEFAULT_ADMIN_USERNAME` in `backend/.env` sets the initial administrator username.
- `DEFAULT_ADMIN_PASSWORD` in `backend/.env` sets the initial administrator password.
- Change the default administrator password immediately after production deployment.

Do not disclose production accounts, passwords, JWTs, API keys, database connection strings, or other sensitive information in READMEs, issues, commits, or chat messages.

## Documentation

The detailed guides below are currently available in Chinese:

- [Documentation overview](docs/README.md)
- [API reference](docs/API.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Security hardening](docs/SECURITY.md)
