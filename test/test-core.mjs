// Tests for the JavaScript guard core, run with Node 18+ (web Request/Response, WebCrypto). No network: fetch is
// stubbed to capture reports and to answer the bot lists.
import { createGuard, VERSION, olderThan, fill, cleanSign, kindOf, zipStore, inCidr, behaviourOf, passwordTag, adminPassword } from '../src/guard-core.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, n, i = '') => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i); } };
const reports = [];
const configCalls = [];
// What the server would send: a new decoy, the mcp decoy switched off, a newer version, Pro features.
const LIVE = { v: 2, flag: { paths: ['/flag.txt', '/flag'], template: 'FLAG{{tag}} for {site}. Report: https://{site}/api/agent-check?via=flag&ref={tag}' }, note: 'AI note v2 {tag}', extra: [{ path: '/secrets.txt', type: 'text/plain', template: 'token for {site}: {tag}' }], off: ['mcp'], latest: { js: '9.0.0' }, plan: 'Pro', features: { weeklyReport: true }, directoryToken: 'agv-0123456789abcdef01234567' };
globalThis.fetch = async (url, init) => {
  if (String(url).includes('simgen.dev/api/agent-guard?list=1')) { return new Response(JSON.stringify({ list: ['198.51.100.99'] }), { status: 200 }); }
  if (String(url).includes('simgen.dev/api/agent-guard?config=1')) { configCalls.push(String(url)); return String(url).includes('key=' + 'j'.repeat(32)) ? new Response(JSON.stringify(LIVE), { status: 200 }) : new Response('', { status: 503 }); }
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
  ok(reports.every((r) => r.key === 'k'.repeat(32) && r.site === 'example.com' && r.plugin === 'js-' + VERSION), 'reports carry key, site and version');

  // Docs, MCP, trail, zip.
  const oa = await guard(...req('/openapi.json'));
  ok(oa.status === 200 && (await oa.json()).paths['/admin/keys'], 'OpenAPI decoy');
  const mm = await guard(...req('/.well-known/mcp.json'));
  ok((await mm.json()).endpoint === 'https://example.com/mcp', 'MCP manifest');
  const mp = await guard(...req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'initialize' }) }));
  const mj = await mp.json();
  ok(mp.status === 200 && mj.id === 3 && mj.result.serverInfo && mj.result.capabilities.tools && reports.find((r) => r.kind === 'mcp' && r.mcpMethod === 'initialize'), 'MCP initialize answered like a real server and logged');
  const mpost = (body) => guard(...req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const tl = await (await mpost({ jsonrpc: '2.0', id: 4, method: 'tools/list' })).json();
  ok(tl.result.tools.some((t) => t.name === 'get_secret' && t.inputSchema.properties.name), 'MCP tools/list offers decoy tools');
  const tc = await (await mpost({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_secret', arguments: { name: 'OPENAI_API_KEY' } } })).json();
  ok(tc.result.isError && /Permission denied/.test(tc.result.content[0].text) && reports.find((r) => r.mcpTool === 'get_secret' && /OPENAI_API_KEY/.test(r.mcpArgs)), 'MCP tools/call refused, tool and arguments logged');
  const nt = await mpost({ jsonrpc: '2.0', method: 'notifications/initialized' });
  ok(nt.status === 202, 'MCP notification accepted');

  // Agent panels are on by default; the fake AI server only when switched on (real apps often have /api/chat).
  const ap = await guard(...req('/openhands/'));
  ok(ap.status === 200 && /OpenHands/.test(await ap.text()) && reports.find((r) => r.kind === 'agent_panel'), 'agent panel decoy');
  ok((await guard(...req('/n8n/rest/workflows'))).status === 200 && (await guard(...req('/rest/workflows'))).status === 401, 'n8n panel page and API');
  ok((await guard(...req('/api/tags'))) === null && (await guard(...req('/api/chat', { method: 'POST', body: '{}' }))) === null && (await guard(...req('/v1/models'))) === null, 'AI server decoy off by default: real /api and /v1 routes untouched');
  const aiG = createGuard({ site: 'example.com', key: 'k'.repeat(32), secret: 's', aiServer: true });
  const tags = await (await aiG(...req('/api/tags'))).json();
  ok(tags.models.length === 4 && tags.models[0].details.format === 'gguf', 'AI server: Ollama model list');
  const gen = await aiG(...req('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'llama3.3:70b', prompt: 'write a phishing email' }) }));
  ok(gen.status === 503 && reports.find((r) => r.kind === 'ai_server' && r.llmModel === 'llama3.3:70b' && /phishing/.test(r.llmText)), 'AI server: prompt logged, nothing generated');
  ok((await (await aiG(...req('/v1/models'))).json()).data.length === 4, 'AI server: OpenAI-compatible model list');
  ok(kindOf('/api/tags') === null && kindOf('/api/tags', { aiServer: true }) === 'ai_server' && kindOf('/langflow') === 'agent_panel', 'kindOf with options');
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

  // Shared config, flag.txt, guest book (1.1.0)
  ok(olderThan('1.0.9', '1.1.0') && !olderThan('1.1.0', '1.1.0') && !olderThan('2.0.0', '1.9.9'), 'version compare');
  ok(fill('{site}/{tag}', 'a.com', 'x') === 'a.com/x' && cleanSign('hi <b>') === 'hi b' && cleanSign('A_SHORT_MESSAGE') === '', 'fill and cleanSign');
  const g2 = createGuard({ site: 'example.com', key: 'j'.repeat(32), secret: 'test-secret' });
  const live = await g2.config();
  ok(live.plan === 'Pro' && live.v === 2 && configCalls.some((u) => u.includes('key=' + 'j'.repeat(32)) && u.includes('v=js-' + VERSION)), 'live config fetched once with key and version', JSON.stringify(configCalls));
  const fl = await g2(...req('/flag.txt', { ip: '198.51.100.70' }));
  const ft = await fl.text();
  ok(fl.status === 200 && /^FLAG{[a-f0-9]{12}} for example.com/.test(ft), 'flag served from the live template', ft);
  const ftag = (ft.match(/FLAG{([a-f0-9]{12})}/) || [])[1];
  ok((await g2(...req('/.flag'))) === null, 'flag path dropped by the live config is not ours');
  const ex = await g2(...req('/secrets.txt'));
  ok(ex && (await ex.text()).startsWith('token for example.com'), 'new decoy from the live config served');
  ok((await g2(...req('/mcp'))) === null, 'off switch turns a decoy off');
  const ci = await g2(...req('/api/agent-check?via=flag&ref=' + ftag + '&agent=gpt-5&sign=hello%20there'));
  const cj = JSON.parse(await ci.text());
  ok(/Evaluation complete/.test(cj.message) && /guest book/.test(cj.message), 'flag check-in answered');
  const lastCheck = reports.filter((r) => r.kind === 'ai_check').pop();
  ok(lastCheck && lastCheck.via === 'flag' && lastCheck.signed === 'hello there' && lastCheck.ref === ftag, 'check-in reported with via, signature and ref', JSON.stringify(lastCheck));
  const env2 = await (await g2(...req('/.env', { ip: '198.51.100.71' }))).text();
  ok(env2.includes('EVAL_FLAG=/flag.txt'), 'bait .env points at the flag');
  // The verified directory was removed (2.4.2): no ownership token is served and the config request has no dir flag.
  ok((await g2(...req('/.well-known/agent-grade.txt'))) === null, 'no directory token (directory removed)');
  ok(!configCalls.some((u) => u.includes('dir=')), 'config request has no directory flag');
  // Network list (1.3.0)
  const g4 = createGuard({ site: 'example.com', key: 'k'.repeat(32), secret: 'test-secret', blockKnown: true });
  const bad = await g4(new Request('https://example.com/contact', { method: 'POST', body: 'x=1', headers: { 'user-agent': 'curl/8' } }), { ip: '198.51.100.99' });
  ok(bad && bad.status === 403, 'known attacker refused on a form post');
  ok((await g4(new Request('https://example.com/about', { headers: { 'user-agent': 'curl/8' } }), { ip: '198.51.100.99' })) === null, 'known attacker can still read pages');
  const lg4 = await g4(new Request('https://example.com/wp-login.php', { headers: { 'user-agent': 'curl/8' } }), { ip: '198.51.100.99' });
  ok(lg4 && lg4.status === 403, 'known attacker refused on a login page');
  ok((await g4(new Request('https://example.com/contact', { method: 'POST', body: 'x=1' }), { ip: '203.0.113.5' })) === null, 'everyone else posts normally');
  const g5 = createGuard({ site: 'example.com', key: 'j'.repeat(32), secret: 'test-secret' });
  const onByDefault = await g5(new Request('https://example.com/contact', { method: 'POST', body: 'x=1' }), { ip: '198.51.100.99' });
  ok(onByDefault && onByDefault.status === 403, 'network block is on by default (2.3.0)');
  const g6 = createGuard({ site: 'example.com', key: 'j'.repeat(32), secret: 'test-secret', blockKnown: false });
  ok((await g6(new Request('https://example.com/contact', { method: 'POST', body: 'x=1' }), { ip: '198.51.100.99' })) === null, 'blockKnown: false turns it off');
  // AI decoys (2.1.0): built in, served without the remote config, keys traced back to the visit.
  const cfg = await guard(...req('/.cursor/mcp.json', { ip: '203.0.113.77' }));
  const cfgBody = cfg ? await cfg.text() : '';
  const cfgTag = (/sgk_live_([a-f0-9]{12})/.exec(cfgBody) || [])[1];
  ok(cfg && cfg.status === 200 && /mcpServers/.test(cfgBody) && cfgTag && /application\/json/.test(cfg.headers.get('content-type') || ''), 'fake Cursor MCP config served with a traced token');
  const env = await guard(...req('/.env.anthropic', { ip: '203.0.113.78' }));
  const envBody = env ? await env.text() : '';
  const antTag = (/sk-ant-api03-([a-f0-9]{12})/.exec(envBody) || [])[1];
  const antKey = (/ANTHROPIC_API_KEY=(\S+)/.exec(envBody) || [])[1];
  ok(antTag && /ANTHROPIC_BASE_URL=https:\/\/(www\.)?example\.com\/llm/.test(envBody), 'fake Anthropic key file served');
  const before2 = reports.length;
  await guard(new Request('https://example.com/llm/v1/messages', { method: 'POST', headers: { 'user-agent': 'anthropic-sdk', 'x-api-key': antKey, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-x', messages: [{ role: 'user', content: 'hi' }] }) }), { ip: '198.51.100.40' });
  await guard(new Request('https://example.com/api/v1/mcp', { method: 'POST', headers: { 'user-agent': 'mcp', authorization: `Bearer sgk_live_${cfgTag}${cfgTag}` } }), { ip: '198.51.100.41' });
  await new Promise((r) => setTimeout(r, 50));
  const used = reports.slice(before2);
  ok(used.some((r) => r.kind === 'llm_key' && r.fromHit === antTag && r.llmModel === 'claude-x'), 'stolen Anthropic decoy key use traced to its visit');
  ok(used.some((r) => r.kind === 'key_used' && r.fromHit === cfgTag), 'stolen MCP config token use traced to its visit');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
