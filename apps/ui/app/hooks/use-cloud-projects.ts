/**
 * The projects this account can reach on Tau Cloud, and how one is opened here.
 *
 * `GET /v1/projects` is the only place a client learns two facts D27 introduced:
 * which projects are *collaborations* rather than the caller's own, and which
 * role the caller holds on each. Three surfaces read it — the one library
 * (D20), the Sync region's invite gate, and the invitation accept route — so
 * the fetch, the query key and the open gesture live here once rather than
 * three times under three different cache keys.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topic } from '@taucad/events';
import type { RemoteFacet, RevisionStatusProjection } from '@taucad/revisions';
import { ENV } from '#environment.config.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { parseProjectCreationLocation } from '#utils/project-creation-location.utils.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import { toast } from '#components/ui/sonner.js';
import { useRevisionSessionUser } from '#lib/revision-actor.js';
import { KeyedMutex } from '#db/keyed-mutex.js';

/** What this account may do with a project on Tau Cloud (D27). @public */
export type ProjectRole = 'owner' | 'write' | 'read';

/**
 * What a client surface knows about this account's access, losing it included.
 *
 * `revoked` is a *settled* answer: the listing was read and this project was not
 * in it, which is what an owner's revoke looks like to a tab that is still open.
 * `undefined` is "nothing known" — signed out, offline, a failed listing, or a
 * project with no Tau remote to hold a role at all. The two must never collapse,
 * because one folds a surface away and the other says access is gone.
 *
 * @public
 */
export type ProjectAccessRole = ProjectRole | 'revoked';

/**
 * Whether a surface may still offer a push (F1, N1).
 *
 * One fact for the Sync region and the command palette alike: two surfaces
 * deriving "can this person push" from two expressions is how the palette kept
 * an enabled *Sync now* for a read collaborator the region had already folded
 * away.
 *
 * @param remote - The project's remote facet, when a projection exists.
 * @param role - The account's role on the cloud project, when one is known.
 * @returns `true` when a push would be refused, so nothing may offer one.
 * @public
 */
export const isSyncReadOnly = (remote: RemoteFacet | undefined, role: ProjectAccessRole | undefined): boolean =>
  remote?.fetchOnly === true || role === 'read' || role === 'revoked';

/**
 * One row of `GET /v1/projects`, as the client surfaces use it.
 *
 * `updatedAt` (epoch milliseconds) is what the one library (D20) sorts a
 * project this device does not hold by, under *Last Updated*.
 */
export type CloudProject = Readonly<{ id: string; name: string; role: ProjectRole; updatedAt?: number }>;

/** The prefix every listing key starts with, so one invalidation reaches every account's listing. */
export const cloudProjectsQueryKey = ['cloud-projects'] as const;

/**
 * One cache key per account (RV-W11 6): a listing read for one account is never
 * answered to the next one signed in on this device.
 *
 * @param userId - The signed-in account, when there is one.
 * @returns The listing's key.
 * @public
 */
export const cloudProjectsQueryKeyFor = (userId: string | undefined): readonly unknown[] => [
  ...cloudProjectsQueryKey,
  userId ?? null,
];

const isRole = (value: unknown): value is ProjectRole => value === 'owner' || value === 'write' || value === 'read';

const toCloudProject = (value: unknown): CloudProject | undefined => {
  const row = value as Readonly<{ id?: unknown; name?: unknown; role?: unknown; updatedAt?: unknown }>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string') {
    return undefined;
  }
  const updatedAt = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : Number.NaN;
  /* Before D27 this route answered the caller's own projects and nothing else,
     so an absent role means "mine". It is a *label*, never an access decision:
     every collaborator surface it gates is refused again by the API. */
  return {
    id: row.id,
    name: row.name,
    role: isRole(row.role) ? row.role : 'owner',
    ...(Number.isNaN(updatedAt) ? {} : { updatedAt }),
  };
};

/**
 * The caller's projects on Tau Cloud, or none at all.
 *
 * A device that is signed out, offline, or pointed at an API that does not
 * answer gets an empty list rather than an error: these are additions to the
 * library and to the Sync region, never preconditions for reading either.
 *
 * @returns Every project row the API answered with.
 */
export const fetchCloudProjects = async (): Promise<readonly CloudProject[]> => {
  /* Normalised like every other caller of this API (review R6): a deployment
     whose `TAU_API_URL` ends in `/` would otherwise ask for `//v1/projects`. */
  const response = await fetch(`${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects`, {
    credentials: 'include',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire.
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    /* Throwing rather than answering `[]` is what lets a caller tell "you have
       no projects" from "nobody asked" (N1). The library renders no section for
       either; only the role resolver needs the difference, and a silent empty
       list would have told a signed-out tab its access had been revoked. */
    throw new Error(`Tau Cloud answered ${String(response.status)}`);
  }
  const body: unknown = await response.json();
  return Array.isArray(body) ? body.map((entry) => toCloudProject(entry)).filter((entry) => entry !== undefined) : [];
};

/**
 * The shared listing query.
 *
 * @param options - `enabled` gates the request; a project with no Tau remote has
 * no cloud row to read and must not make the library's call on its behalf (N3).
 * @returns The rows, and whether the listing that produced them actually
 * answered — `isSettled` is `false` for a request that is disabled, in flight or
 * failed, and only `true` when the array is the server's own answer. `isFailed`
 * tells the last of those apart: that listing will not answer at all.
 * @public
 */
export const useCloudProjects = (
  options?: Readonly<{ enabled?: boolean; staleTime?: number }>,
): Readonly<{ projects: readonly CloudProject[]; isSettled: boolean; isFailed: boolean; isFetching: boolean }> => {
  const {
    data = [],
    isSuccess,
    isError,
    isFetching,
  } = useQuery({
    queryKey: cloudProjectsQueryKeyFor(useRevisionSessionUser()?.id),
    queryFn: fetchCloudProjects,
    enabled: options?.enabled ?? true,
    /* The set only changes when another device backs something up or an owner
       shares one, and a window focus is when this device is most likely to have
       missed either — which is react-query's `refetchOnWindowFocus` default
       (`true`), left at its default deliberately. The stale window only stops
       rapid navigations re-asking. */
    staleTime: options?.staleTime ?? 30_000,
  });
  return { projects: data, isSettled: isSuccess, isFailed: isError, isFetching };
};

/**
 * This account's access to one cloud project (N1, N3).
 *
 * Separate from the hook in `use-revision-status.ts` that wraps it so the rule
 * can be driven without a revision worker: the caller supplies whether the
 * project is on a Tau remote, which is the only thing that makes a cloud row
 * exist for it.
 *
 * @param projectId - The project being asked about.
 * @param isTauRemote - Whether this project is *connected* to the Tau remote.
 * Connected, not merely chosen: the row is written while connecting, so a
 * listing asked for any earlier races the registration and loses.
 * @returns The role held, `revoked` when a successful listing did not name it,
 * or `undefined` when nothing is known.
 * @public
 */
export const useProjectAccessRole = (projectId: string, isTauRemote: boolean): ProjectAccessRole | undefined => {
  /* Never from the shared cache's stale window: *Connect Tau Cloud* is what
     registers the project, so a listing the library read seconds earlier cannot
     name it, and answering from it told the owner their access was revoked. */
  const { projects, isSettled, isFetching } = useCloudProjects({ enabled: isTauRemote, staleTime: 0 });
  if (!isTauRemote) {
    return undefined;
  }
  const listed = projects.find((project) => project.id === projectId);
  if (listed !== undefined) {
    return listed.role;
  }
  /* Settled and absent is the owner's revoke arriving at an open tab. Unsettled
     and absent is a listing nobody has read yet — or one being re-read right
     now — which says nothing. */
  return isSettled && !isFetching ? 'revoked' : undefined;
};

/**
 * What this device still owes one project's Tau Cloud backup (D19, D20).
 *
 * - `default`: a project born with no remote, whose person has not yet been told
 *   it backs up (D19).
 * - `noticed`: told, with the opt-out beside it (DESIGN: opt-out before
 *   commitment); the only state a default connection is made from.
 * - `connected`: backed up by default; *Where you are* keeps its line and opt-out.
 * - `open`: brought to this device on sign-in (D20); its first open connects Tau
 *   Cloud and pulls, exactly what *Open* does for a cloud-only row. Kept until
 *   the connection lands.
 *
 * Per device and per project, like `githubProjectBinding`: whether a project is
 * backed up is recorded in its own git config once it is, and this is only what
 * happens before then.
 *
 * @public
 */
export type TauCloudIntent = 'default' | 'noticed' | 'connected' | 'open';

const intentKeyPrefix = 'tau:tau-cloud-intent:';
const intentKey = (projectId: string): string => `${intentKeyPrefix}${projectId}`;
const intentTopic = new Topic<void>({ name: 'tau-cloud-intent' });
const isIntent = (value: unknown): value is TauCloudIntent =>
  value === 'default' || value === 'noticed' || value === 'connected' || value === 'open';

/** The per-project intent store. Storage failures read as "nothing owed". @public */
export const tauCloudIntent = Object.freeze({
  get(projectId: string): TauCloudIntent | undefined {
    try {
      const value = globalThis.localStorage.getItem(intentKey(projectId));
      return isIntent(value) ? value : undefined;
    } catch {
      return undefined;
    }
  },
  set(projectId: string, intent: TauCloudIntent | undefined): void {
    try {
      if (intent === undefined) {
        globalThis.localStorage.removeItem(intentKey(projectId));
      } else {
        globalThis.localStorage.setItem(intentKey(projectId), intent);
      }
    } catch {
      // Without storage a new project is simply not backed up by default.
    }
    intentTopic.emit();
  },
  subscribe: (listener: () => void): (() => void) => intentTopic.subscribe(listener),
});

/**
 * One project's intent, live.
 *
 * @param projectId - The project.
 * @returns Its intent, or `undefined` when nothing is owed.
 * @public
 */
export const useTauCloudIntent = (projectId: string): TauCloudIntent | undefined =>
  useSyncExternalStore(
    tauCloudIntent.subscribe,
    () => tauCloudIntent.get(projectId),
    () => undefined,
  );

/** Who is asking, as far as backup by default cares (D19). @public */
export type TauCloudEligibility = Readonly<{
  /** `useResolvedAuth`'s answer. */
  auth: 'authed' | 'anonymous' | 'indeterminate';
  /** Whether the plan is known yet; nothing is decided before it is. */
  isResolved: boolean;
  /** W8's entitlement: closed for Free while the D23 gate is. */
  canSyncFiles: boolean;
}>;

/** What a project's session does about its intent now. @public */
export type TauCloudStep = 'announce' | 'connect' | 'forget' | 'wait';

/**
 * What a project's session does about its intent now.
 *
 * `open` connects for a signed-in account and is forgotten only once Tau Cloud
 * is connected (or another remote was chosen); a failed connect waits for the
 * next open. `default` is first announced — the toast with its opt-out — and a
 * connection is made only from `noticed`, after the first revision, for a
 * signed-in, entitled account. Signed out waits: the project backs up once its
 * person signs in. A plan without backup, or a remote chosen by hand, forgets.
 *
 * @param intent - The project's intent.
 * @param eligibility - The account, as far as it is known.
 * @param status - The project's revision projection, once the root answers.
 * @returns The step.
 * @public
 */
export const nextTauCloudStep = (
  intent: TauCloudIntent | undefined,
  eligibility: TauCloudEligibility,
  status: RevisionStatusProjection | undefined,
): TauCloudStep => {
  if (status === undefined || intent === undefined || intent === 'connected') {
    return 'wait';
  }
  const { remote } = status;
  if (intent === 'open') {
    if (remote.kind === 'git' || (remote.kind === 'tau' && remote.phase === 'connected')) {
      return 'forget';
    }
    return remote.kind === 'none' && remote.phase === 'none' && eligibility.auth === 'authed' ? 'connect' : 'wait';
  }
  if (remote.kind !== 'none') {
    return 'forget';
  }
  if (eligibility.auth !== 'authed' || !eligibility.isResolved) {
    return 'wait';
  }
  if (!eligibility.canSyncFiles) {
    return 'forget';
  }
  if (intent === 'default') {
    return 'announce';
  }
  return status.headRevisionId === undefined ? 'wait' : 'connect';
};

/** The opt-out's consequence, said wherever the opt-out is offered (RV-W11 8). @public */
export const turnOffBackupConsequence = 'Stops backing up. The copy already on Tau Cloud stays.';

/**
 * *Turn off backup*, from the toast or the Revisions pane: one handler, reading
 * the remote as it is now rather than as it was when the offer was drawn.
 *
 * @param projectId - The project.
 * @param remote - The live remote facet, when the root has answered.
 * @param commands - The session's disconnect and cancel verbs.
 * @public
 */
export const turnOffBackupByDefault = (
  projectId: string,
  remote: Pick<RemoteFacet, 'kind' | 'phase'> | undefined,
  commands: Readonly<{ disconnectRemote: () => void; cancelRemote: () => void }>,
): void => {
  tauCloudIntent.set(projectId, undefined);
  if (remote?.kind !== 'tau') {
    return;
  }
  /* A connection still being made is cancelled; one that stands is disconnected. */
  if (remote.phase === 'connecting') {
    commands.cancelRemote();
  } else if (remote.phase !== 'disconnecting') {
    commands.disconnectRemote();
  }
};

/**
 * The account, as far as backup by default cares (D19).
 *
 * @returns The session's answer and W8's entitlement.
 * @public
 */
export const useTauCloudEligibility = (): TauCloudEligibility => {
  const auth = useResolvedAuth();
  const { isResolved, canSyncFiles } = useCommercialFeatures();
  return { auth, isResolved, canSyncFiles };
};

/**
 * Act on a project's intent from inside its session (W11): announce backup by
 * default with its opt-out, connect Tau Cloud through the same verb the
 * `cloudOpen` path sends, or forget the intent.
 *
 * Each step first checks the stored intent is still the one it was drawn for,
 * so a second tab that already moved it on (or turned it off) is not repeated.
 *
 * @param input - The project, its intent, its projection, how to read the
 * remote live, and the session's remote verbs.
 * @public
 */
export const useTauCloudIntentConnection = ({
  projectId,
  intent,
  status,
  readRemote,
  commands,
}: Readonly<{
  projectId: string;
  intent: TauCloudIntent;
  status: RevisionStatusProjection | undefined;
  readRemote: () => Pick<RemoteFacet, 'kind' | 'phase'> | undefined;
  commands: Readonly<{
    connectRemote: (kind: 'tau') => Promise<void>;
    disconnectRemote: () => void;
    cancelRemote: () => void;
  }>;
}>): void => {
  const step = nextTauCloudStep(intent, useTauCloudEligibility(), status);
  /* The toast's action outlives this render; it reads the verbs as they are then. */
  const live = useRef({ readRemote, commands });
  useEffect(() => {
    live.current = { readRemote, commands };
  });
  const { connectRemote } = commands;
  useEffect(() => {
    if (tauCloudIntent.get(projectId) !== intent) {
      return;
    }
    switch (step) {
      case 'forget': {
        tauCloudIntent.set(projectId, undefined);
        return;
      }
      case 'announce': {
        tauCloudIntent.set(projectId, 'noticed');
        toast('Backs up to Tau Cloud automatically after your first save.', {
          description: turnOffBackupConsequence,
          action: {
            label: 'Turn off backup',
            onClick: () => {
              turnOffBackupByDefault(projectId, live.current.readRemote(), live.current.commands);
            },
          },
        });
        return;
      }
      case 'connect': {
        /* `open` is kept until the connection lands; `noticed` becomes `connected` first, so it connects once. */
        if (intent === 'noticed') {
          tauCloudIntent.set(projectId, 'connected');
        }
        void connectRemote('tau');
        break;
      }
      case 'wait': {
        break;
      }
    }
  }, [connectRemote, intent, projectId, step]);
};

/**
 * Whether *Where you are* carries the backup-by-default line, and in which form.
 *
 * `pending` is before the default connection, so the opt-out stays visible
 * before anything leaves the device (DESIGN: first-connect opt-out before
 * commitment); `on` is after the default connection landed.
 *
 * @param intent - The project's intent.
 * @param eligibility - The account, as far as it is known.
 * @param remote - The project's remote facet.
 * @returns The line's form, or `undefined` for no line.
 * @public
 */
export const backupByDefaultNotice = (
  intent: TauCloudIntent | undefined,
  eligibility: TauCloudEligibility,
  remote: RemoteFacet | undefined,
): 'pending' | 'on' | undefined => {
  if (intent === 'connected') {
    return remote?.kind === 'tau' && remote.phase !== 'disconnecting' ? 'on' : undefined;
  }
  return (intent === 'default' || intent === 'noticed') &&
    remote?.kind === 'none' &&
    eligibility.auth === 'authed' &&
    eligibility.isResolved &&
    eligibility.canSyncFiles
    ? 'pending'
    : undefined;
};

const materializeKey = 'tau:materialize-cloud-projects';
const materializedKey = 'tau:materialized-cloud-projects';
const materializeTopic = new Topic<void>({ name: 'materialize-cloud-projects' });

const readMaterializeLocation = (): ProjectCreationLocation | undefined => {
  try {
    const value = globalThis.localStorage.getItem(materializeKey);
    return value === null ? undefined : parseProjectCreationLocation(JSON.parse(value));
  } catch {
    return undefined;
  }
};

/* One cached answer, so `useSyncExternalStore` sees a stable snapshot. */
let materializeLocation = readMaterializeLocation();

/**
 * Where this device brings the account's Tau Cloud projects on sign-in (D20),
 * or `undefined` — the default — for nowhere.
 *
 * One workspace at most: a project is one directory per device, and two
 * workspaces bringing the same id would be a `duplicate-id` conflict.
 *
 * @public
 */
export const materializeOnSignIn = Object.freeze({
  get: (): ProjectCreationLocation | undefined => materializeLocation,
  set(location: ProjectCreationLocation | undefined): void {
    materializeLocation = location;
    try {
      if (location === undefined) {
        globalThis.localStorage.removeItem(materializeKey);
      } else {
        globalThis.localStorage.setItem(materializeKey, JSON.stringify(location));
      }
    } catch {
      // The in-memory choice still applies for this document.
    }
    materializeTopic.emit();
  },
  subscribe: (listener: () => void): (() => void) => materializeTopic.subscribe(listener),
});

const readMaterialized = (): Set<string> => {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage.getItem(materializedKey) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

/**
 * The ids this device has already brought from Tau Cloud (RV-W11 5), so a
 * project deleted here is not brought back on the next library visit.
 *
 * @public
 */
export const materializedCloudProjects = Object.freeze({
  has(projectId: string): boolean {
    return readMaterialized().has(projectId);
  },
  add(projectId: string): void {
    const ids = readMaterialized();
    ids.add(projectId);
    try {
      globalThis.localStorage.setItem(materializedKey, JSON.stringify([...ids]));
    } catch {
      // Without storage the next pass asks again; `createProject` refuses a held id.
    }
  },
});

/* Another tab's writes (RV-W11 7): its intent or setting change reaches this one. */
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(intentKeyPrefix)) {
      intentTopic.emit();
    }
    if (event.key === null || event.key === materializeKey) {
      materializeLocation = readMaterializeLocation();
      materializeTopic.emit();
    }
  });
}

/**
 * The materialize-on-sign-in destination, live.
 *
 * @returns The workspace, or `undefined` when the setting is off.
 * @public
 */
export const useMaterializeOnSignInLocation = (): ProjectCreationLocation | undefined =>
  useSyncExternalStore(materializeOnSignIn.subscribe, materializeOnSignIn.get, () => undefined);

const documentLocks = new KeyedMutex<string>();

/**
 * Run `task` holding a named Web Lock, so two tabs of this origin never run it
 * at once (RV-W11 3). Without the Locks API (a test document, an old engine)
 * it runs under an in-document queue of the same name.
 *
 * @param name - The lock's name.
 * @param task - The work.
 * @returns What the task answered.
 * @public
 */
export const withNamedLock = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks !== undefined) {
    return locks.request(name, task);
  }
  return documentLocks.run(name, task);
};
