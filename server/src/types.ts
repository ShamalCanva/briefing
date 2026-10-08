// Shared types. `Briefing` mirrors contract/briefing.schema.json exactly; the page renders it unchanged.

export type Service = 'slack' | 'gmail' | 'calendar' | 'drive' | 'github' | 'figma' | 'zoom';
export type Kind = 'commitment' | 'suggested';

export interface SourceRef { service: Service; label: string; url: string }

export interface Briefing {
  sample: boolean;
  date: string;              // YYYY-MM-DD in Australia/Sydney
  generatedAt: string;       // ISO 8601 with offset
  user: { firstName: string };
  intro: string;
  sources: SourceStatus[];
  push: {
    kind: Kind; title: string; why: string; source: SourceRef; relatedSources?: SourceRef[];
    draft: string; draftNote: string;
  };
  todos: Array<{ id: string; kind: Kind; title: string; due: string; why: string; evidence?: string; source: SourceRef }>;
  hidden: Array<{ reason: 'completed' | 'duplicate' | 'stale'; text: string }>;
  projects: Array<{ name: string; meta: string; updates: Array<{ service: Service; text: string; when: string; url: string }> }>;
  updatesNotice?: string;
  meetings: Array<{
    id: string; title: string; start: string; end: string; location: string; attendees: string[];
    optional: boolean; attending?: boolean; context: string; prep: string[]; links?: Array<{ label: string; url: string }>;
  }>;
}

export interface SourceStatus { id: Service; name: string; status: 'live' | 'sample' | 'partial' | 'disconnected' | 'error'; detail?: string }

/** One normalised thing fetched from a provider. The LLM only ever sees these; it never calls a provider itself. */
export interface SourceItem {
  id: string;                // stable per provider (message ts, thread id, event id, PR node id, file version id…)
  service: Service;
  kind: 'message' | 'email' | 'event' | 'file_change' | 'comment' | 'pull_request' | 'issue' | 'review_request' | 'design_version';
  url: string;
  title?: string;
  text: string;              // body, truncated to a sane length by the connector
  author: string;
  timestamp: string;         // ISO
  isFromUser: boolean;       // true when the user wrote it (needed to verify commitments)
  participants?: string[];
  meta?: Record<string, string | number | boolean | null>;
}

export interface CollectWindow { since: Date; until: Date; timeZone: string }

export interface Connector {
  id: Service;
  name: string;
  /** Read-only scopes requested at consent time. Phase 1 has no write scopes anywhere. */
  scopes: readonly string[];
  isConnected(userId: string): Promise<boolean>;
  collect(userId: string, window: CollectWindow): Promise<SourceItem[]>;
}

/** Signals that something previously surfaced is now done, detected from the sources rather than inferred. */
export interface CompletionSignal { itemId: string; how: string }

export interface PendingAction {
  id: string; userId: string; createdAt: string;
  type: 'slack.message' | 'gmail.draft';
  target: string; body: string;
  status: 'pending' | 'confirmed' | 'executed' | 'cancelled';
}
