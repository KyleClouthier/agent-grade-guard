# AgentDecoy

**Security for the AI-agent era: decoys that catch hostile AI agents, and a shared network that locks them out.**

![AgentDecoy: scan, catch, identify, shut out](https://raw.githubusercontent.com/KyleClouthier/agentdecoy/main/docs/agentdecoy-how-it-works.png)

Hackers now send AI agents to break into websites. An agent asks thousands of sites for the same files, copies any key it finds, tries it, and keeps going while its owner sleeps. On October 24, 2026 one took a decoy AWS key from our own site and used it to try for admin rights 2 hours 39 minutes later. It never got near anything real, and the address was then locked out of every protected site.

That is what this package does for your site. It plants decoys that look exactly like what those agents hunt for, catches them in the act, tells you who they were and how far they got, and shares every catch across the network so an attacker caught once is shut out everywhere. Your real visitors, Google and ChatGPT never see a thing.

```
npm install agentdecoy
```

Free. One file on almost any host: Next.js, Vercel (any framework), Netlify, Firebase, Cloudflare and any Node server. The WordPress version is a [plugin](https://simgen.dev/agentdecoy/guard/). Formerly `agent-grade-guard`.

## Install in one step

In your project folder:

```
npm install agentdecoy
npx agentdecoy init
```

`init` looks at your project and adds the one file it needs (it never overwrites yours). Then add your free key as `AGENTDECOY_KEY` in your host's environment variables and redeploy. Or add the file yourself:

| Your site | The one file | What goes in it |
|---|---|---|
| Next.js 15 or earlier (v0, Cursor, Bolt) | `middleware.ts` at the root (or in `src/`) | `export { middleware } from 'agentdecoy/next';` |
| Next.js 16 | `proxy.ts` at the root (or in `src/`) | `export { proxy } from 'agentdecoy/next';` |
| Any other framework on Vercel (Vite, React, Astro, SvelteKit) | `middleware.ts` at the root | `export { default } from 'agentdecoy/vercel';` |
| Netlify (Bolt, Lovable exports, Vite) | `netlify/edge-functions/agentdecoy.ts` | `export { default } from 'agentdecoy/netlify';` plus `export const config = { path: '/*' };` |
| Firebase Hosting | a function and rewrites | run `npx agentdecoy init` (needs the Blaze plan) |
| Express, Replit, Render, Railway, Fly | your server file | `app.use(agentGradeGuard({ site, key: process.env.AGENTDECOY_KEY }))` from `agentdecoy/express` |
| Shopify, Wix, Squarespace on Cloudflare | a Cloudflare Worker | see below |

**Built with an AI builder?** Paste this into Lovable, Bolt, v0, Cursor or Replit:

> Add the AgentDecoy decoys to this project: run `npm install agentdecoy`, then `npx agentdecoy init`, and follow what it prints. If you cannot run commands, add the one file from the table at https://www.npmjs.com/package/agentdecoy for this project's host. The key goes in an environment variable named AGENTDECOY_KEY; ask me for it. Do not change anything else.

Already have a middleware? `import { agentDecoy } from 'agentdecoy/next'`, call `await agentDecoy()(request, event)` first and return its response when it is not undefined.

Optional: `AGENTDECOY_AI_SERVER=on` also turns the site into a fake self-hosted AI server (Ollama's `/api/tags` and `/api/generate`, OpenAI-style `/v1/`), which AI-key thieves scan for. Leave it off if your site has its own `/api/chat` or `/v1/` routes.

**Not sure if you are exposed?** The [free scan](https://simgen.dev/agentdecoy/) shows the ways in a hostile agent would use today. A real result from one of my own sites:

<img src="https://raw.githubusercontent.com/KyleClouthier/agentdecoy/main/docs/scan-result.png" alt="AgentDecoy scan result: threat level Elevated, 2 ways in for a hostile AI agent" width="520">

## What it catches

Attack bots ask for files no person ever opens: `.env`, `.git/config`, `.aws/credentials`, `backup.zip`. Guard answers those requests with believable fakes and reports who asked to your [AgentDecoy](https://simgen.dev/agentdecoy/) account. The fakes carry their own tripwires: a fake API key, a fake AI key, a webhook and an admin password that all report back the moment someone uses them, a note only AI agents read, fake API documentation and a fake MCP server for agents that read first and act second, and a fake admin login that records how the form was filled.

**Crowdsourced:** every site that joins makes every other site safer and smarter. An address that uses a stolen secret on one Guard site (or a stolen decoy cloud key anywhere) is refused on logins and forms across all of them within the hour (blockKnown).

Verified search engines and crawlers (Google, Bing, Apple, DuckDuckGo, Yandex, Amazon, OpenAI, Perplexity) get a plain 404 and are never blocked. On Cloudflare the platform's verified-bot category is honoured first. Nothing here holds anything real, and ordinary page views are never refused.

## Get a site key

Free: https://simgen.dev/agentdecoy/guard/ (one email a month with what the decoys caught). Pro and Agency keys are on your account page and feed the weekly report.

## Cloudflare Worker (any site on Cloudflare: Shopify, Wix, Squarespace, WordPress, anything)

If your domain runs through Cloudflare, this protects it whatever the site is built with.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KyleClouthier/agentdecoy)

1. Press the button and sign in to Cloudflare. Set SITE to your domain, GUARD_KEY to your site key (free at https://simgen.dev/agentdecoy/guard/) and GUARD_SECRET to any long random string.
2. In Cloudflare: Workers & Pages, agentdecoy, Settings, Domains & Routes, Add route: `yoursite.com/*` (and `www.yoursite.com/*`).
3. Open `https://yoursite.com/.env`: you should see a fake file, and the visit appears in your AgentDecoy account.

Or from a clone:

```
git clone https://github.com/KyleClouthier/agentdecoy
cd agentdecoy
# set SITE in wrangler.jsonc
npx wrangler secret put GUARD_KEY
npx wrangler secret put GUARD_SECRET
npx wrangler deploy
```

Set DIRECTORY to on to list your site in the [verified directory](https://simgen.dev/agentdecoy/verified/): the worker serves the ownership token at /.well-known/agent-grade.txt and AgentDecoy checks it once a day.

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
npm install agentdecoy
```

[npm](https://www.npmjs.com/package/agentdecoy). Or copy the two files you need from `src/`.

## Express and other Node servers

```js
import { agentGradeGuard } from 'agentdecoy/express';
app.set('trust proxy', true);
app.use(agentGradeGuard({ site: 'example.com', key: process.env.AGENT_GRADE_KEY, secret: process.env.AGENT_GRADE_SECRET }));
```

## Anything else with a fetch handler (Deno, Bun, Vercel and Netlify edge functions)

```js
import { createGuard } from 'agentdecoy';
const guard = createGuard({ site: 'example.com', key: KEY, secret: SECRET });
export default async (request, ctx) => (await guard(request, { ip: ..., waitUntil: ctx?.waitUntil })) || yourHandler(request);
```

## flag.txt and the agent guest book

A viral idea in October 2026: put a flag.txt in your site root that tells a breaking-in AI agent it passed the eval and should leave. Guard ships the measured version. /flag.txt (and /flag, /.flag, /flag.md) tells the agent the evaluation is over and asks it to report in with its name and model, sign a guest book, and disconnect. Every read and every check-in is counted, so you see which agents obey. Nobody has shown the trick works on every agent; this is how you find out.

## What every catch is labelled with

AgentDecoy sorts each catch so your report says what it was and how far it got:

- **Script, browser or AI agent.** An AI agent read the note only AI sees, spoke to the fake MCP server, signed its requests as an agent, or drove the fake login like a model: filled by program (no key presses, clicks with no mouse movement before them) and paused between steps to think. A plain script does the same in under a second. Phones are never flagged for having no mouse.
- **How sure.** Confirmed (followed the AI-only note at machine speed, or proved who it is with a valid Web Bot Auth signature), likely, or possible.
- **How far it got.** Looked, took a secret, used a secret, tried to take over.
- **Where from.** The network that owns the address (most attackers rent cloud servers) and, for anyone who used a secret, the abuse contact of that network, so you can report it.
- **Attack strings.** SQL injection, path traversal, XSS, template and command injection in the request.

Agents that sign their requests with Web Bot Auth and whose signature checks out against their operator's published keys are treated like verified crawlers: a plain 404, never a fake.

## Updates without updating

Guard fetches its decoy definitions from AgentDecoy every 12 hours (GET https://simgen.dev/api/agent-guard?config=1): the flag.txt text, the AI note, new text decoys, an off switch per decoy, your plan's features and the latest version. New protections reach your site without a new release. If the config cannot be fetched, the built-in copy is used and nothing breaks. Pass remoteConfig: false to createGuard to turn this off. When a newer package is out, Guard logs one warning; install it with npm install agentdecoy@latest.

## The network

Every Guard site feeds one shared store, and the value flows back: your reports say which of this week's attackers also hit other Guard sites and since when, and every catch is sorted as a script, a browser or an AI agent. With your key you can also fetch the shared known-attacker list (addresses that used a stolen secret or the fake admin password on any Guard site in the last 14 days; never a plain file request):

```
GET https://simgen.dev/api/agent-guard?key=YOUR_KEY&list=1      -> { list: ["203.0.113.5", ...] }
GET https://simgen.dev/api/agent-guard?key=YOUR_KEY&intel=ip1,ip2 -> where those addresses were seen elsewhere
```

Guard does this for you by default (since 2.3.0): listed addresses get a 403 on logins, sign-ups, checkouts and any form post, while they can still read your pages. The list is refreshed hourly. Ordinary page views are never blocked, and verified search and AI crawlers are never on the list. To turn it off: blockKnown: false (one-file installs: AGENTDECOY_BLOCK=off; Cloudflare: BLOCK_KNOWN = "off"; Next.js template: AGENT_GRADE_BLOCK_KNOWN=off).

## Optional security headers

Off by default since 2.3.0, so Guard never changes how your real pages behave. To add nosniff, a frame guard and a referrer policy to real pages (never a Content-Security-Policy, and never over a header your site already sets): AGENTDECOY_HEADERS=on for the one-file installs, or headers: true in Express.

The totals are public in the [Agent Attack Index](https://simgen.dev/agentdecoy/attack-index/).

## What is sent to AgentDecoy

For each catch: the address, browser string, path, method, time and which decoy was tripped. On the fake admin login, counts and timings of how the form was filled (mouse moves, key presses, clicks, time on the page, whether the browser reports automation); never what was typed and never which keys. Requests sent with a decoy key to the decoy AI endpoint also include the model name and the first 1,000 characters of the text sent. Nothing about ordinary visitors. Records are deleted after 90 days. Privacy: https://simgen.dev/privacy/

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
