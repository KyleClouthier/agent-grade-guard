/**
 * AgentDecoy for Next.js (13 to 16, app or pages router, on Vercel, Firebase App Hosting, Netlify or your own server).
 * One file at your project root (next to package.json, or in src/ if you use a src folder):
 *
 *   Next.js 15 and earlier, middleware.ts:      export { middleware } from 'agentdecoy/next';
 *   Next.js 16, proxy.ts:                       export { proxy } from 'agentdecoy/next';
 *
 * Then add AGENTDECOY_KEY (your free key) in your host's environment variables. Already have a middleware? Call
 * agentDecoy() first and fall through to yours when it returns undefined (see the README).
 * Every request that is not a decoy path passes straight through.
 */
import { lazyGuard, ipOf, withSafeHeaders, safeHeadersOn } from './env.js';

// The header Next.js itself uses to mean "carry on to the page" (what NextResponse.next() returns), so this file has
// no import from next/server and works the same in middleware.ts and proxy.ts.
const carryOn = () => new Response(null, { headers: withSafeHeaders(new Headers({ 'x-middleware-next': '1' })) });

export function agentDecoy(overrides) {
  const get = lazyGuard(overrides);
  // Returns the decoy's Response, or undefined when the request is not for a decoy.
  return async function check(request, event) {
    const res = await get(request)(request, { ip: ipOf(request.headers), waitUntil: event && typeof event.waitUntil === 'function' ? (p) => event.waitUntil(p) : undefined });
    return res || undefined;
  };
}

const check = agentDecoy();
export async function middleware(request, event) { return (await check(request, event)) || carryOn(); }
export const proxy = middleware;
export default middleware;
