/**
 * AgentDecoy for any site on Vercel (Vite, React, Astro, SvelteKit, Nuxt, plain HTML: any framework), using Vercel
 * Routing Middleware. One file, middleware.ts (or .js) at your project root:
 *
 *   export { default } from 'agentdecoy/vercel';
 *
 * Then add AGENTDECOY_KEY (your free key) under Project Settings > Environment Variables and redeploy.
 * (Next.js sites: use agentdecoy/next instead.) Every request that is not a decoy path passes straight through.
 */
import { lazyGuard, ipOf, withSafeHeaders, safeHeadersOn } from './env.js';

const get = lazyGuard();
// Vercel's own "continue" signal (what next() from @vercel/functions returns), so there is nothing else to install.
const carryOn = () => new Response(null, { headers: withSafeHeaders(new Headers({ 'x-middleware-next': '1' })) });

export default async function middleware(request, context) {
  const res = await get(request)(request, { ip: ipOf(request.headers), waitUntil: context && typeof context.waitUntil === 'function' ? (p) => context.waitUntil(p) : undefined });
  return res || carryOn();
}
