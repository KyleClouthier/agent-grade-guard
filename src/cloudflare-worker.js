/**
 * Agent Grade Guard as a Cloudflare Worker. Put it in front of any site on Cloudflare: decoy paths are answered by the
 * worker, everything else goes to your origin untouched.
 *
 *   wrangler.toml:  routes = [{ pattern = "example.com/*", zone_name = "example.com" }]
 *   wrangler secret put GUARD_KEY      (your Agent Grade site key, from simgen.dev/agent-grade/account or /guard)
 *   wrangler secret put GUARD_SECRET   (any long random string; keeps the fakes stable per visitor per day)
 *   [vars] SITE = "example.com"
 *
 * Cloudflare's own verified-bot category (Googlebot, Bingbot, OpenAI, Perplexity and others) is honoured first, so
 * verified crawlers never see a decoy; the rest fall back to reverse DNS over DNS-over-HTTPS and the published
 * OpenAI and Perplexity address lists.
 */
import { createGuard } from './guard-core.js';

let guard = null;
export default {
  async fetch(request, env, ctx) {
    if (!guard) guard = createGuard({ site: env.SITE, key: env.GUARD_KEY, secret: env.GUARD_SECRET || env.GUARD_KEY, aiNote: env.AI_NOTE !== 'off', directory: env.DIRECTORY === 'on', blockKnown: env.BLOCK_KNOWN === 'on' });
    const verified = request.cf && request.cf.verifiedBotCategory ? String(request.cf.verifiedBotCategory) : '';
    const res = await guard(request, {
      ip: request.headers.get('cf-connecting-ip'),
      verifiedBot: verified && !/^(other|unknown)$/i.test(verified) ? verified : '',
      waitUntil: (p) => ctx.waitUntil(p),
    });
    return res || fetch(request);
  },
};
