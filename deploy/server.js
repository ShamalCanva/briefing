// Brief host: one Node file, no dependencies.
//   GET  /            the page (behind a passphrase gate)
//   GET  /api/brief   latest brief JSON (behind the same gate)
//   POST /api/brief   publish a new brief; needs header x-ingest-secret (used by the morning job)
//   GET/POST /login   passphrase form
//
// Env: SITE_PASSWORD (what you type to open the site), INGEST_SECRET (what the job sends),
//      DATA_DIR (where briefs are stored; /data on Fly with a volume), PORT.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SITE_PASSWORD = process.env.SITE_PASSWORD;
const INGEST_SECRET = process.env.INGEST_SECRET;
if (!SITE_PASSWORD || !INGEST_SECRET) { console.error('Set SITE_PASSWORD and INGEST_SECRET'); process.exit(1); }
fs.mkdirSync(DATA_DIR, { recursive: true });

const PAGE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const COOKIE = 'brief_session';
const sessionToken = () => crypto.createHmac('sha256', INGEST_SECRET).update('session:' + SITE_PASSWORD).digest('hex');
const safeEqual = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };

const attempts = new Map(); // ip -> [timestamps]
function tooManyAttempts(ip) {
  const now = Date.now(); const list = (attempts.get(ip) || []).filter(t => now - t < 15 * 60_000);
  attempts.set(ip, list); return list.length >= 8;
}

function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(c => c[0])); }
function authed(req) { const c = cookies(req)[COOKIE]; return c && safeEqual(c, sessionToken()); }
function send(res, status, body, headers = {}) { res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...headers }); res.end(body); }
function readBody(req, limit = 2_000_000) { return new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on('data', d => { n += d.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(d); }); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject); }); }

const loginPage = (msg = '') => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brief</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F1E8;color:#1C1A16;font:16px/1.5 "Helvetica Neue",Arial,sans-serif}form{display:grid;gap:12px;width:min(360px,calc(100vw - 40px))}h1{font:400 40px/1 "Iowan Old Style",Georgia,serif;letter-spacing:-.03em;margin:0 0 8px}input{font:inherit;padding:10px 12px;border:1px solid #D9D3C6;border-radius:2px;background:#FAF7F0}button{font:inherit;padding:10px 14px;border:0;border-radius:2px;background:#FFD41F;cursor:pointer}p{margin:0;color:#6A665E;font-size:14px}</style>
<form method="post" action="/login"><h1>Brief</h1><label for="pw" style="font-size:13px;color:#6A665E">Passphrase</label><input id="pw" name="password" type="password" autocomplete="current-password" autofocus required><button>Open</button>${msg ? `<p>${msg}</p>` : ''}</form>`;

function latestBrief() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? fs.readFileSync(path.join(DATA_DIR, files.at(-1))) : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.headers['fly-client-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  if (url.pathname === '/healthz') return send(res, 200, 'ok');

  // Ingest: the morning job publishes here. Secret in a header, never in the URL.
  if (url.pathname === '/api/brief' && req.method === 'POST') {
    if (!safeEqual(req.headers['x-ingest-secret'] || '', INGEST_SECRET)) return send(res, 403, 'forbidden');
    let brief;
    try { brief = JSON.parse(await readBody(req)); } catch { return send(res, 400, 'invalid json'); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(brief.date) || !brief.generatedAt || !Array.isArray(brief.todos) || !Array.isArray(brief.meetings)) return send(res, 422, 'not a Briefing document');
    fs.writeFileSync(path.join(DATA_DIR, `${brief.date}.json`), JSON.stringify(brief));
    console.log(`published brief for ${brief.date} (${brief.generatedAt})`);
    return send(res, 200, JSON.stringify({ ok: true, date: brief.date }), { 'content-type': 'application/json' });
  }

  if (url.pathname === '/login') {
    if (req.method === 'GET') return send(res, 200, loginPage(), { 'content-type': 'text/html; charset=utf-8' });
    if (tooManyAttempts(ip)) return send(res, 429, loginPage('Too many attempts. Try again in 15 minutes.'), { 'content-type': 'text/html; charset=utf-8' });
    const body = new URLSearchParams(await readBody(req, 10_000));
    if (safeEqual(body.get('password') || '', SITE_PASSWORD)) {
      return send(res, 303, '', { location: '/', 'set-cookie': `${COOKIE}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}` });
    }
    attempts.get(ip).push(Date.now());
    return send(res, 401, loginPage('That passphrase didn\'t match.'), { 'content-type': 'text/html; charset=utf-8' });
  }
  if (url.pathname === '/logout') return send(res, 303, '', { location: '/login', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });

  if (!authed(req)) {
    if (url.pathname.startsWith('/api/')) return send(res, 401, 'unauthorised');
    return send(res, 303, '', { location: '/login' });
  }

  if (url.pathname === '/api/brief' && req.method === 'GET') {
    const b = latestBrief();
    return b ? send(res, 200, b, { 'content-type': 'application/json' }) : send(res, 404, JSON.stringify({ error: 'No brief published yet' }), { 'content-type': 'application/json' });
  }
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, PAGE, { 'content-type': 'text/html; charset=utf-8' });
  return send(res, 404, 'not found');
});

server.listen(PORT, '0.0.0.0', () => console.log(`brief listening on :${PORT}, data in ${DATA_DIR}`));
