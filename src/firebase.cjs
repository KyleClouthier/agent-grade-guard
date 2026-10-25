/**
 * CommonJS entry for Firebase Functions projects (most compile TypeScript to CommonJS):
 *   const { handler } = require('agentdecoy/firebase');
 *   exports.agentdecoy = onRequest({ region: 'us-central1' }, handler());
 * The package itself is an ES module; this loads it on the first request with a real dynamic import (Node 18+).
 */
let mod = null;
const load = () => (mod = mod || import('./firebase.js'));

exports.handler = function handler(overrides) {
  let h = null;
  return async (req, res) => {
    if (!h) h = (await load()).handler(overrides);
    return h(req, res);
  };
};

// Same list as firebase.js (kept in step by the tests).
exports.FIREBASE_PATHS = [
  '**/.env', '**/.env.*', '**/.git/**', '**/.aws/**', '**/wp-config.php*', '/backup.zip', '/site-backup.zip', '/www.zip', '/backups/backup.zip',
  '/phpinfo.php', '/info.php', '/*.sql', '/trail', '/trail/**', '/api/docs', '/openapi.json', '/swagger.json', '/.well-known/mcp.json', '/mcp',
  '/flag.txt', '/flag', '/.flag', '/flag.md', '/api/agent-check', '/api/v1/**', '/llm/**', '/admin', '/admin/**', '/wp-admin', '/wp-admin/**', '/wp-login.php',
  '/openhands', '/openhands/**', '/flowise', '/flowise/**', '/langflow', '/langflow/**', '/n8n', '/n8n/**', '/comfyui', '/comfyui/**', '/rest/workflows', '/system_stats',
  '/.mcp.json', '/.cursor/**', '/.claude/**', '/.vscode/**',
];
