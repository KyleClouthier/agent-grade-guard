/**
 * Agent Grade Guard for Next.js (13 and later, app or pages router). Copy this file to your project root as
 * middleware.ts (or import it from your own middleware), set the env vars, deploy.
 *
 *   AGENT_GRADE_SITE=example.com
 *   AGENT_GRADE_KEY=your site key        (simgen.dev/agent-grade/account or simgen.dev/agent-grade/guard)
 *   AGENT_GRADE_SECRET=any long random string
 *
 * Only decoy paths run through the guard (see `config.matcher`); every other request is untouched.
 */
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
// @ts-ignore: plain JavaScript module
import { createGuard } from './guard-core.js';

let guard: ((req: Request, ctx: Record<string, unknown>) => Promise<Response | null>) | null = null;

export async function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (!guard) {
    guard = createGuard({ site: process.env.AGENT_GRADE_SITE || req.nextUrl.hostname, key: process.env.AGENT_GRADE_KEY || '', secret: process.env.AGENT_GRADE_SECRET || process.env.AGENT_GRADE_KEY || 'change-me' });
  }
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  // Vercel sets x-vercel-verified-bot? Not yet; reverse DNS and address lists are used instead.
  const res = await guard(req, { ip, waitUntil: (p: Promise<unknown>) => ev.waitUntil(p) });
  return res || NextResponse.next();
}

export const config = {
  matcher: [
    '/(.*\\.env.*)', '/(.*\\.git/.*)', '/(.*\\.aws/.*)', '/(.*wp-config\\.php.*)',
    '/(backup|site-backup|www)\\.zip', '/backups/backup.zip', '/phpinfo.php', '/info.php', '/(.*\\.sql)',
    '/trail', '/trail/:path*', '/api/docs', '/api/docs/', '/openapi.json', '/swagger.json',
    '/.well-known/mcp.json', '/mcp', '/mcp/', '/api/agent-check', '/api/v1/:path*', '/llm/:path*',
    '/admin', '/admin/:path*', '/administrator', '/administrator/:path*', '/wp-admin', '/wp-admin/:path*', '/wp-login.php',
  ],
};
