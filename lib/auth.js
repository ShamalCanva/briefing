// Shared by the Edge middleware and the Node functions, so it uses only Web Crypto.
export const COOKIE = 'brief_session';

const enc = new TextEncoder();

export async function sessionToken(env = process.env) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.INGEST_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('session:' + (env.SITE_PASSWORD || '')));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a, b) {
  const A = enc.encode(String(a ?? '')), B = enc.encode(String(b ?? ''));
  if (A.length !== B.length) return false;
  let diff = 0; for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(c => c[0]));
}

export async function isAuthed(cookieHeader, env) {
  const c = parseCookies(cookieHeader)[COOKIE];
  return !!c && safeEqual(c, await sessionToken(env));
}

export const loginPage = (msg = '') => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brief</title><link rel="icon" href="/favicon.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F3EC;color:#24221D;font:16px/1.5 "Helvetica Neue",Arial,sans-serif}form{display:grid;gap:12px;width:min(360px,calc(100vw - 40px))}h1{font:400 40px/1 "Iowan Old Style",Georgia,serif;letter-spacing:-.03em;margin:0 0 8px;display:flex;align-items:center;gap:12px}h1 i{width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,#FFE39B,#E4A93F)}input{font:inherit;padding:10px 12px;border:1px solid #E3DDD1;border-radius:2px;background:#FBF9F4}button{font:inherit;padding:10px 14px;border:0;border-radius:2px;background:#EBBE4F;color:#24221D;cursor:pointer}p{margin:0;color:#716D64;font-size:14px}</style>
<form method="post" action="/login"><h1><i></i>Brief</h1><label for="pw" style="font-size:13px;color:#6A665E">Passphrase</label><input id="pw" name="password" type="password" autocomplete="current-password" autofocus required><button>Open</button>${msg ? `<p>${msg}</p>` : ''}</form>`;
