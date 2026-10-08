// GET /login → passphrase form. POST /login → set the session cookie if the passphrase matches.
import { COOKIE, sessionToken, safeEqual, loginPage } from '../lib/auth.js';

const attempts = new Map(); // best-effort per-instance rate limit
function tooMany(ip) { const now = Date.now(); const l = (attempts.get(ip) || []).filter(t => now - t < 15 * 60_000); attempts.set(ip, l); return l.length >= 8; }

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.method === 'GET') return res.status(200).send(loginPage());
  if (req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); return res.status(405).send('method not allowed'); }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (tooMany(ip)) return res.status(429).send(loginPage('Too many attempts. Try again in 15 minutes.'));

  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});
  if (safeEqual(body.password, process.env.SITE_PASSWORD)) {
    res.setHeader('set-cookie', `${COOKIE}=${await sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`);
    res.setHeader('location', '/');
    return res.status(303).end();
  }
  attempts.get(ip).push(Date.now());
  return res.status(401).send(loginPage("That passphrase didn't match."));
}
