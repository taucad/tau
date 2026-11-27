/**
 * Who backed up each entry, read from Tau Cloud's push records and joined to
 * the graph this page holds (blueprint A3, client half; I2 step 2).
 *
 * The server appends a record for every push with the account it
 * authenticated, and `GET /v1/projects/:projectId/git/pushes?after=<generation>`
 * hands a member those records with the branch tips each one moved, plus the
 * project's member directory (ids and names, never an address). An entry
 * belongs to the first push whose tip reaches it: the records are taken oldest
 * first, every tip's ancestry is walked through every parent, and each entry
 * not yet assigned goes to that push. Chat refs never reach the page; the
 * server lists `refs/heads/*` only.
 *
 * One store per account and project, for the session: the page reads only the
 * records after the last generation it holds (`after=`), at the refresh points
 * the History hook already has (the project opening, and each time the backup
 * settles). There is no polling loop. A `404` is the server's answer to an
 * account that is not a member (D27): it resolves nothing and says nothing.
 *
 * The walk covers the rows the page has read. A tip the page has not read
 * cannot be walked, so an entry only that tip reaches stays unassigned and the
 * resolver falls to its later steps. Because a log page holds every ancestor
 * a held row's descendants could reach on the selected line, this matters only
 * for another branch's history that the page never read.
 *
 * The route's parse and the graph join are pure and live in
 * `./revision-push-records`. The API origin is the app's, so it is injected
 * ({@link RevisionPushStoreServices}) and read on every request.
 */

import { Topic } from '@taucad/events';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';
import type { HeldRevision } from '#hooks/use-revisions.js';
import { joinPushes, parsePushPage } from '#lib/revision-push-records.js';
import type { PushMember, PushPage } from '#lib/revision-push-records.js';
import type { PushEntry, PushRecordSnapshot } from '#types/revision-push.types.js';

/**
 * What only the app can give the push store.
 *
 * @public
 */
export type RevisionPushStoreServices = Readonly<{
  /** The API origin, read on every request; a trailing `/` is dropped. */
  apiBaseUrl: () => string;
}>;

/**
 * One push store: the route's read, and every account's records for every project.
 *
 * @public
 */
export type RevisionPushStore = Readonly<{
  /** The answer of one read, or `notMember` for the route's `404`. */
  fetchPushPage: (projectId: string, after: number) => Promise<PushPage | 'notMember'>;
  /** Remember rows the page has read, so their entries can be joined to a push. Idempotent. */
  holdRevisionGraph: (projectId: string, rows: readonly HeldRevision[]) => void;
  /** Read the push records that follow the ones held, at one of the page's refresh points. */
  refreshPushRecords: (input: Readonly<{ projectId: string; accountId: string; token: string | undefined }>) => void;
  /** Subscribe to every change of the store; returns the unsubscribe function. */
  subscribePushRecords: (listener: () => void) => () => void;
  /** The push record one account reads for one project, joined to the rows held. */
  getPushRecords: (projectId: string | undefined, accountId: string | undefined) => PushRecordSnapshot | undefined;
  /** Forget every project's records and rows, for tests. */
  resetPushRecords: () => void;
}>;

/** How many pages one refresh reads before leaving the rest to the next refresh point. */
const maximumPagesPerRefresh = 20;

/** One account's view of one project's push records. */
type PushState = {
  pushes: PushEntry[];
  members: Map<string, PushMember>;
  /** The last generation read; the next read asks for what follows it. */
  after: number;
  /** The route answered `404`: this account is not a member, and nothing resolves. */
  notMember: boolean;
  /** At least one page has been read. */
  read: boolean;
  inFlight: boolean;
  /** A refresh point arrived while a read was in flight. */
  again: boolean;
  lastToken: string | undefined;
};

const stateKey = (projectId: string, accountId: string): string => `${accountId}\0${projectId}`;

/**
 * Make the page's push store over the app's services.
 *
 * The app makes one, so every reader shares one set of records per account and project.
 *
 * @param services - The API origin.
 * @returns The store.
 * @public
 */
export const createRevisionPushStore = (services: RevisionPushStoreServices): RevisionPushStore => {
  /**
   * The answer of one read, or `notMember` for the route's `404`.
   *
   * @param projectId - The cloud project.
   * @param after - The generation to read after; `0` from the start.
   * @returns The page, or `notMember`.
   */
  const fetchPushPage = async (projectId: string, after: number): Promise<PushPage | 'notMember'> => {
    const response = await fetch(
      `${services.apiBaseUrl().replace(/\/$/u, '')}/v1/projects/${encodeURIComponent(projectId)}/git/pushes?after=${String(after)}`,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire.
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (response.status === 404) {
      return 'notMember';
    }
    if (!response.ok) {
      throw recordApiRequestId(new Error(`Couldn’t read this project’s pushes (${String(response.status)})`), response);
    }
    const page = parsePushPage(await response.json());
    if (page === undefined) {
      throw recordApiRequestId(new Error('The push page is in a format this build does not read'), response);
    }
    return page;
  };

  const topic = new Topic<void>({ name: 'revision-pushes' });
  const states = new Map<string, PushState>();
  /** Parents by id, per project: every row the page has read, whoever reads the pushes. */
  const graphs = new Map<string, Map<string, readonly string[]>>();
  const snapshots = new Map<string, PushRecordSnapshot | undefined>();

  const invalidate = (projectId: string): void => {
    for (const key of snapshots.keys()) {
      if (key.endsWith(`\0${projectId}`)) {
        snapshots.delete(key);
      }
    }
    topic.emit();
  };

  /**
   * Remember rows the page has read, so their entries can be joined to a push.
   *
   * Idempotent: rows already held change nothing and notify no one.
   *
   * @param projectId - The project the rows belong to.
   * @param rows - The rows, each with its parents.
   */
  const holdRevisionGraph = (projectId: string, rows: readonly HeldRevision[]): void => {
    let graph = graphs.get(projectId);
    if (graph === undefined) {
      graph = new Map();
      graphs.set(projectId, graph);
    }
    let added = false;
    for (const row of rows) {
      if (!graph.has(row.revisionId)) {
        graph.set(row.revisionId, row.parents);
        added = true;
      }
    }
    if (added) {
      invalidate(projectId);
    }
  };

  const readPages = async (projectId: string, state: PushState): Promise<void> => {
    for (let page = 0; page < maximumPagesPerRefresh; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each page's `after` comes from the one before it.
      const answer = await fetchPushPage(projectId, state.after);
      if (answer === 'notMember') {
        state.notMember = true;
        return;
      }
      state.read = true;
      for (const member of answer.members) {
        state.members.set(member.accountId, member);
      }
      for (const push of answer.pushes) {
        if (push.generation > state.after) {
          state.pushes.push(push);
        }
      }
      const newest = answer.pushes.at(-1)?.generation ?? state.after;
      const after = Math.max(state.after, newest, answer.next ?? 0);
      if (answer.next === undefined || after <= state.after) {
        state.after = after;
        return;
      }
      state.after = after;
    }
  };

  /**
   * Read the push records that follow the ones held, at one of the page's refresh points.
   *
   * Every mounted reader calls it; one read runs at a time per account and
   * project, a token already read is not read again, and a refresh point that
   * arrives during a read runs once more after it. No token asks only for the
   * first read, when the project opens. A failed read keeps what is
   * held and waits for the next refresh point.
   *
   * @param input - The cloud project, the signed-in account and the refresh point's token, if any.
   */
  const refreshPushRecords = (
    input: Readonly<{ projectId: string; accountId: string; token: string | undefined }>,
  ): void => {
    const key = stateKey(input.projectId, input.accountId);
    let state = states.get(key);
    if (state === undefined) {
      state = {
        pushes: [],
        members: new Map(),
        after: 0,
        notMember: false,
        read: false,
        inFlight: false,
        again: false,
        lastToken: undefined,
      };
      states.set(key, state);
    }
    if (
      state.notMember ||
      (input.token === undefined ? state.read || state.inFlight : state.lastToken === input.token)
    ) {
      return;
    }
    if (state.inFlight) {
      state.again = true;
      return;
    }
    if (input.token !== undefined) {
      state.lastToken = input.token;
    }
    state.inFlight = true;
    const held = state;
    // async-iife: bootstrap -- the answer lands in the store and re-renders every reader.
    void (async (): Promise<void> => {
      try {
        await readPages(input.projectId, held);
      } catch {
        /* Offline or refused: what is held stands until the next refresh point. */
        held.lastToken = undefined;
      } finally {
        held.inFlight = false;
        invalidate(input.projectId);
        if (held.again) {
          held.again = false;
          held.lastToken = undefined;
          refreshPushRecords({ ...input, token: `${input.token ?? ''}:again` });
        }
      }
    })();
  };

  /**
   * Subscribe to every change of the push store.
   *
   * @param listener - Called on any change.
   * @returns Unsubscribe.
   */
  const subscribePushRecords = (listener: () => void): (() => void) => topic.subscribe(listener);

  /**
   * The push record one account reads for one project, joined to the rows held.
   *
   * Stable between changes, so a `useSyncExternalStore` reader re-renders only
   * when a push or a row arrives.
   *
   * @param projectId - The project.
   * @param accountId - The signed-in account.
   * @returns The snapshot, or `undefined` before a page has been read, for a non-member, or signed out.
   */
  const getPushRecords = (
    projectId: string | undefined,
    accountId: string | undefined,
  ): PushRecordSnapshot | undefined => {
    if (projectId === undefined || accountId === undefined) {
      return undefined;
    }
    const key = stateKey(projectId, accountId);
    if (snapshots.has(key)) {
      return snapshots.get(key);
    }
    const state = states.get(key);
    if (state === undefined || state.notMember || !state.read) {
      snapshots.set(key, undefined);
      return undefined;
    }
    const joined = joinPushes(state.pushes, graphs.get(projectId) ?? new Map());
    const { members } = state;
    const snapshot: PushRecordSnapshot = {
      pushOf: (revisionId) => joined.get(revisionId),
      nameOf: (id) => members.get(id)?.name,
      isNamed: (id) => members.has(id),
      memberCount: [...members.values()].filter((member) => member.isMember).length,
    };
    snapshots.set(key, snapshot);
    return snapshot;
  };

  /** Forget every project's records and rows, for tests. */
  const resetPushRecords = (): void => {
    states.clear();
    graphs.clear();
    snapshots.clear();
    topic.emit();
  };

  return {
    fetchPushPage,
    holdRevisionGraph,
    refreshPushRecords,
    subscribePushRecords,
    getPushRecords,
    resetPushRecords,
  };
};
