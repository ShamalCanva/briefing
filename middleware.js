// Vercel Edge Middleware: nothing on the site is served without the passphrase cookie,
// except the login page, the health check, and the POST ingest (which checks its own secret).
import { isAuthed } from './lib/auth.js';

export const config = { matcher: ['/((?!_vercel|favicon.ico).*)'] };

export default async function middleware(req) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (p === '/login' || p === '/logout' || p === '/healthz' || p.startsWith('/api/login') || p.startsWith('/api/logout')) return;
  if (p === '/api/brief' && req.method === 'POST') return;
  if (await isAuthed(req.headers.get('cookie') || '', process.env)) return;
  if (p.startsWith('/api/')) return new Response('unauthorised', { status: 401, headers: { 'cache-control': 'no-store' } });
  return Response.redirect(new URL('/login', req.url), 303);
}
