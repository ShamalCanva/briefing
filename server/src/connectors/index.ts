// One connector per service. Each declares its read-only scopes and turns provider data into SourceItems.
// collect() bodies are stubs that name the API calls to make; fill them in one service at a time.

import type { Connector, SourceItem, CollectWindow } from '../types.js';
import type { Store } from '../store.js';

type Deps = { store: Store };

const connected = (store: Store, service: Connector['id']) => async (userId: string) => !!(await store.getToken(userId, service));

export const slack = ({ store }: Deps): Connector => ({
  id: 'slack', name: 'Slack',
  // User-token scopes (xoxp). search:read is only available on user tokens, which is why a bot token is not enough.
  scopes: ['search:read', 'channels:history', 'groups:history', 'im:history', 'mpim:history', 'channels:read', 'users:read', 'users:read.email'],
  isConnected: connected(store, 'slack'),
  async collect(userId, w): Promise<SourceItem[]> {
    // const token = await store.getToken(userId, 'slack'); const web = new WebClient(token);
    // 1. search.messages  query: `after:${yyyy-mm-dd(w.since)} to:@me OR @me`          → asks of the user
    // 2. search.messages  query: `after:${…} from:@me`                                   → user's own words (commitments, isFromUser: true)
    // 3. conversations.history for active project channels since w.since                → project updates
    // Map each message to { id: `${channel}:${ts}`, url: permalink (chat.getPermalink), text, author, isFromUser }
    return [];
  },
});

export const gmail = ({ store }: Deps): Connector => ({
  id: 'gmail', name: 'Gmail',
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  isConnected: connected(store, 'gmail'),
  async collect(userId, w): Promise<SourceItem[]> {
    // const auth = googleAuth(await store.getToken(userId, 'google')); const g = google.gmail({ version: 'v1', auth });
    // users.messages.list q: `in:inbox newer_than:2d -category:promotions -category:social`
    // users.messages.list q: `in:sent newer_than:4d`  → isFromUser: true, used for commitments and to detect replies (completion)
    // users.threads.get(format: 'full') → strip quoted replies, truncate to ~2k chars
    // url: https://mail.google.com/mail/u/0/#inbox/${threadId}
    return [];
  },
});

export const calendar = ({ store }: Deps): Connector => ({
  id: 'calendar', name: 'Google Calendar',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  isConnected: connected(store, 'google'),
  async collect(userId, w): Promise<SourceItem[]> {
    // events.list({ calendarId: 'primary', timeMin: startOfDay(w.until, TZ), timeMax: endOfDay, singleEvents: true, orderBy: 'startTime', timeZone: w.timeZone })
    // kind: 'event'; meta: { start, end, optional: attendee.optional || responseStatus === 'needsAction', responseStatus, hangoutLink, location }
    // Also pull events updated since w.since (updatedMin) so "you were added yesterday at 18:10" can be stated.
    return [];
  },
});

export const drive = ({ store }: Deps): Connector => ({
  id: 'drive', name: 'Google Drive',
  scopes: ['https://www.googleapis.com/auth/drive.activity.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
  // Add 'https://www.googleapis.com/auth/documents.readonly' as a separate consent step when meeting prep should read documents.
  isConnected: connected(store, 'google'),
  async collect(userId, w): Promise<SourceItem[]> {
    // driveactivity.activity.query({ filter: `time >= "${w.since.toISOString()}"`, consolidationStrategy: { legacy: {} } })
    // → kind 'file_change' (edit, comment, share) with actor, target file name and link
    // drive.comments.list(fileId, includeDeleted: false) for recently touched files → open comments addressed to the user
    return [];
  },
});

export const github = ({ store }: Deps): Connector => ({
  id: 'github', name: 'GitHub',
  // GitHub App repository permissions: pull_requests:read, issues:read, contents:read, metadata:read; account: notifications:read
  scopes: ['pull_requests:read', 'issues:read', 'contents:read', 'metadata:read', 'notifications:read'],
  isConnected: connected(store, 'github'),
  async collect(userId, w): Promise<SourceItem[]> {
    // const octokit = new Octokit({ auth: userToken });
    // search.issuesAndPullRequests q: `is:pr review-requested:@me is:open`                    → kind 'review_request'
    // search.issuesAndPullRequests q: `involves:@me updated:>=${date(w.since)}`               → updates
    // pulls.listReviews(pr) where reviewer === me                                             → completion signal for review requests
    // activity.listNotificationsForAuthenticatedUser({ since })                               → optional inbox view
    return [];
  },
});

export const figma = ({ store }: Deps): Connector => ({
  id: 'figma', name: 'Figma',
  scopes: ['files:read', 'file_comments:read', 'file_versions:read'],
  isConnected: connected(store, 'figma'),
  async collect(userId, w): Promise<SourceItem[]> {
    // Figma has no activity feed. Keep a watched-file list (config + files the user commented on recently).
    // GET /v1/files/:key/versions  → new versions since w.since (kind 'design_version')
    // GET /v1/files/:key/comments  → new comments / mentions since w.since (kind 'comment', isFromUser when user is author)
    // url: https://www.figma.com/design/${key}?node-id=…
    return [];
  },
});

export const allConnectors = (deps: Deps): Connector[] => [slack(deps), gmail(deps), calendar(deps), drive(deps), github(deps), figma(deps)];
