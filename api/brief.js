// GET  /api/brief  → latest brief (middleware has already checked the passphrase cookie)
// POST /api/brief  → publish a brief; header x-ingest-secret must match INGEST_SECRET
// Storage: a *private* Vercel Blob store connected to the project (sets BLOB_READ_WRITE_TOKEN).
import { put, get } from '@vercel/blob';
import { safeEqual } from '../lib/auth.js';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };
const LATEST = 'briefs/latest.json';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'No Blob store connected. In Vercel: Storage → Create → Blob, connect it to this project, then redeploy.' });

  if (req.method === 'POST') {
    if (!safeEqual(req.headers['x-ingest-secret'], process.env.INGEST_SECRET)) return res.status(403).send('forbidden');
    const brief = typeof req.body === 'string' ? safeParse(req.body) : req.body;
    if (!brief || !/^\d{4}-\d{2}-\d{2}$/.test(brief.date) || !brief.generatedAt || !Array.isArray(brief.todos) || !Array.isArray(brief.meetings)) return res.status(422).send('not a Briefing document');
    const body = JSON.stringify(brief);
    const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0 };
    await put(`briefs/${brief.date}.json`, body, opts);   // dated history
    await put(LATEST, body, opts);                          // what the page reads
    return res.status(200).json({ ok: true, date: brief.date });
  }

  if (req.method === 'GET') {
    const r = await get(LATEST, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return res.status(404).json({ error: 'No brief published yet' });
    const text = await new Response(r.stream).text();
    res.setHeader('content-type', 'application/json');
    return res.status(200).send(text);
  }

  res.setHeader('allow', 'GET, POST');
  return res.status(405).send('method not allowed');
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
