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
 */

import { Topic } from '@taucad/events';
import { ENV } from '#environment.config.js';
import { recordApiRequestId } from '#lib/api-request-id.js';

/** The push-read format this client understands (`apps/api` `pushPageFormat`). */
const pushPageFormat = 1;

/** How many pages one refresh reads before leaving the rest to the next refresh point. */
const maximumPagesPerRefresh = 20;

/** The ref family whose tips are History's branches (`apps/api` `pushTipPrefix`). */
const branchRefPrefix = 'refs/heads/';

/** Who pushed, as this viewer may see it: an account, or `anonymous` for a member who is not the owner (Q3). */
export type PushPusher =
  | Readonly<{ kind: 'account'; accountId: string; name?: string }>
  | Readonly<{ kind: 'anonymous' }>;

/** One push record, as a member reads it. @public */
export type PushEntry = Readonly<{
  generation: number;
  pusher: PushPusher;
  /** The owner's read of a push that brought an anonymous commit: the account is shown, marked as recorded anonymously. */
  anonymous?: true;
  /** A host device pushed it on the account's behalf ("by a cloud agent host"). */
  viaDevice: boolean;
  /** The commits the branches it moved now hold. */
  tips: readonly string[];
}>;

/** One member directory entry: an id and a name. */
export type PushMember = Readonly<{ accountId: string; name?: string; isMember: boolean }>;

/** What a page of the route answers, as this client keeps it. */
export type PushPage = Readonly<{ pushes: readonly PushEntry[]; members: readonly PushMember[]; next?: number }>;

/** The mark on the owner's read of a push that brought an anonymous commit. */
const anonymousMark: Pick<PushEntry, 'anonymous'> = { anonymous: true };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const pusherOf = (value: unknown): PushPusher | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value['kind'] === 'anonymous') {
    return { kind: 'anonymous' };
  }
  if (value['kind'] !== 'account' || typeof value['accountId'] !== 'string') {
    return undefined;
  }
  const name = typeof value['name'] === 'string' && value['name'] !== '' ? value['name'] : undefined;
  return { kind: 'account', accountId: value['accountId'], ...(name === undefined ? {} : { name }) };
};

const entryOf = (value: unknown): PushEntry[] => {
  if (!isRecord(value) || typeof value['generation'] !== 'number' || !Array.isArray(value['tips'])) {
    return [];
  }
  const pusher = pusherOf(value['pusher']);
  if (pusher === undefined) {
    return [];
  }
  /* Branch tips only: a chat ref's commits are not History's entries, whatever a server ever lists. */
  const tips = value['tips'].flatMap((tip: unknown) =>
    isRecord(tip) &&
    typeof tip['tip'] === 'string' &&
    typeof tip['ref'] === 'string' &&
    tip['ref'].startsWith(branchRefPrefix)
      ? [tip['tip']]
      : [],
  );
  return [
    {
      generation: value['generation'],
      pusher,
      ...(value['anonymous'] === true && pusher.kind === 'account' ? anonymousMark : {}),
      viaDevice: value['viaDevice'] === true,
      tips,
    },
  ];
};

/**
 * Reads one answer of the push route, keeping only what the resolver uses.
 *
 * Only ids, names and roles are read from the directory: anything else the
 * server ever sent is dropped here, so no address can reach a surface.
 *
 * @param body - The parsed JSON body.
 * @returns The page, or `undefined` for a format this build does not read.
 */
export const parsePushPage = (body: unknown): PushPage | undefined => {
  if (
    !isRecord(body) ||
    body['format'] !== pushPageFormat ||
    !Array.isArray(body['pushes']) ||
    !Array.isArray(body['members'])
  ) {
    return undefined;
  }
  const members = body['members'].flatMap((member: unknown): PushMember[] =>
    isRecord(member) && typeof member['accountId'] === 'string'
      ? [
          {
            accountId: member['accountId'],
            ...(typeof member['name'] === 'string' && member['name'] !== '' ? { name: member['name'] } : {}),
            /* The directory also names accounts a push mentions that are no longer members; those carry no role. */
            isMember: typeof member['role'] === 'string',
          },
        ]
      : [],
  );
  const { next } = body;
  return {
    pushes: body['pushes'].flatMap(entryOf),
    members,
    ...(typeof next === 'number' && Number.isSafeInteger(next) ? { next } : {}),
  };
};

/**
 * The answer of one read, or `notMember` for the route's `404`.
 *
 * @param projectId - The cloud project.
 * @param after - The generation to read after; `0` from the start.
 * @returns The page, or `notMember`.
 * @public
 */
export const fetchPushPage = async (projectId: string, after: number): Promise<PushPage | 'notMember'> => {
  const response = await fetch(
    `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects/${encodeURIComponent(projectId)}/git/pushes?after=${String(after)}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire.
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  if (response.status === 404) {
    return 'notMember';
  }
  if (!response.ok) {
    throw recordApiRequestId(new Error(`Tau Cloud answered ${String(response.status)}`), response);
  }
  const page = parsePushPage(await response.json());
  if (page === undefined) {
    throw recordApiRequestId(new Error('Tau Cloud answered a push page this build does not read'), response);
  }
  return page;
};

/** A commit and the parents it names, as a held row gives them. */
export type HeldRevision = Readonly<{ revisionId: string; parents: readonly string[] }>;

/**
 * Join push records to a graph: each entry belongs to the first push whose tip reaches it.
 *
 * The pushes are taken in ascending generation. For each tip a push moved, the
 * walk follows every parent (a merge's sides too) and gives each entry it has
 * not yet given away to this push. An entry already given away is not walked
 * through again: its ancestry was walked when it was given, so everything
 * behind it is already some earlier push's.
 *
 * @param pushes - The push records, in any order.
 * @param parentsOf - The parents of each held entry, by id; a missing id is not held.
 * @returns The push each reached entry belongs to, by entry id.
 * @public
 */
export const joinPushes = <Push extends Pick<PushEntry, 'generation' | 'tips'>>(
  pushes: readonly Push[],
  parentsOf: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, Push> => {
  const assigned = new Map<string, Push>();
  const ascending = [...pushes].sort((left, right) => left.generation - right.generation);
  for (const push of ascending) {
    const stack = push.tips.filter((tip) => parentsOf.has(tip));
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (assigned.has(id)) {
        continue;
      }
      const parents = parentsOf.get(id);
      if (parents === undefined) {
        continue;
      }
      assigned.set(id, push);
      for (const parent of parents) {
        if (!assigned.has(parent)) {
          stack.push(parent);
        }
      }
    }
  }
  return assigned;
};

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

/** What the resolver reads for one project. @public */
export type PushRecordSnapshot = Readonly<{
  /** The push an entry belongs to, or `undefined` for an entry no held push reaches. */
  pushOf: (revisionId: string) => PushEntry | undefined;
  /** Directory names by account id. */
  nameOf: (accountId: string) => string | undefined;
  /** Whether the account is in the directory at all. */
  isNamed: (accountId: string) => boolean;
  /** Current members of the project. */
  memberCount: number;
}>;

const topic = new Topic<void>({ name: 'revision-pushes' });
const states = new Map<string, PushState>();
/** Parents by id, per project: every row the page has read, whoever reads the pushes. */
const graphs = new Map<string, Map<string, readonly string[]>>();
const snapshots = new Map<string, PushRecordSnapshot | undefined>();

const stateKey = (projectId: string, accountId: string): string => `${accountId}\0${projectId}`;

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
 * @public
 */
export const holdRevisionGraph = (projectId: string, rows: readonly HeldRevision[]): void => {
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
 * @public
 */
export const refreshPushRecords = (
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
  if (state.notMember || (input.token === undefined ? state.read || state.inFlight : state.lastToken === input.token)) {
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
 * @public
 */
export const subscribePushRecords = (listener: () => void): (() => void) => topic.subscribe(listener);

/**
 * The push record one account reads for one project, joined to the rows held.
 *
 * Stable between changes, so a `useSyncExternalStore` reader re-renders only
 * when a push or a row arrives.
 *
 * @param projectId - The project.
 * @param accountId - The signed-in account.
 * @returns The snapshot, or `undefined` before a page has been read, for a non-member, or signed out.
 * @public
 */
export const getPushRecords = (
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

/** Forget every project's records and rows, for tests. @public */
export const resetPushRecords = (): void => {
  states.clear();
  graphs.clear();
  snapshots.clear();
  topic.emit();
};
