// collect → normalise/dedupe → synthesise → validate → store
// Started by the scheduler (POST /jobs/generate) or by the Refresh button (POST /api/refresh). Same code path.

import type { Briefing, Connector, SourceItem, SourceStatus, CompletionSignal } from './types.js';
import type { Store } from './store.js';
import { synthesise } from './synthesise.js';
import { validateBriefing } from './validate.js';

const TZ = process.env.TIMEZONE || 'Australia/Sydney';
const MIN_WINDOW_HOURS = 36;

export async function generateBrief(opts: { userId: string; firstName: string; connectors: Connector[]; store: Store; now?: Date }): Promise<Briefing> {
  const { userId, firstName, connectors, store } = opts;
  const now = opts.now ?? new Date();

  // 1. Collect, tolerating failures per source. A failure becomes a visible status, never a silent gap.
  const last = await store.lastSuccessfulRun(userId);
  const floor = new Date(now.getTime() - MIN_WINDOW_HOURS * 3600_000);
  const since = last && last < floor ? last : floor;
  const window = { since, until: now, timeZone: TZ };

  const items: SourceItem[] = [];
  const sources: SourceStatus[] = [];
  await Promise.all(connectors.map(async (c) => {
    if (!(await c.isConnected(userId))) { sources.push({ id: c.id, name: c.name, status: 'disconnected', detail: 'Not connected.' }); return; }
    try {
      const got = await c.collect(userId, window);
      items.push(...got);
      sources.push({ id: c.id, name: c.name, status: 'live', detail: `${got.length} items since ${since.toISOString()}` });
    } catch (e) {
      sources.push({ id: c.id, name: c.name, status: 'error', detail: `Unavailable: ${(e as Error).message}` });
    }
  }));

  // 2. Dedupe against history and detect completions from signals (not inference).
  const fingerprints = items.map(fp);
  const states = await store.getItemStates(userId, fingerprints);
  const completions = detectCompletions(items);
  const hidden: Briefing['hidden'] = [];
  const fresh = items.filter((it) => {
    const f = fp(it);
    const state = states[f];
    if (state === 'ticked' || state === 'done') { hidden.push({ reason: 'completed', text: summaryLine(it, state === 'ticked' ? 'you ticked it off' : 'detected as done') }); return false; }
    const done = completions.find((c) => c.itemId === it.id);
    if (done) { hidden.push({ reason: 'completed', text: summaryLine(it, done.how) }); return false; }
    return true;
  });
  const { unique, duplicates } = collapseDuplicates(fresh);
  duplicates.forEach((d) => hidden.push({ reason: 'duplicate', text: summaryLine(d, 'same request seen in another source') }));

  // 3. Synthesise with the LLM. It receives data only; it has no tools and cannot act.
  const draft = await synthesise({ items: unique, sources, firstName, now, timeZone: TZ });

  // 4. Validate: schema, link allowlist, commitment quotes. Reject rather than publish something unverifiable.
  const brief = validateBriefing({ ...draft, hidden: [...hidden, ...(draft.hidden ?? [])], sources, sample: false }, unique);

  await store.putBrief(userId, brief);
  for (const it of unique) await store.setItemState(userId, fp(it), states[fp(it)] ?? 'shown');
  await store.markRun(userId, now, true);
  return brief;
}

export const fp = (it: SourceItem) => `${it.service}:${it.id}`;

function summaryLine(it: SourceItem, how: string) {
  const title = (it.title || it.text).replace(/\s+/g, ' ').slice(0, 90);
  return `"${title}" — ${how}.`;
}

/** Done = a concrete signal in the data: your review exists on the PR, your reply exists on the thread, your ✅ on the message. */
function detectCompletions(items: SourceItem[]): CompletionSignal[] {
  const out: CompletionSignal[] = [];
  for (const it of items) {
    if (it.kind === 'review_request' && it.meta?.reviewedByUser) out.push({ itemId: it.id, how: 'you reviewed it on GitHub' });
    if (it.kind === 'email' && it.meta?.userRepliedAt) out.push({ itemId: it.id, how: `you replied at ${it.meta.userRepliedAt}` });
    if (it.kind === 'message' && it.meta?.userReacted === 'white_check_mark') out.push({ itemId: it.id, how: 'you marked it ✅ in Slack' });
  }
  return out;
}

/** Cross-source duplicates: the same ask by email and Slack, or a reminder about an existing item. Cheap heuristic first; the LLM may merge further. */
function collapseDuplicates(items: SourceItem[]) {
  const seen = new Map<string, SourceItem>();
  const duplicates: SourceItem[] = [];
  for (const it of items) {
    const key = normaliseKey(it.title || it.text);
    const prev = seen.get(key);
    if (prev && prev.service !== it.service) duplicates.push(it); else seen.set(key, it);
  }
  return { unique: [...seen.values()], duplicates };
}
const normaliseKey = (s: string) => s.toLowerCase().replace(/^(re|fwd?|reminder):\s*/g, '').replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 8).join(' ');
