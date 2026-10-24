/**
 * Agent Grade Guard for Express, Fastify (via middie) or any Node 18+ server that exposes req/res.
 *
 *   import { agentGradeGuard } from 'agent-grade-guard/express';
 *   app.use(agentGradeGuard({ site: 'example.com', key: 'YOUR_SITE_KEY', secret: 'any long random string' }));
 *
 * Put it before your routes and before any static handler. It answers decoy paths and calls next() for everything
 * else. If your app sits behind a proxy, set app.set('trust proxy', true) so req.ip is the visitor.
 */
import { createGuard, kindOf } from './guard-core.js';

export function agentGradeGuard(options) {
  const guard = createGuard(options);
  return async function (req, res, next) {
    const path = (req.originalUrl || req.url || '/').split('?')[0];
    if (!kindOf(path)) return next();
    try {
      const chunks = [];
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.readable) for await (const c of req) chunks.push(c);
      const proto = req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
      const url = `${proto}://${req.headers.host || options.site}${req.originalUrl || req.url}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      const request = new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const out = await guard(request, { ip: req.ip || req.socket?.remoteAddress || '' });
      if (!out) return next();
      res.status(out.status);
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) { next(e); }
  };
}
