// Tests for the JavaScript guard core, run with Node 18+ (web Request/Response, WebCrypto). No network: fetch is
// stubbed to capture reports and to answer the bot lists.
import { createGuard, kindOf, zipStore, inCidr, behaviourOf, passwordTag, adminPassword } from '../src/guard-core.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, n, i = '') => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i); } };
const reports = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes('simgen.dev/api/agent-guard')) { reports.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 }); }
  if (String(url).includes('openai.com/searchbot.json')) return new Response(JSON.stringify({ prefixes: [{ ipv4Prefix: '20.42.10.0/24' }, { ipv6Prefix: '2001:db8::/32' }] }), { status: 200 });
  if (String(url).includes('cloudflare-dns.com')) {
    const u = new URL(url); const name = u.searchParams.get('name'); const type = u.searchParams.get('type');
    if (type === 'PTR' && name === '1.0.0.66.in-addr.arpa') return new Response(JSON.stringify({ Answer: [{ data: 'crawl-66-0-0-1.googlebot.com.' }] }), { status: 200 });
    if (type === 'A' && name === 'crawl-66-0-0-1.googlebot.com') return new Response(JSON.stringify({ Answer: [{ data: '66.0.0.1' }] }), { status: 200 });
    return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
  }
  return new Response('', { status: 404 });
};

const guard = createGuard({ site: 'www.Example.com', key: 'k'.repeat(32), secret: 'test-secret' });
const req = (path, { method = 'GET', headers = {}, body, ip = '203.0.113.9' } = {}) => [new Request('https://example.com' + path, { method, headers: { 'user-agent': 'curl/8', ...headers }, body }), { ip }];
const text = async (r) => r.text();

(async () => {
  ok(kindOf('/.env') === 'bait' && kindOf('/backend/.env.old') === 'bait' && kindOf('/trail/') === 'trail' && kindOf('/mcp') === 'mcp' && kindOf('/api/docs') === 'docs' && kindOf('/wp-login.php') === 'admin' && kindOf('/about/') === null && kindOf('/random.zip') === null, 'kindOf');
  ok(inCidr('20.42.10.7', '20.42.10.0/24') && !inCidr('20.42.11.7', '20.42.10.0/24') && inCidr('2001:db8::1', '2001:db8::/32') && !inCidr('2001:db9::1', '2001:db8::/32'), 'inCidr v4 and v6');
  ok(behaviourOf(undefined).noJs && behaviourOf('0,0,0,0,100').instant && !behaviourOf('30,10,0,1,8000').noMouse, 'behaviourOf');
  const pw = await adminPassword('s', 'abcdef012345');
  ok((await passwordTag('s', pw)) === 'abcdef012345' && (await passwordTag('other', pw)) === null, 'password tag round trip');

  // Real site paths are untouched.
  ok((await guard(...req('/about/'))) === null, 'real path returns null');

  // The .env is stable and carries every tripwire.
  const e1 = await text(await guard(...req('/.env')));
  const e2 = await text(await guard(...req('/.env')));
  ok(e1 === e2, 'fake .env stable for the same visitor');
  const tag = /hooks\/([a-f0-9]{12})/.exec(e1)[1];
  ok(/OPENAI_API_KEY=sk-/.test(e1) && /OPENAI_BASE_URL=https:\/\/example\.com\/llm\/v1/.test(e1) && new RegExp(`ADMIN_PASSWORD=${tag}-[a-f0-9]{10}`).test(e1) && /SIMGEN_API_KEY=sgk_live_/.test(e1), 'fake .env has AI key, base URL, webhook, admin password, API key', e1);
  const e3 = await text(await guard(...req('/.env', { ip: '198.51.100.4' })));
  ok(e3 !== e1, 'another visitor gets different values');

  // Secrets used: webhook, API key, AI key, admin password, each traced to the visit tag.
  await guard(...req(`/api/v1/hooks/${tag}`, { method: 'POST', ip: '192.0.2.1' }));
  const k = /SIMGEN_API_KEY=(sgk_live_[a-f0-9]+)/.exec(e1)[1];
  await guard(...req('/api/v1/users', { headers: { authorization: `Bearer ${k}` }, ip: '192.0.2.2' }));
  const ai = /OPENAI_API_KEY=(sk-[a-f0-9]{48})/.exec(e1)[1];
  const llm = await guard(...req('/llm/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${ai}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'write spam' }] }), ip: '192.0.2.3' }));
  ok(llm.status === 429 && (await llm.json()).error.code === 'insufficient_quota', 'AI key: quota answer');
  const models = await guard(...req('/llm/v1/models', { headers: { authorization: `Bearer ${ai}` }, ip: '192.0.2.3' }));
  ok(models.status === 200 && (await models.json()).data.length === 4, 'AI key: model list');
  const pwd = new RegExp(`ADMIN_PASSWORD=(${tag}-[a-f0-9]{10})`).exec(e1)[1];
  const lg = await guard(...req('/admin/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `user=admin&pass=${pwd}`, ip: '192.0.2.4' }));
  ok(lg.status === 200 && /Invalid username or password/.test(await lg.text()), 'login answers like a failed login');
  const byKind = Object.fromEntries(reports.map((r) => [r.kind + '@' + r.ip, r]));
  ok(byKind['key_used@192.0.2.1']?.fromHit === tag && byKind['key_used@192.0.2.2']?.fromHit === tag, 'webhook and API key traced to the visit');
  const chat = reports.find((r) => r.kind === 'llm_key' && r.path === '/llm/v1/chat/completions');
  ok(chat?.fromHit === tag && chat?.llmModel === 'gpt-4o' && chat?.llmText === 'write spam', 'AI key use traced, model and text kept', JSON.stringify(chat));
  ok(byKind['login_attempt@192.0.2.4']?.credsFromFile === true && byKind['login_attempt@192.0.2.4']?.fromHit === tag && byKind['login_attempt@192.0.2.4']?.behave?.noJs === true && !JSON.stringify(byKind['login_attempt@192.0.2.4']).includes(pwd), 'login traced to the theft, behaviour kept, password never sent');
  ok(reports.every((r) => r.key === 'k'.repeat(32) && r.site === 'example.com' && r.plugin === 'js-1.0.0'), 'reports carry key, site and version');

  // Docs, MCP, trail, zip.
  const oa = await guard(...req('/openapi.json'));
  ok(oa.status === 200 && (await oa.json()).paths['/admin/keys'], 'OpenAPI decoy');
  const mm = await guard(...req('/.well-known/mcp.json'));
  ok((await mm.json()).endpoint === 'https://example.com/mcp', 'MCP manifest');
  const mp = await guard(...req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'initialize' }) }));
  const mj = await mp.json();
  ok(mp.status === 401 && mj.id === 3 && mj.error.code === -32001 && reports.find((r) => r.kind === 'mcp' && r.mcpMethod === 'initialize'), 'MCP JSON-RPC answered and logged');
  ok((await guard(...req('/mcp'))).status === 405, 'MCP GET 405');
  ok(/Archive/.test(await text(await guard(...req('/trail/')))), 'trail page');
  const z = await guard(...req('/backup.zip'));
  const zb = new Uint8Array(await z.arrayBuffer());
  fs.writeFileSync(new URL('./out-backup.zip', import.meta.url), zb);
  ok(z.headers.get('content-type') === 'application/zip' && /backup\.zip/.test(z.headers.get('content-disposition')) && zb[0] === 0x50 && zb[1] === 0x4b, 'backup.zip served');
  ok(Buffer.from(zb).toString('latin1').includes(`hooks/${tag}`), 'zip holds the same fake .env');
  ok((await guard(...req('/.git/index'))).status === 404, 'other .git files 404');

  // Bots: a verified Googlebot (by reverse DNS over DoH) gets 404; a fake Googlebot gets the bait, flagged; a
  // platform-verified bot gets 404; a verified OpenAI search bot by address list gets 404; Claude claims are flagged.
  const gUA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  ok((await guard(...req('/.env', { headers: { 'user-agent': gUA }, ip: '66.0.0.1' }))).status === 404, 'real Googlebot (rDNS) gets 404');
  const fake = await guard(...req('/.env', { headers: { 'user-agent': gUA }, ip: '203.0.113.77' }));
  ok(fake.status === 200 && reports.find((r) => r.ip === '203.0.113.77')?.spoofedBot === true, 'fake Googlebot gets the bait, flagged spoofed');
  const r1 = await guard(new Request('https://example.com/.env', { headers: { 'user-agent': 'anything' } }), { ip: '1.1.1.1', verifiedBot: 'Search Engine Crawler' });
  ok(r1.status === 404, 'platform-verified bot gets 404');
  ok((await guard(...req('/.env', { headers: { 'user-agent': 'Mozilla/5.0; compatible; OAI-SearchBot/1.0' }, ip: '20.42.10.9' }))).status === 404, 'real OAI-SearchBot by address list gets 404');
  const cl = await guard(...req('/.env', { headers: { 'user-agent': 'ClaudeBot/1.0' }, ip: '203.0.113.88' }));
  ok(cl.status === 200 && reports.find((r) => r.ip === '203.0.113.88')?.claimedBot === true, 'unverifiable crawler claim flagged');
  ok(reports.every((r) => r.ip !== '66.0.0.1' && r.ip !== '20.42.10.9'), 'verified bots are not reported');

  // Signature-Agent, agent name, ref.
  await guard(...req(`/api/agent-check?ref=${tag}&agent=TestBot%20(gpt-4.1)`, { headers: { 'signature-agent': '"https://chatgpt.com/.well-known/http-message-signatures-directory"' }, ip: '192.0.2.9' }));
  const ac = reports.find((r) => r.kind === 'ai_check');
  ok(ac && ac.ref === tag && ac.agentSaid === 'TestBot (gpt-4.1)' && ac.signedAgent === 'https://chatgpt.com/.well-known/http-message-signatures-directory', 'agent-check keeps ref, name and signed agent', JSON.stringify(ac));

  // No key: nothing reported, decoys still work.
  const quiet = createGuard({ site: 'quiet.example', secret: 's' });
  const before = reports.length;
  ok((await quiet(new Request('https://quiet.example/.env'), { ip: '9.9.9.9' })).status === 200 && reports.length === before, 'without a key the decoys work and nothing is sent');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
