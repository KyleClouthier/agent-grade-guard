# Agent Grade Guard (JavaScript)

Decoys that catch attack bots and AI agents on your site, for Cloudflare Workers, Next.js and Express. The WordPress version is a [plugin](https://simgen.dev/agent-grade/guard/).

Attack bots ask for files no person ever opens: `.env`, `.git/config`, `.aws/credentials`, `backup.zip`. Guard answers those requests with believable fakes and reports who asked to your [Agent Grade](https://simgen.dev/agent-grade/) account. The fakes carry their own tripwires: a fake API key, a fake AI key, a webhook and an admin password that all report back the moment someone uses them, a note only AI agents read, fake API documentation and a fake MCP server for agents that read first and act second, and a fake admin login that records how the visitor behaves.

Verified search engines and AI search bots (Google, Bing, Apple, DuckDuckGo, Yandex, Amazon, OpenAI, Perplexity) get a plain 404 and are never blocked. On Cloudflare the platform's verified-bot category is honoured first. Nothing here holds anything real, and nothing is ever refused.

## Get a site key

Free: https://simgen.dev/agent-grade/guard/ (one email a month with what the decoys caught). Pro and Agency keys are on your account page and feed the weekly report.

## Cloudflare Worker (any site on Cloudflare)

```
git clone https://github.com/KyleClouthier/agent-grade-guard
cd agent-grade-guard
cp wrangler.toml.example wrangler.toml      # set SITE and the routes
npx wrangler secret put GUARD_KEY
npx wrangler secret put GUARD_SECRET
npx wrangler deploy
```

Then open `https://yoursite.com/.env`: you should see a fake file, and the visit appears in your Agent Grade account.

## Next.js

Copy `src/guard-core.js` and `src/next-middleware.ts` into your project (the middleware file goes at the project root as `middleware.ts`, or merge it into yours). Set:

```
AGENT_GRADE_SITE=example.com
AGENT_GRADE_KEY=your site key
AGENT_GRADE_SECRET=any long random string
```

Only the decoy paths listed in `config.matcher` run through the guard.

## Express and other Node servers

```js
import { agentGradeGuard } from 'agent-grade-guard/express';
app.set('trust proxy', true);
app.use(agentGradeGuard({ site: 'example.com', key: process.env.AGENT_GRADE_KEY, secret: process.env.AGENT_GRADE_SECRET }));
```

## Anything else with a fetch handler (Deno, Bun, Vercel and Netlify edge functions)

```js
import { createGuard } from './src/guard-core.js';
const guard = createGuard({ site: 'example.com', key: KEY, secret: SECRET });
export default async (request, ctx) => (await guard(request, { ip: ..., waitUntil: ctx?.waitUntil })) || yourHandler(request);
```

## What is sent to Agent Grade

For each catch: the address, browser string, path, method, time and which decoy was tripped. Requests sent with a decoy key to the decoy AI endpoint also include the model name and the first 1,000 characters of the text sent. Nothing about ordinary visitors. Records are deleted after 90 days. Privacy: https://simgen.dev/privacy/

## robots.txt

Add the decoy paths so well-behaved crawlers never visit them:

```
User-agent: *
Disallow: /trail/
Disallow: /llm/
Disallow: /api/
Disallow: /openapi.json
Disallow: /swagger.json
Disallow: /mcp
Disallow: /.well-known/mcp.json
Disallow: /backup.zip
Disallow: /site-backup.zip
Disallow: /www.zip
Disallow: /backups/
Disallow: /*.env
Disallow: /*.git/
Disallow: /*.aws/
Disallow: /*wp-config.php
Disallow: /phpinfo.php
Disallow: /info.php
Disallow: /*.sql$
Disallow: /admin
Disallow: /administrator
```

Built by [Kyle Clouthier](https://simgen.dev/), Clouthier Simulation Labs. MIT licence.
