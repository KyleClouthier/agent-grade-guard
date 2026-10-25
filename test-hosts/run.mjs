// Host test suite: installs the PACKED package (exactly what npm users get) into sample projects, runs
// `npx agentdecoy init`, starts each host's own local server, and checks from outside that decoys answer, the
// report reaches AgentDecoy before the answer, real pages are untouched, the network block refuses a known
// attacker on a form, and real pages get the safe headers.
//   node test-hosts/run.mjs            all hosts
//   node test-hosts/run.mjs next16     one host (next15, next16, express, firebase, netlify, cloudflare)
// Needs network for npm installs. Reports go to a local stand-in for simgen.dev, never to the live service.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const only = process.argv[2];
const BAD_IP = '198.51.100.99';
const KEY = 'a'.repeat(32);
let pass = 0, fail = 0;
const results = [];
const ok = (host, c, n, i = '') => { if (c) pass++; else fail++; results.push(`${c ? 'PASS' : 'FAIL'} [${host}] ${n}${!c && i ? ' :: ' + i : ''}`); console.log(results[results.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- stand-in for simgen.dev/api/agent-guard ----
const reports = [];
const mock = http.createServer((req, res) => {
  if (req.method === 'GET' && /list=1/.test(req.url)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ list: [BAD_IP] })); return; }
  if (req.method === 'GET') { res.writeHead(503); res.end(); return; } // config: fall back to the built-in copy
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { reports.push(JSON.parse(b)); } catch {} res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
});
await new Promise((r) => mock.listen(7700, '127.0.0.1', r));
const ENDPOINT = 'http://127.0.0.1:7700/api/agent-guard';
const ENV = { AGENTDECOY_KEY: KEY, AGENTDECOY_SITE: 'shop.example.com', AGENTDECOY_ENDPOINT: ENDPOINT, AGENTDECOY_HEADERS: 'on' };

// ---- the package exactly as published ----
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-pack-'));
const tgzName = execSync(`npm pack --pack-destination "${packDir}"`, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop();
const TGZ = path.join(packDir, tgzName).replace(/\\/g, '/');
console.log('packed', TGZ);

function project(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-host-'));
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
  return d;
}
const sh = (cmd, cwd, extraEnv = {}) => execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...extraEnv }, timeout: 15 * 60 * 1000 });
function start(cmd, cwd, extraEnv) {
  const p = spawn(cmd, { cwd, shell: true, env: { ...process.env, ...ENV, ...extraEnv } });
  let log = ''; p.stdout.on('data', (c) => (log += c)); p.stderr.on('data', (c) => (log += c));
  return { p, log: () => log };
}
function stop(s) { try { if (process.platform === 'win32') execSync(`taskkill /pid ${s.p.pid} /T /F`, { stdio: 'ignore' }); else s.p.kill('SIGTERM'); } catch {} }
async function waitUp(url, ms = 120000) { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.status < 500) return true; } catch {} await sleep(1500); } return false; }

// The same checks for every host. headers: whether real pages should carry the safe headers on this host.
async function checks(host, base, { headers = true, block = true, realStatus = 200, spa = false } = {}) {
  const home = await fetch(base + '/');
  ok(host, home.status === realStatus, 'real home page answers', home.status);
  if (headers) ok(host, home.headers.get('x-content-type-options') === 'nosniff', 'real pages carry the safe headers', JSON.stringify([...home.headers.keys()]));
  const before = reports.length;
  const env = await fetch(base + '/.env', { headers: { 'user-agent': 'curl/8', 'x-forwarded-for': '203.0.113.50' } });
  const envBody = await env.text();
  ok(host, env.status === 200 && /OPENAI_API_KEY|sgk_live_|AWS_/.test(envBody), 'decoy .env answered', env.status + ' ' + envBody.slice(0, 80));
  ok(host, reports.length > before && reports.some((r) => r.path === '/.env' && r.key === KEY), 'catch reported to AgentDecoy before the answer', `reports ${before}->${reports.length}`);
  const mcp = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'curl/8' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) });
  const mj = await mcp.json().catch(() => ({}));
  ok(host, mcp.status === 200 && mj.result && mj.result.serverInfo, 'MCP decoy answers the handshake', mcp.status);
  const panel = await fetch(base + '/openhands', { headers: { 'user-agent': 'curl/8' } });
  ok(host, panel.status === 200 && /OpenHands/.test(await panel.text()), 'agent panel decoy');
  const missing = spa ? null : await fetch(base + '/no-such-page-' + Date.now());
  if (missing) ok(host, missing.status === 404, 'a normal missing page is still a normal 404', missing.status);
  if (block) {
    const bad = await fetch(base + '/contact', { method: 'POST', headers: { 'x-forwarded-for': BAD_IP, 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1' });
    ok(host, bad.status === 403, 'known attacker refused on a form post', bad.status);
    const good = await fetch(base + '/contact', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.77', 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1' });
    ok(host, good.status === 200, 'everyone else posts normally', good.status);
  }
}

const NEXT_APP = (ver) => ({
  'package.json': JSON.stringify({ name: 'ad-next', private: true, scripts: { build: 'next build', start: 'next start' }, dependencies: { next: ver, react: '^19', 'react-dom': '^19', agentdecoy: `file:${TGZ}` } }),
  'app/layout.js': 'export default function L({ children }) { return <html><body>{children}</body></html>; }\n',
  'app/page.js': 'export default function P() { return <p>home</p>; }\n',
  'app/contact/route.js': 'export async function POST() { return new Response("sent"); }\n',
});

const HOSTS = {
  async next15() {
    const d = project(NEXT_APP('15'));
    sh('npm install --no-audit --no-fund', d); sh('npx agentdecoy init', d);
    ok('next15', fs.existsSync(path.join(d, 'middleware.js')), 'init wrote middleware.js');
    sh('npx next build', d, ENV);
    const s = start('npx next start -p 3415', d); try { ok('next15', await waitUp('http://127.0.0.1:3415/'), 'server up', s.log().slice(-300)); await checks('next15', 'http://127.0.0.1:3415'); } finally { stop(s); }
  },
  async next16() {
    const d = project(NEXT_APP('16'));
    sh('npm install --no-audit --no-fund', d); sh('npx agentdecoy init', d);
    ok('next16', fs.existsSync(path.join(d, 'proxy.js')), 'init wrote proxy.js');
    sh('npx next build', d, ENV);
    const s = start('npx next start -p 3416', d); try { ok('next16', await waitUp('http://127.0.0.1:3416/'), 'server up', s.log().slice(-300)); await checks('next16', 'http://127.0.0.1:3416'); } finally { stop(s); }
  },
  async express() {
    const d = project({
      'package.json': JSON.stringify({ name: 'ad-express', private: true, type: 'module', dependencies: { express: '^4', agentdecoy: `file:${TGZ}` } }),
      'server.js': "import express from 'express';\nimport { agentGradeGuard } from 'agentdecoy/express';\nconst app = express();\napp.set('trust proxy', true);\napp.use(agentGradeGuard({ site: 'shop.example.com', key: process.env.AGENTDECOY_KEY, endpoint: process.env.AGENTDECOY_ENDPOINT, headers: true }));\napp.get('/', (q, s) => s.send('home'));\napp.post('/contact', (q, s) => s.send('sent'));\napp.listen(3420);\n",
    });
    sh('npm install --no-audit --no-fund', d);
    const s = start('node server.js', d); try { ok('express', await waitUp('http://127.0.0.1:3420/'), 'server up', s.log().slice(-300)); await checks('express', 'http://127.0.0.1:3420'); } finally { stop(s); }
  },
  async firebase() {
    // A static SPA on Hosting with a catch-all, and a CommonJS functions folder: the favourbee shape.
    const d = project({
      'firebase.json': JSON.stringify({ hosting: { public: 'public', ignore: ['firebase.json', '**/.*'], rewrites: [{ source: '**', destination: '/index.html' }] }, functions: { source: 'functions' }, emulators: { hosting: { port: 5030 }, functions: { port: 5031 }, ui: { enabled: false } } }),
      'public/index.html': '<p>home</p>',
      'functions/package.json': JSON.stringify({ name: 'fns', private: true, main: 'index.js', engines: { node: '20' }, dependencies: { 'firebase-functions': '^6', 'firebase-admin': '^12', agentdecoy: `file:${TGZ}` } }),
      'functions/index.js': "const { onRequest } = require('firebase-functions/v2/https');\n",
      'functions/.env': `AGENTDECOY_KEY=${KEY}\nAGENTDECOY_SITE=shop.example.com\nAGENTDECOY_ENDPOINT=${ENDPOINT}\n`,
    });
    sh('npm install --no-audit --no-fund', path.join(d, 'functions'));
    const said = sh(`npx -y --package="${TGZ}" agentdecoy init`, d);
    ok('firebase', /exports\.agentdecoy/.test(said), 'init printed the functions line');
    fs.appendFileSync(path.join(d, 'functions/index.js'), "exports.agentdecoy = onRequest({ region: 'us-central1' }, require('agentdecoy/firebase').handler());\n");
    const s = start('firebase emulators:start --only functions,hosting --project demo-agentdecoy', d);
    try {
      ok('firebase', await waitUp('http://127.0.0.1:5030/', 180000), 'emulators up', s.log().slice(-400));
      await sleep(5000); // functions finish loading after hosting answers
      await checks('firebase', 'http://127.0.0.1:5030', { headers: false, block: false, spa: true });
    } finally { stop(s); }
  },
};

for (const [name, fn] of Object.entries(HOSTS)) {
  if (only && only !== name) continue;
  console.log(`\n=== ${name}`);
  try { await fn(); } catch (e) { ok(name, false, 'host run crashed', String(e.message || e).slice(0, 400)); }
}
mock.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
