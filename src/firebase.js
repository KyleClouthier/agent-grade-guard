/**
 * AgentDecoy for Firebase Hosting (needs the Blaze plan, like any Cloud Function). Two small steps, or run
 * `npx agentdecoy init` in your project and it does both:
 *
 * 1. functions/index.js (or .ts):
 *      const { onRequest } = require('firebase-functions/v2/https');
 *      exports.agentdecoy = onRequest(require('agentdecoy/firebase').handler());   // ESM: import { handler } from 'agentdecoy/firebase'
 *
 * 2. firebase.json, at the top of hosting.rewrites: one entry per path in FIREBASE_PATHS, each
 *      { "source": "<path>", "function": { "functionId": "agentdecoy" } }
 *
 * Set AGENTDECOY_KEY with: firebase functions:secrets:set AGENTDECOY_KEY  (or as a plain environment variable).
 * Your static site stays on Hosting; only the decoy paths reach the function.
 */
import { agentGradeGuard } from './express.js';
import { optionsFromEnv } from './env.js';

export function handler(overrides) {
  let mw = null;
  return (req, res) => {
    if (!mw) mw = agentGradeGuard(optionsFromEnv(String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim(), overrides));
    return mw(req, res, () => res.status(404).send('Not found'));
  };
}

// The decoy paths Firebase Hosting should send to the function (Hosting serves everything else as before).
// Hosting drops dot-files from your public folder by default, which is why the rewrites are needed at all.
export const FIREBASE_PATHS = [
  '**/.env', '**/.env.*', '**/.git/**', '**/.aws/**', '**/wp-config.php*', '/backup.zip', '/site-backup.zip', '/www.zip', '/backups/backup.zip',
  '/phpinfo.php', '/info.php', '/*.sql', '/trail', '/trail/**', '/api/docs', '/openapi.json', '/swagger.json', '/.well-known/mcp.json', '/mcp',
  '/flag.txt', '/flag', '/.flag', '/flag.md', '/api/agent-check', '/api/v1/**', '/llm/**', '/admin', '/admin/**', '/wp-admin', '/wp-admin/**', '/wp-login.php',
  '/openhands', '/openhands/**', '/flowise', '/flowise/**', '/langflow', '/langflow/**', '/n8n', '/n8n/**', '/comfyui', '/comfyui/**', '/rest/workflows', '/system_stats',
  '/.mcp.json', '/.cursor/**', '/.claude/**', '/.vscode/**',
];
