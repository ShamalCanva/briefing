// Post-synthesis checks. The model is asked to follow these rules; this is where they are enforced.

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import type { Briefing, SourceItem } from './types.js';

const schema = JSON.parse(readFileSync(new URL('../../contract/briefing.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const check = ajv.compile(schema);

export class BriefValidationError extends Error { constructor(msg: string, public problems: string[]) { super(msg); } }

export function validateBriefing(candidate: Briefing, items: SourceItem[]): Briefing {
  const problems: string[] = [];

  if (!check(candidate)) problems.push(...(check.errors ?? []).map((e) => `${e.instancePath} ${e.message}`));

  // Links: every url must be one we fetched. Nothing invented reaches the page.
  const allowed = new Set(items.map((i) => i.url));
  const urls = collectUrls(candidate);
  for (const u of urls) if (!allowed.has(u)) problems.push(`link not from a fetched item: ${u}`);

  // Commitments: the quote must exist, verbatim (whitespace-insensitive), in an item the user wrote.
  const userTexts = items.filter((i) => i.isFromUser).map((i) => squash(i.text));
  for (const t of candidate.todos ?? []) {
    if (t.kind !== 'commitment') continue;
    const q = squash((t.evidence ?? '').replace(/^["“]|["”]$/g, ''));
    if (!q || !userTexts.some((txt) => txt.includes(q))) problems.push(`commitment "${t.title}" has no verifiable quote; downgrade to suggested`);
  }
  if (candidate.push?.kind === 'commitment') {
    // The push card may be a commitment only if a to-do with a verified quote backs it.
    const backed = (candidate.todos ?? []).some((t) => t.kind === 'commitment' && t.title === candidate.push.title);
    if (!backed) problems.push('push is marked commitment without a verified to-do');
  }

  if (problems.length) {
    // Soft-fail policy: downgrade unverifiable commitments, drop bad links, and throw only on schema errors.
    const fixed = structuredClone(candidate);
    fixed.todos = fixed.todos.map((t) => (problems.some((p) => p.includes(`commitment "${t.title}"`)) ? { ...t, kind: 'suggested', evidence: undefined } : t));
    if (problems.some((p) => p.startsWith('push is marked'))) fixed.push.kind = 'suggested';
    stripBadLinks(fixed, allowed);
    if (!check(fixed)) throw new BriefValidationError('Brief failed schema validation', problems);
    return fixed;
  }
  return candidate;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function collectUrls(b: Briefing): string[] {
  const out: string[] = [];
  const src = (s?: { url: string }) => s && out.push(s.url);
  src(b.push?.source); b.push?.relatedSources?.forEach(src);
  b.todos?.forEach((t) => src(t.source));
  b.projects?.forEach((p) => p.updates.forEach(src));
  b.meetings?.forEach((m) => m.links?.forEach(src));
  return out;
}

function stripBadLinks(b: Briefing, allowed: Set<string>) {
  const ok = (s?: { url: string }) => !!s && allowed.has(s.url);
  b.push.relatedSources = b.push.relatedSources?.filter(ok);
  b.projects.forEach((p) => (p.updates = p.updates.filter(ok)));
  b.meetings.forEach((m) => (m.links = m.links?.filter(ok)));
  b.todos = b.todos.filter((t) => ok(t.source));
}
