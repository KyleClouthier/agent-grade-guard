#!/usr/bin/env node
/**
 * npx agentdecoy init      looks at the project in this folder and adds the one file it needs:
 *   Next.js           middleware.ts (Next 15 and earlier) or proxy.ts (Next 16), at the root or in src/
 *   Vercel (other)    middleware.ts at the root (Vercel Routing Middleware)
 *   Netlify           netlify/edge-functions/agentdecoy.ts
 *   Firebase Hosting  a function in functions/ and the decoy rewrites in firebase.json
 *   Express / Node    prints the one line to add
 * It never overwrites a file you already have: it prints what to add instead.
 */
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const exists = (p) => fs.existsSync(path.join(cwd, p));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(cwd, p), 'utf8')); } catch { return null; } };
const write = (p, body) => {
  const full = path.join(cwd, p);
  if (fs.existsSync(full)) { console.log(`\n${p} already exists. Add this to it yourself:\n\n${body}`); return false; }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  console.log(`added ${p}`);
  return true;
};
const pkg = readJson('package.json') || {};
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const major = (v) => parseInt(String(v || '').replace(/[^0-9.]/g, '').split('.')[0], 10) || 0;
const ext = exists('tsconfig.json') ? 'ts' : 'js';
const KEY_HELP = 'Get your free key at https://simgen.dev/agentdecoy, then add AGENTDECOY_KEY';

const cmd = process.argv[2];
if (cmd !== 'init') {
  console.log('Usage: npx agentdecoy init   (run it in your project folder)');
  process.exit(cmd ? 1 : 0);
}
const fnPkg = readJson('functions/package.json');
if (!deps.agentdecoy && !(fnPkg && (fnPkg.dependencies || {}).agentdecoy)) console.log('Tip: install the package first: npm install agentdecoy');

if (deps.next) {
  const dir = exists('src/app') || exists('src/pages') ? 'src/' : '';
  const v16 = major(deps.next) >= 16;
  const file = `${dir}${v16 ? 'proxy' : 'middleware'}.${ext}`;
  write(file, v16 ? "export { proxy } from 'agentdecoy/next';\n" : "export { middleware } from 'agentdecoy/next';\n");
  console.log(`\nNext.js: done. ${KEY_HELP} to your environment variables (Vercel: Project Settings > Environment Variables), then redeploy.`);
} else if (exists('netlify.toml') || exists('netlify')) {
  write(`netlify/edge-functions/agentdecoy.${ext}`, "export { default } from 'agentdecoy/netlify';\nexport const config = { path: '/*', excludedPath: ['/assets/*', '/*.css', '/*.js', '/*.png', '/*.jpg', '/*.svg', '/*.woff2'] };\n");
  console.log(`\nNetlify: done. ${KEY_HELP} under Site configuration > Environment variables, then redeploy.`);
} else if (exists('firebase.json')) {
  const fb = readJson('firebase.json');
  const { FIREBASE_PATHS } = await import('../src/firebase.js');
  const hosting = Array.isArray(fb.hosting) ? fb.hosting[0] : fb.hosting;
  if (!hosting) { console.log('firebase.json has no hosting section.'); process.exit(1); }
  hosting.rewrites = hosting.rewrites || [];
  const have = new Set(hosting.rewrites.map((r) => r.source));
  // Use the region the project's functions already run in (Hosting assumes us-central1 when none is given).
  const region = (hosting.rewrites.find((r) => r.function && typeof r.function === 'object' && r.function.region) || {}).function?.region || '';
  const target = region ? { functionId: 'agentdecoy', region } : { functionId: 'agentdecoy' };
  const add = FIREBASE_PATHS.filter((s) => !have.has(s)).map((source) => ({ source, function: target }));
  hosting.rewrites = [...add, ...hosting.rewrites]; // decoys first, before any catch-all to index.html
  const fnDir = (fb.functions && (Array.isArray(fb.functions) ? fb.functions[0] : fb.functions).source) || 'functions';
  // A static site with no functions yet: make a minimal functions folder that holds only the decoys.
  if (!fs.existsSync(path.join(cwd, fnDir))) {
    if (!fb.functions) fb.functions = { source: fnDir };
    write(`${fnDir}/package.json`, JSON.stringify({ name: 'agentdecoy-functions', private: true, main: 'index.js', engines: { node: '20' }, dependencies: { 'firebase-functions': '^6', 'firebase-admin': '^12', agentdecoy: '^2' } }, null, 2) + '\n');
    write(`${fnDir}/index.js`, `// AgentDecoy decoys for this site (npx agentdecoy init). Your key goes in ${fnDir}/.env as AGENTDECOY_KEY=...\nconst { onRequest } = require('firebase-functions/v2/https');\nexports.agentdecoy = onRequest({ region: '${region || 'us-central1'}' }, require('agentdecoy/firebase').handler());\n`);
    write(`${fnDir}/.gitignore`, 'node_modules/\n.env\n');
    fs.writeFileSync(path.join(cwd, 'firebase.json'), JSON.stringify(fb, null, 2) + '\n');
    console.log(`added ${add.length} decoy rewrites to firebase.json and a new ${fnDir}/ folder with the decoy function`);
    console.log(`\nFirebase: next, run  cd ${fnDir} && npm install . Get your free key at https://simgen.dev/agentdecoy and put it in ${fnDir}/.env as AGENTDECOY_KEY=... then firebase deploy.\nNeeds the Blaze plan, like any Cloud Function.`);
    process.exit(0);
  }
  fs.writeFileSync(path.join(cwd, 'firebase.json'), JSON.stringify(fb, null, 2) + '\n');
  console.log(`added ${add.length} decoy rewrites to firebase.json${region ? ` (region ${region}, same as your functions)` : ''}`);
  const ts = fs.existsSync(path.join(cwd, fnDir, 'src', 'index.ts'));
  const opts = `{ region: '${region || 'us-central1'}' }, `;
  const line = ts
    ? `  import { onRequest } from 'firebase-functions/v2/https';\n  // eslint-disable-next-line @typescript-eslint/no-require-imports\n  export const agentdecoy = onRequest(${opts}require('agentdecoy/firebase').handler());`
    : `  const { onRequest } = require('firebase-functions/v2/https');\n  exports.agentdecoy = onRequest(${opts}require('agentdecoy/firebase').handler());`;
  console.log(`\nFirebase: run npm install agentdecoy in ${fnDir}, then add this to ${fnDir}/${ts ? 'src/index.ts' : 'index.js'}:\n\n${line}\n\n${KEY_HELP}: as an environment variable for the function (${fnDir}/.env: AGENTDECOY_KEY=...) or a secret, then firebase deploy.\nNeeds the Blaze plan, like any Cloud Function.`);
} else if (exists('vercel.json') || exists('.vercel')) {
  write(`middleware.${ext}`, "export { default } from 'agentdecoy/vercel';\n");
  console.log(`\nVercel: done. ${KEY_HELP} under Project Settings > Environment Variables, then redeploy.`);
} else if (deps.express || deps.fastify || deps.koa) {
  console.log(`\nNode server: add this before your routes:\n\n  import { agentGradeGuard } from 'agentdecoy/express';\n  app.use(agentGradeGuard({ site: 'yourdomain.com', key: process.env.AGENTDECOY_KEY }));\n\n${KEY_HELP} to your environment.`);
} else {
  console.log('\nCould not tell how this site is hosted. Options: https://simgen.dev/agentdecoy/guard/ (Next.js, Vercel, Netlify, Firebase, Cloudflare, WordPress, PHP, Node).');
}
