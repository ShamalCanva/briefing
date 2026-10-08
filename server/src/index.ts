// HTTP surface. Hono on Node. Put Cloudflare Access or Google IAP in front of this so only you can reach it,
// or wire the /auth/google sign-in to issue a session cookie restricted to ALLOWED_EMAILS.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomUUID } from 'node:crypto';
import { generateBrief } from './pipeline.js';
import { allConnectors } from './connectors/index.js';
import type { Store } from './store.js';
import type { PendingAction } from './types.js';

declare const store: Store; // provide a Postgres implementation of Store and remove this declaration

const app = new Hono<{ Variables: { userId: string; firstName: string } }>();
const connectors = allConnectors({ store });
const ALLOWED = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);

// ---- identity -------------------------------------------------------------------------------------
// With IAP/Access in front, the verified email arrives in a header; otherwise look up the session cookie.
app.use('/api/*', async (c, next) => {
  const email = c.req.header('x-goog-authenticated-user-email')?.replace(/^accounts\.google\.com:/, '')
    || c.req.header('cf-access-authenticated-user-email');
  if (!email || !ALLOWED.includes(email)) return c.text('Forbidden', 403);
  c.set('userId', email); c.set('firstName', 'Shamal');
  await next();
});

// ---- read ------------------------------------------------------------------------------------------
app.get('/api/brief', async (c) => {
  const brief = await store.getLatestBrief(c.get('userId'));
  return brief ? c.json(brief) : c.json({ error: 'No brief yet. Press Refresh or wait for the morning run.' }, 404);
});

app.get('/api/sources', async (c) => {
  const userId = c.get('userId');
  return c.json(await Promise.all(connectors.map(async (k) => ({ id: k.id, name: k.name, connected: await k.isConnected(userId), scopes: k.scopes }))));
});

// Refresh: same pipeline as the scheduler, rate-limited to one run per two minutes per user.
const lastRefresh = new Map<string, number>();
app.post('/api/refresh', async (c) => {
  const userId = c.get('userId');
  if (Date.now() - (lastRefresh.get(userId) ?? 0) < 120_000) return c.json({ error: 'Refreshed less than two minutes ago.' }, 429);
  lastRefresh.set(userId, Date.now());
  const brief = await generateBrief({ userId, firstName: c.get('firstName'), connectors, store });
  return c.json(brief);
});

// Meeting prep on demand: read-only, over the items linked to the meeting (and documents if that scope exists).
app.post('/api/meetings/:id/prep', async (c) => {
  // const brief = await store.getLatestBrief(userId); find meeting; gather its links' items; call a small synthesis prompt.
  return c.json({ prep: [], note: 'Implement: read-only synthesis over linked items and documents.' });
});

// ---- write actions: approval-gated, Phase 4 only -----------------------------------------------------
// Creating an action never sends anything. Only /confirm, called from a click on the page, executes it,
// and only if the matching write scope (chat:write or gmail.compose) was separately consented.
app.post('/api/actions', async (c) => {
  const body = await c.req.json<{ type: PendingAction['type']; target: string; body: string }>();
  const action: PendingAction = { id: randomUUID(), userId: c.get('userId'), createdAt: new Date().toISOString(), status: 'pending', ...body };
  await store.createAction(action);
  await store.audit(action.userId, 'action.created', { id: action.id, type: action.type, target: action.target });
  return c.json(action); // the page shows exactly this before asking for confirmation
});

app.post('/api/actions/:id/confirm', async (c) => {
  const a = await store.getAction(c.req.param('id'));
  if (!a || a.userId !== c.get('userId') || a.status !== 'pending') return c.text('Not found', 404);
  a.status = 'confirmed'; await store.updateAction(a);
  // execute(a): Slack chat.postMessage or Gmail users.drafts.create (prefer a Gmail draft so the final send stays in Gmail)
  a.status = 'executed'; await store.updateAction(a);
  await store.audit(a.userId, 'action.executed', { id: a.id, type: a.type, target: a.target, body: a.body });
  return c.json(a);
});

app.post('/api/actions/:id/cancel', async (c) => {
  const a = await store.getAction(c.req.param('id'));
  if (!a || a.userId !== c.get('userId')) return c.text('Not found', 404);
  a.status = 'cancelled'; await store.updateAction(a);
  return c.json(a);
});

// ---- scheduler entry point ---------------------------------------------------------------------------
// Cloud Scheduler: cron "30 6 * * 1-5", time zone "Australia/Sydney", header x-job-secret.
app.post('/jobs/generate', async (c) => {
  if (c.req.header('x-job-secret') !== process.env.JOB_SECRET) return c.text('Forbidden', 403);
  if (isNswPublicHoliday(new Date())) return c.json({ skipped: 'public holiday' });
  for (const email of ALLOWED) await generateBrief({ userId: email, firstName: 'Shamal', connectors, store });
  return c.json({ ok: true });
});

// ---- OAuth: one start/callback pair per provider ------------------------------------------------------
// /auth/google/start → consent for gmail.readonly + calendar.readonly + drive.activity.readonly + drive.metadata.readonly (offline access)
// /auth/slack/start  → OAuth v2 with user_scope = slack connector scopes
// /auth/github/start → GitHub App user authorisation
// /auth/figma/start  → Figma OAuth with files:read file_comments:read file_versions:read
// Each callback exchanges the code, encrypts the refresh/user token (store.putToken) and redirects to /.
app.get('/auth/:provider/start', (c) => c.text(`TODO: redirect to ${c.req.param('provider')} consent screen`));
app.get('/auth/:provider/callback', (c) => c.text('TODO: exchange code, store encrypted token, redirect to /'));

// ---- static page ----------------------------------------------------------------------------------------
// Serve ../index.html with BRIEF_CONFIG.endpoint set to '/api/brief'.
app.use('/*', serveStatic({ root: '../' }));

function isNswPublicHoliday(d: Date) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d);
  return (process.env.NSW_HOLIDAYS || '').split(',').includes(ymd); // e.g. "2026-12-25,2026-12-28,2027-01-01,2027-01-26"
}

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 8080 });
