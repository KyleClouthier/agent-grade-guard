// Tests for the one-file installs (Next.js, Vercel, Netlify, Firebase) and npx agentdecoy init. No network: fetch is
// stubbed. Run with Node 18+: node test/test-installs.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let pass = 0, fail = 0;
const ok = (c, n, i = '') => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i); } };
const reports = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes('simgen.dev/api/agent-guard?')) return new Response('', { status: 503 });
  if (String(url).includes('simgen.dev/api/agent-guard')) { reports.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 }); }
  if (String(url).includes('cloudflare-dns.com')) return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
  return new Response('', { status: 404 });
};
process.env.AGENTDECOY_KEY = 'k'.repeat(32);
process.env.AGENTDECOY_SECRET = 'test';

const req = (p, init = {}) => new Request('https://shop.example.com' + p, { headers: { 'user-agent': 'curl/8', 'x-forwarded-for': '203.0.113.7' }, ...init });

(async () => {
  const next = await import('../src/next.js');
  const page = await next.middleware(req('/pricing'), { waitUntil() {} });
  ok(page.headers.get('x-middleware-next') === '1', 'Next.js: real page carries on');
  const env = await next.middleware(req('/.env'), { waitUntil() {} });
  ok(env.status === 200 && /OPENAI_API_KEY|AWS|DB_/.test(await env.text()), 'Next.js: decoy answered');
  ok(next.proxy === next.middleware && typeof next.agentDecoy === 'function', 'Next.js 16 proxy export and agentDecoy() for existing middleware');
  const own = next.agentDecoy();
  ok((await own(req('/about'))) === undefined && (await own(req('/wp-login.php'))).status === 200, 'agentDecoy() returns undefined for real pages');
  ok(reports.some((r) => r.site === 'shop.example.com' && r.ip === '203.0.113.7'), 'site from the request host, ip from the forwarding header');

  const vercel = (await import('../src/vercel.js')).default;
  ok((await vercel(req('/'), {})).headers.get('x-middleware-next') === '1' && (await vercel(req('/.git/config'), {})).status === 200, 'Vercel: carries on, answers decoys');

  const netlify = (await import('../src/netlify.js')).default;
  ok((await netlify(req('/blog'), { ip: '198.51.100.4' })) === undefined, 'Netlify: real page returns undefined (site continues)');
  const nd = await netlify(req('/openhands'), { ip: '198.51.100.4' });
  ok(nd.status === 200 && reports.some((r) => r.ip === '198.51.100.4' && r.kind === 'agent_panel'), 'Netlify: decoy answered with context.ip');

  const fb = await import('../src/firebase.js');
  ok(fb.FIREBASE_PATHS.includes('**/.env') && fb.FIREBASE_PATHS.includes('/mcp') && fb.FIREBASE_PATHS.includes('/openhands'), 'Firebase: rewrite paths');
  const h = fb.handler();
  const out = { status: 0, headers: {}, body: null };
  const res = { status(s) { out.status = s; return this; }, setHeader(k, v) { out.headers[k] = v; }, end(b) { out.body = b; }, send(b) { out.body = b; } };
  await h({ method: 'GET', url: '/wp-admin/', originalUrl: '/wp-admin/', headers: { host: 'shop.example.com', 'user-agent': 'curl/8' }, ip: '192.0.2.9', socket: {} }, res);
  ok(out.status === 200 && String(out.body).includes('<form'), 'Firebase: handler answers a decoy');
  await h({ method: 'GET', url: '/', originalUrl: '/', headers: { host: 'shop.example.com' }, ip: '192.0.2.9', socket: {} }, res);
  ok(out.status === 404, 'Firebase: anything else is a 404 (Hosting serves the real site)');

  // npx agentdecoy init in throwaway projects
  const bin = path.resolve('bin/agentdecoy.js');
  const tmp = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-')); for (const [f, b] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); } return d; };
  const run = (d) => execFileSync(process.execPath, [bin, 'init'], { cwd: d, encoding: 'utf8' });
  let d = tmp({ 'package.json': JSON.stringify({ dependencies: { next: '^16.0.1', agentdecoy: '2.2.0' } }), 'tsconfig.json': '{}', 'src/app/page.tsx': '' });
  run(d); ok(fs.readFileSync(path.join(d, 'src/proxy.ts'), 'utf8').includes("export { proxy } from 'agentdecoy/next'"), 'init: Next 16 writes src/proxy.ts');
  d = tmp({ 'package.json': JSON.stringify({ dependencies: { next: '15.2.0' } }) });
  run(d); ok(fs.existsSync(path.join(d, 'middleware.js')), 'init: Next 15 writes middleware.js');
  d = tmp({ 'package.json': JSON.stringify({ dependencies: { vite: '6' } }), 'netlify.toml': '' });
  run(d); ok(fs.readFileSync(path.join(d, 'netlify/edge-functions/agentdecoy.js'), 'utf8').includes("path: '/*'"), 'init: Netlify edge function');
  d = tmp({ 'package.json': JSON.stringify({ dependencies: { vite: '6' } }), 'vercel.json': '{}' });
  run(d); ok(fs.readFileSync(path.join(d, 'middleware.js'), 'utf8').includes('agentdecoy/vercel'), 'init: Vercel routing middleware');
  d = tmp({ 'firebase.json': JSON.stringify({ hosting: { public: 'dist', rewrites: [{ source: '**', destination: '/index.html' }] } }) });
  const said = run(d);
  const rw = JSON.parse(fs.readFileSync(path.join(d, 'firebase.json'), 'utf8')).hosting.rewrites;
  ok(rw[0].function.functionId === 'agentdecoy' && rw[rw.length - 1].destination === '/index.html' && /exports\.agentdecoy/.test(said), 'init: Firebase rewrites go before the SPA catch-all');
  run(d); ok(JSON.parse(fs.readFileSync(path.join(d, 'firebase.json'), 'utf8')).hosting.rewrites.length === rw.length, 'init: running twice adds nothing');
  // Firebase projects compiled to CommonJS: require() must work and serve decoys.
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('../src/firebase.cjs');
  ok(JSON.stringify(cjs.FIREBASE_PATHS) === JSON.stringify(fb.FIREBASE_PATHS), 'Firebase: CommonJS and ESM path lists match');
  const hc = cjs.handler();
  const o2 = { status: 0, body: null };
  await hc({ method: 'GET', url: '/.env', originalUrl: '/.env', headers: { host: 'shop.example.com', 'user-agent': 'curl/8' }, ip: '192.0.2.10', socket: {} }, { status(s) { o2.status = s; return this; }, setHeader() {}, end(b) { o2.body = b; }, send(b) { o2.body = b; } });
  ok(o2.status === 200 && String(o2.body).length > 50, 'Firebase: CommonJS handler answers a decoy');
  d = tmp({ 'firebase.json': JSON.stringify({ functions: { source: 'functions' }, hosting: { public: 'dist', rewrites: [{ source: '/unsubscribe', function: { functionId: 'unsubscribe', region: 'northamerica-northeast1' } }, { source: '**', destination: '/index.html' }] } }), 'functions/src/index.ts': '' });
  const said2 = run(d);
  const rw2 = JSON.parse(fs.readFileSync(path.join(d, 'firebase.json'), 'utf8')).hosting.rewrites;
  ok(rw2[0].function.region === 'northamerica-northeast1' && /region: 'northamerica-northeast1'/.test(said2) && /export const agentdecoy/.test(said2), 'init: Firebase keeps the functions region and prints the TypeScript line');
  d = tmp({ 'package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }), 'middleware.js': '// mine' });
  run(d); ok(fs.readFileSync(path.join(d, 'middleware.js'), 'utf8') === '// mine', 'init: never overwrites an existing middleware');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
