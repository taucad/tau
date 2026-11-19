/**
 * The push route's answer, read, and joined to the graph the page holds
 * (blueprint A3, client half; I2 step 2).
 *
 * Pure: `parsePushPage` keeps only what the who-resolver uses from one answer
 * of `GET /v1/projects/:projectId/git/pushes`, and `joinPushes` gives each held
 * entry to the first push whose tip reaches it. The store
 * (`lib/revision-pushes`) does the fetch, with the injected API origin and the
 * request id, and keeps the per-account records these run over.
 */

import type { PushEntry, PushPusher } from '#types/revision-push.types.js';

/** The push-read format this client understands (`apps/api` `pushPageFormat`). */
const pushPageFormat = 1;

/** The ref family whose tips are History's branches (`apps/api` `pushTipPrefix`). */
const branchRefPrefix = 'refs/heads/';

/** One member directory entry: an id and a name. @public */
export type PushMember = Readonly<{ accountId: string; name?: string; isMember: boolean }>;

/** What a page of the route answers, as this client keeps it. @public */
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
