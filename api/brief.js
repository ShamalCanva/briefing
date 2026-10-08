// GET  /api/brief  → latest brief (middleware has already checked the passphrase cookie)
// POST /api/brief  → publish a brief; header x-ingest-secret must match INGEST_SECRET
// Storage: Vercel Blob (create a Blob store under the project's Storage tab; it sets BLOB_READ_WRITE_TOKEN).
import { put, list } from '@vercel/blob';
import { safeEqual } from '../lib/auth.js';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'No Blob store connected. In Vercel: Storage → Create → Blob, connect it to this project, then redeploy.' });

  if (req.method === 'POST') {
    if (!safeEqual(req.headers['x-ingest-secret'], process.env.INGEST_SECRET)) return res.status(403).send('forbidden');
    const brief = typeof req.body === 'string' ? safeParse(req.body) : req.body;
    if (!brief || !/^\d{4}-\d{2}-\d{2}$/.test(brief.date) || !brief.generatedAt || !Array.isArray(brief.todos) || !Array.isArray(brief.meetings)) return res.status(422).send('not a Briefing document');
    await put(`briefs/${brief.date}.json`, JSON.stringify(brief), { access: 'public', addRandomSuffix: true, contentType: 'application/json' });
    return res.status(200).json({ ok: true, date: brief.date });
  }

  if (req.method === 'GET') {
    const { blobs } = await list({ prefix: 'briefs/', limit: 1000 });
    if (!blobs.length) return res.status(404).json({ error: 'No brief published yet' });
    const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
    const r = await fetch(latest.url, { cache: 'no-store' });
    res.setHeader('content-type', 'application/json');
    return res.status(200).send(await r.text());
  }

  res.setHeader('allow', 'GET, POST');
  return res.status(405).send('method not allowed');
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
