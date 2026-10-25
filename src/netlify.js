/**
 * AgentDecoy for any site on Netlify (Bolt, Lovable exports, Vite, React, Astro, plain HTML), as an Edge Function.
 * One file, netlify/edge-functions/agentdecoy.ts:
 *
 *   export { default } from 'agentdecoy/netlify';
 *   export const config = { path: '/*', excludedPath: ['/assets/*', '/_next/static/*', '/*.css', '/*.js', '/*.png', '/*.jpg', '/*.svg', '/*.woff2'] };
 *
 * Then add AGENTDECOY_KEY (your free key) under Site configuration > Environment variables and redeploy.
 * Requests that are not decoy paths go on to your site untouched.
 */
import { lazyGuard, ipOf, withSafeHeaders, safeHeadersOn } from './env.js';

const get = lazyGuard();

export default async function agentdecoy(request, context) {
  const res = await get(request)(request, { ip: (context && context.ip) || ipOf(request.headers), waitUntil: context && typeof context.waitUntil === 'function' ? (p) => context.waitUntil(p) : undefined });
  if (res) return res;
  // Real pages: add the safe security headers (unless AGENTDECOY_HEADERS=off), else let Netlify carry on untouched.
  if (!safeHeadersOn() || !context || typeof context.next !== 'function') return undefined;
  const page = await context.next();
  const headers = withSafeHeaders(new Headers(page.headers));
  return new Response(page.body, { status: page.status, statusText: page.statusText, headers });
}
