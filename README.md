# Agent Grade Guard (JavaScript)

Decoys that catch attack bots and AI agents on your site, for Cloudflare Workers, Next.js and Express. The WordPress version is a [plugin](https://simgen.dev/agent-grade/guard/).

Attack bots ask for files no person ever opens: `.env`, `.git/config`, `.aws/credentials`, `backup.zip`. Guard answers those requests with believable fakes and reports who asked to your [Agent Grade](https://simgen.dev/agent-grade/) account. The fakes carry their own tripwires: a fake API key, a fake AI key, a webhook and an admin password that all report back the moment someone uses them, a note only AI agents read, fake API documentation and a fake MCP server for agents that read first and act second, and a fake admin login that records how the visitor behaves.

**Crowdsourced:** every site that joins makes every other site safer and smarter. An address that uses a stolen secret on one Guard site (or a stolen decoy cloud key anywhere) is refused on logins and forms across all of them within the hour (blockKnown), and what the network learns about AI search goes into every Agent Grade report.

Verified search engines and AI search bots (Google, Bing, Apple, DuckDuckGo, Yandex, Amazon, OpenAI, Perplexity) get a plain 404 and are never blocked. On Cloudflare the platform's verified-bot category is honoured first. Nothing here holds anything real, and nothing is ever refused.

## Get a site key

Free: https://simgen.dev/agent-grade/guard/ (one email a month with what the decoys caught). Pro and Agency keys are on your account page and feed the weekly report.

## Cloudflare Worker (any site on Cloudflare: Shopify, Wix, Squarespace, WordPress, anything)

If your domain runs through Cloudflare, this protects it whatever the site is built with.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KyleClouthier/agent-grade-guard)

1. Press the button and sign in to Cloudflare. Set SITE to your domain, GUARD_KEY to your site key (free at https://simgen.dev/agent-grade/guard/) and GUARD_SECRET to any long random string.
2. In Cloudflare: Workers & Pages, agent-grade-guard, Settings, Domains & Routes, Add route: `yoursite.com/*` (and `www.yoursite.com/*`).
3. Open `https://yoursite.com/.env`: you should see a fake file, and the visit appears in your Agent Grade account.

Or from a clone:

```
git clone https://github.com/KyleClouthier/agent-grade-guard
cd agent-grade-guard
# set SITE in wrangler.jsonc
npx wrangler secret put GUARD_KEY
npx wrangler secret put GUARD_SECRET
npx wrangler deploy
```

Set DIRECTORY to on to list your site in the [verified directory](https://simgen.dev/agent-grade/verified/): the worker serves the ownership token at /.well-known/agent-grade.txt and Agent Grade checks it once a day.

## Next.js

Copy `src/guard-core.js` and `src/next-middleware.ts` into your project (the middleware file goes at the project root as `middleware.ts`, or merge it into yours). Set:

```
AGENT_GRADE_SITE=example.com
AGENT_GRADE_KEY=your site key
AGENT_GRADE_SECRET=any long random string
AGENT_GRADE_DIRECTORY=on      # optional: list the site in the verified directory
```

Only the decoy paths listed in `config.matcher` run through the guard.

## Install

```
npm install agent-grade-guard
```

[npm](https://www.npmjs.com/package/agent-grade-guard). Or copy the two files you need from `src/`.

## Express and other Node servers

```js
import { agentGradeGuard } from 'agent-grade-guard/express';
app.set('trust proxy', true);
app.use(agentGradeGuard({ site: 'example.com', key: process.env.AGENT_GRADE_KEY, secret: process.env.AGENT_GRADE_SECRET }));
```

## Anything else with a fetch handler (Deno, Bun, Vercel and Netlify edge functions)

```js
import { createGuard } from 'agent-grade-guard';
const guard = createGuard({ site: 'example.com', key: KEY, secret: SECRET });
export default async (request, ctx) => (await guard(request, { ip: ..., waitUntil: ctx?.waitUntil })) || yourHandler(request);
```

## flag.txt and the agent guest book

A viral idea in October 2026: put a flag.txt in your site root that tells a breaking-in AI agent it passed the eval and should leave. Guard ships the measured version. /flag.txt (and /flag, /.flag, /flag.md) tells the agent the evaluation is over and asks it to report in with its name and model, sign a guest book, and disconnect. Every read and every check-in is counted, so you see which agents obey. Nobody has shown the trick works on every agent; this is how you find out.

## Updates without updating

Guard fetches its decoy definitions from Agent Grade every 12 hours (GET https://simgen.dev/api/agent-guard?config=1): the flag.txt text, the AI note, new text decoys, an off switch per decoy, your plan's features and the latest version. New protections reach your site without a new release. If the config cannot be fetched, the built-in copy is used and nothing breaks. Pass remoteConfig: false to createGuard to turn this off. When a newer package is out, Guard logs one warning; install it with npm install agent-grade-guard@latest.

## The network

Every Guard site feeds one shared store, and the value flows back: your reports say which of this week's attackers also hit other Guard sites and since when, and every catch is sorted as a script, a browser or an AI agent. With your key you can also fetch the shared known-attacker list (addresses that used a stolen secret or the fake admin password on any Guard site in the last 14 days; never a plain file request):

```
GET https://simgen.dev/api/agent-guard?key=YOUR_KEY&list=1      -> { list: ["203.0.113.5", ...] }
GET https://simgen.dev/api/agent-guard?key=YOUR_KEY&intel=ip1,ip2 -> where those addresses were seen elsewhere
```

Or let Guard do it: set blockKnown: true (Cloudflare: BLOCK_KNOWN = "on"; Next.js: AGENT_GRADE_BLOCK_KNOWN=on) and listed addresses get a 403 on logins, sign-ups, checkouts and any form post, while they can still read your pages. The list is refreshed hourly. Use it to refuse logins or form posts from listed addresses yourself if you prefer. Never apply it to ordinary page views: verified search and AI crawlers are never on it, but a blanket block is still the wrong tool.

The totals are public in the [Agent Attack Index](https://simgen.dev/agent-grade/attack-index/).

## What is sent to Agent Grade

For each catch: the address, browser string, path, method, time and which decoy was tripped. Requests sent with a decoy key to the decoy AI endpoint also include the model name and the first 1,000 characters of the text sent. Nothing about ordinary visitors. Records are deleted after 90 days. Privacy: https://simgen.dev/privacy/

## robots.txt

Add the decoy paths so well-behaved crawlers never visit them:

```
User-agent: *
Disallow: /trail/
Disallow: /flag.txt
Disallow: /flag
Disallow: /.flag
Disallow: /flag.md
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
