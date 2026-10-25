/**
 * AgentDecoy Guard for Express, Fastify (via middie) or any Node 18+ server that exposes req/res.
 *
 *   import { agentGradeGuard } from 'agentdecoy/express';
 *   app.use(agentGradeGuard({ site: 'example.com', key: 'YOUR_SITE_KEY', secret: 'any long random string' }));
 *
 * Put it before your routes and before any static handler. It answers decoy paths and calls next() for everything
 * else. If your app sits behind a proxy, set app.set('trust proxy', true) so req.ip is the visitor.
 */
import { createGuard, kindOf, SAFE_HEADERS, LOGINISH } from './guard-core.js';

export function agentGradeGuard(options) {
  const guard = createGuard(options);
  return async function (req, res, next) {
    const path = (req.originalUrl || req.url || '/').split('?')[0];
    // Optional security headers (headers: true); a header the app sets later still wins.
    if (options.headers === true && typeof res.getHeader === 'function') for (const [k, v] of Object.entries(SAFE_HEADERS)) if (!res.getHeader(k)) res.setHeader(k, v);
    const decoy = !!kindOf(path, { aiServer: !!options.aiServer });
    const reading = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    // Real pages that only read go straight on. Real form posts and logins still pass the network block (2.3.0),
    // but their body is never touched, so the app's own body parser gets it intact.
    if (!decoy && reading && !LOGINISH.test(path)) return next();
    try {
      const chunks = [];
      if (decoy) {
        // Firebase Functions (and some body parsers) have already read the body: use their raw copy.
        if (req.rawBody && req.rawBody.length) chunks.push(Buffer.from(req.rawBody));
        else if (!reading && req.readable) for await (const c of req) chunks.push(c);
      }
      const proto = req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
      const url = `${proto}://${req.headers.host || options.site}${req.originalUrl || req.url}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      const request = new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      // The report to AgentDecoy is sent before the answer: Cloud Functions, Cloud Run and other serverless hosts
      // freeze the CPU once a response is sent, so a report left running in the background never arrives.
      const pending = [];
      const out = await guard(request, { ip: req.ip || req.socket?.remoteAddress || '', waitUntil: (p) => pending.push(p) });
      if (!out) return next();
      const body = Buffer.from(await out.arrayBuffer());
      await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, 3000))]);
      res.status(out.status);
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(body);
    } catch (e) { next(e); }
  };
}
