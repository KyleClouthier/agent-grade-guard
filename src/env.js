/**
 * Shared by the one-file installs (Next.js, Vercel, Netlify, Firebase): settings come from environment variables, so
 * the install is one file plus one key in the host's settings.
 *
 *   AGENTDECOY_KEY      your free site key (simgen.dev/agentdecoy)      also read: AGENT_GRADE_KEY
 *   AGENTDECOY_SITE     your domain, optional (defaults to the request's host)
 *   AGENTDECOY_SECRET   any long random string, optional (keeps the fakes stable; defaults to the key)
 *   AGENTDECOY_AI_SERVER=on   also act as a fake self-hosted AI server (only if your site has no /api/chat or /v1/ routes)
 */
import { createGuard } from './guard-core.js';

const envOf = () => (typeof process !== 'undefined' && process.env) ? process.env : (globalThis.Netlify && globalThis.Netlify.env ? { get: globalThis.Netlify.env.get } : {});
const read = (env, name) => (typeof env.get === 'function' ? env.get(name) : env[name]) || '';

export function optionsFromEnv(host, overrides = {}) {
  const env = envOf();
  const key = read(env, 'AGENTDECOY_KEY') || read(env, 'AGENT_GRADE_KEY');
  return {
    site: read(env, 'AGENTDECOY_SITE') || read(env, 'AGENT_GRADE_SITE') || host,
    key,
    secret: read(env, 'AGENTDECOY_SECRET') || read(env, 'AGENT_GRADE_SECRET') || key || host,
    aiServer: read(env, 'AGENTDECOY_AI_SERVER') === 'on',
    ...overrides,
  };
}

// One guard per running instance, created on the first request (the host is known then).
export function lazyGuard(overrides) {
  let guard = null;
  return (request) => {
    if (!guard) guard = createGuard(optionsFromEnv(new URL(request.url).hostname, overrides));
    return guard;
  };
}

export const ipOf = (headers) => String(headers.get('x-nf-client-connection-ip') || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || (headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
