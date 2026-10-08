// Persistence interface. Implement with Postgres (pg) — the shape is deliberately small.
// Tables: tokens(user_id, service, ciphertext, iv, updated_at), briefs(user_id, date, json, generated_at),
//         items(user_id, fingerprint, service, first_seen, last_seen, state), actions(...), audit(...)

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Briefing, PendingAction, Service } from './types.js';

export interface Store {
  getToken(userId: string, service: Service): Promise<string | null>;
  putToken(userId: string, service: Service, token: string): Promise<void>;
  deleteToken(userId: string, service: Service): Promise<void>;

  getLatestBrief(userId: string): Promise<Briefing | null>;
  putBrief(userId: string, brief: Briefing): Promise<void>;

  /** Item state across days: 'open' | 'ticked' | 'done' | 'shown'. */
  getItemStates(userId: string, fingerprints: string[]): Promise<Record<string, string>>;
  setItemState(userId: string, fingerprint: string, state: string): Promise<void>;
  lastSuccessfulRun(userId: string): Promise<Date | null>;
  markRun(userId: string, at: Date, ok: boolean): Promise<void>;

  createAction(a: PendingAction): Promise<void>;
  getAction(id: string): Promise<PendingAction | null>;
  updateAction(a: PendingAction): Promise<void>;
  audit(userId: string, event: string, detail: Record<string, unknown>): Promise<void>;
}

/** AES-256-GCM for tokens at rest. Key comes from TOKEN_ENCRYPTION_KEY (32 bytes, base64) in the secret manager. */
export function tokenCrypto(keyB64: string) {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)');
  return {
    encrypt(plain: string) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
    },
    decrypt(blob: string) {
      const b = Buffer.from(blob, 'base64');
      const iv = b.subarray(0, 12), tag = b.subarray(12, 28), ct = b.subarray(28);
      const d = createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    },
  };
}
