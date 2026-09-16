/**
 * The sidebar's selectors (S46, D33, A36, I26).
 *
 * Every glyph the sidebar shows is derived here, from the `sessions`,
 * `project-session`, `chat-session` and `project-revisions` snapshots at read
 * time. Nothing about a row is persisted: the only durable status in the whole
 * surface is the project's per-device unread record, and even that is read off
 * the chat's own `read` region, which `ChatSessionStore` restores from it (D9).
 * The store is its one writer; this module never writes it.
 *
 * Two shapes, on purpose:
 *
 * - `ChatSidebarStatus` is a chat's whole vocabulary and comes from **one**
 *   snapshot, the chat's own machine. The branch and dirty facets ride on it
 *   because `project-session` broadcasts `revisionState` to every chat it owns;
 *   the chat's revision marker reads them, the sidebar does not (v2 D4).
 * - `ProjectSidebarStatus` is the one coalesced object per project (S46) that
 *   the project row and the close dialogs read. It joins the registry's
 *   liveness, its chats' statuses and the worker's `RevisionStatus` projection
 *   — built once per project, never four machine snapshots per row.
 *
 * A row draws one mark and says one sentence (sidebar v2 D1, D2):
 * `selectChatFacts` and `selectProjectFacts` are the only places either is
 * decided, so the glyph and its words cannot drift apart.
 *
 * The selectors are module constants so a row's render is a lookup, and the
 * hooks compare on settled values (P28) so a project with five chats repaints a
 * row when that row moved, not when any of the five did.
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { SnapshotFrom } from 'xstate';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type { ChatSessionActorRef, chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import type { SessionsActorRef } from '#machines/sessions.machine.js';
import { sessionsCloseSuggestions } from '#machines/sessions.machine.js';
import { selectProjectLiveness } from '#services/sessions-store.js';
import type { ProjectLivenessStatus } from '#services/sessions-store.js';
import { peekRevisionClient } from '#hooks/use-revision-status.js';
import { useSessions } from '#hooks/use-sessions.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

/** One chat row's run state — the architecture's agent-state table. @public */
export type ChatSidebarState =
  | 'idle'
  | 'queued'
  | 'working'
  | 'tool'
  | 'approval'
  | 'question'
  | 'reconnecting'
  | 'finishing'
  | 'done'
  | 'failed'
  | 'stopped';

/**
 * Everything a chat row draws, from that chat's own machine.
 *
 * No sync facet (P64): backing up is a *project* fact — `project-session`
 * broadcasts one `revisionState` to every chat it owns, so a chat-level
 * `Backing up` would be the same sentence repeated once per row and a
 * chat-level conflict would multiply one project's attention by its chat count.
 * The project row says it once. A chat keeps the facets that really are its
 * own: the branch its last turn landed on, and whether that tree is dirty.
 *
 * @public
 */
export type ChatSidebarStatus = Readonly<{
  state: ChatSidebarState;
  /** Completed while the person was elsewhere; bold title until `viewed`. */
  unread: boolean;
  /** The tool `Running <tool>` names. */
  toolName: string | undefined;
  pendingApprovalCount: number;
  failureReason: string | undefined;
  /** The branch chip — `undefined` on `main`, so the chip does not exist. */
  branch: string | undefined;
  /** The amber pip on the chip: the tree differs from the head. */
  dirty: boolean;
}>;

/** The one coalesced status object per project (S46). @public */
export type ProjectSidebarStatus = Readonly<{
  session: ProjectLivenessStatus;
  chats: ReadonlyMap<string, ChatSidebarStatus>;
  revisions: RevisionStatusProjection | undefined;
}>;

/** What a project row draws, aggregated from its chats and its session. @public */
export type ProjectSidebarRow = Readonly<{
  projectId: string;
  /**
   * The session's own state. `none` is a closed project (A29); `failed` means
   * the session failed to open and nothing else (v2 D11) — a failed chat is
   * counted in `failed` below, never folded in here.
   */
  glyph: 'none' | 'opening' | 'idle' | 'busy' | 'failed';
  /** The session is closing, backing up first when it has to. */
  closing: boolean;
  /** Chats needing a person, plus one for a sync conflict (R2). */
  attention: number;
  /** A sync conflict: counted in `attention`, named in the sentence (v2 R4). */
  conflicted: boolean;
  /** Failed runs nobody has seen yet (P57). */
  failed: number;
  /** Chats with a run in flight. */
  running: number;
  /** Chats that finished while the person was elsewhere. */
  unread: number;
  /** A policy close's reason, or the closing sentence. */
  detail: string | undefined;
  /** Runs in flight, for the close dialog's question. */
  runs: number;
}>;

/** The group label's live count and its *Close idle* set (v2 D5, D19). @public */
export type LiveNowSummary = Readonly<{
  projects: number;
  /** The *Close idle* set, in the registry's own order. */
  idleProjectIds: readonly string[];
}>;

/**
 * A row's one mark (v2 D2). Opening and closing share `running`'s ring and are
 * told apart by the sentence.
 *
 * @public
 */
export type SidebarMark = 'none' | 'running' | 'attention' | 'unread' | 'failed';

/** What a row draws and says: one mark, an optional count, one sentence. @public */
export type SidebarFacts = Readonly<{
  mark: SidebarMark;
  /** The needs-you count, when there is one to show. */
  count?: number;
  /** The tooltip and the `aria-describedby` text; `undefined` for a plain row. */
  sentence: string | undefined;
}>;

type ChatSnapshot = SnapshotFrom<typeof chatSessionMachine>;

const emptyChats: ReadonlyMap<string, ChatSidebarStatus> = new Map();

const keySeparator = '\u0000';

/*
 * The table, in the table's order.
 *
 * `waiting.approval` before `waiting.input`, and `tool` before `generating`,
 * because that is how the machine's own `always` guards resolve; reading them
 * in another order here would invent a second derivation of the same fact.
 */
const chatRunState = (snapshot: ChatSnapshot): ChatSidebarState => {
  if (snapshot.matches({ run: 'queued' })) {
    return 'queued';
  }
  if (snapshot.matches({ run: { running: { waiting: 'approval' } } })) {
    return 'approval';
  }
  if (snapshot.matches({ run: { running: { waiting: 'input' } } })) {
    return 'question';
  }
  if (snapshot.matches({ run: { running: 'reconnecting' } })) {
    return 'reconnecting';
  }
  if (snapshot.matches({ run: { running: 'tool' } })) {
    return 'tool';
  }
  if (snapshot.matches({ run: { running: 'generating' } })) {
    return 'working';
  }
  if (snapshot.matches({ run: 'finishing' })) {
    return 'finishing';
  }
  if (snapshot.matches({ run: 'done' })) {
    return 'done';
  }
  if (snapshot.matches({ run: 'failed' })) {
    return 'failed';
  }
  return snapshot.matches({ run: 'stopped' }) ? 'stopped' : 'idle';
};

/**
 * One chat row, from one snapshot.
 *
 * @param snapshot - That chat's `chat-session` snapshot.
 * @returns What the row draws.
 * @public
 */
export const selectChatStatus = (snapshot: ChatSnapshot): ChatSidebarStatus => ({
  state: chatRunState(snapshot),
  unread: snapshot.matches({ read: 'unread' }),
  toolName: snapshot.context.toolName,
  pendingApprovalCount: snapshot.context.pendingApprovalCount,
  failureReason: snapshot.context.failureReason,
  /* A29: the chip exists only off `main`, so `main` is not a branch here. */
  branch: snapshot.matches({ revision: { line: 'onBranch' } }) ? snapshot.context.branch : undefined,
  dirty: snapshot.matches({ revision: { tree: 'dirty' } }),
});

/**
 * The row's second line, or `undefined` when the row has nothing to say.
 *
 * The vocabulary is the canvas Legend's, verbatim. It exists only while there
 * is a state to name (A29): an idle chat is a plain row. Sync is not here
 * (P64) — `Backing up` and `Not backed up` are the project row's words.
 *
 * @param status - That chat's status.
 * @returns The line, or `undefined`.
 * @public
 */
export const chatStatusLabel = (status: ChatSidebarStatus): string | undefined => {
  switch (status.state) {
    case 'queued': {
      return 'Queued';
    }
    case 'working': {
      return 'Working…';
    }
    case 'tool': {
      return `Running ${status.toolName ?? 'a tool'}`;
    }
    case 'approval': {
      return `Needs your approval · ${String(status.pendingApprovalCount)}`;
    }
    case 'question': {
      return 'Waiting for you';
    }
    case 'reconnecting': {
      return 'Reconnecting…';
    }
    case 'finishing': {
      return 'Finishing…';
    }
    case 'done': {
      return 'Done';
    }
    case 'failed': {
      return `Failed · ${status.failureReason ?? 'the run failed'}`;
    }
    case 'stopped': {
      return 'Stopped';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * A chat row's mark and sentence (v2 D2): eleven run states and the read flag
 * fold into five marks, and the sentence says which one.
 *
 * @param status - That chat's status.
 * @returns What the row draws and says.
 * @public
 */
export const selectChatFacts = (status: ChatSidebarStatus): SidebarFacts => {
  const sentence = chatStatusLabel(status);
  switch (status.state) {
    case 'queued':
    case 'working':
    case 'tool':
    case 'reconnecting':
    case 'finishing': {
      return { mark: 'running', sentence };
    }
    case 'approval': {
      return { mark: 'attention', count: status.pendingApprovalCount, sentence };
    }
    case 'question': {
      return { mark: 'attention', sentence };
    }
    case 'failed': {
      return { mark: 'failed', sentence };
    }
    case 'done': {
      /* A seen `done` is a plain row: nothing is left to say. */
      return status.unread
        ? { mark: 'unread', sentence: 'Finished while you were away' }
        : { mark: 'none', sentence: undefined };
    }
    default: {
      /* After a reload the run is `idle` and the restored unread record is what
       * says a turn finished unseen (D9), so it reads as an unread `done`. */
      if (status.state === 'idle' && status.unread) {
        return { mark: 'unread', sentence: 'Finished while you were away' };
      }
      /* `stopped` keeps its word (I1); `idle` has none. */
      return { mark: 'none', sentence };
    }
  }
};

/** Whether this chat turns the project row red: a failed run nobody saw (P57). @public */
export const chatFailedUnread = (status: ChatSidebarStatus): boolean => status.state === 'failed' && status.unread;

/** `1 revision` / `2 revisions` — the sidebar's one plural. @public */
export const pluralize = (count: number, noun: string): string => `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * How long the idle policy waited, in the words the closed row uses.
 *
 * The window is the registry's own input, so the row states the real number
 * rather than a sentence that drifts when the policy changes.
 */
const idleCloseText = (idleWindowMilliseconds: number): string =>
  `Closed to save memory · ${String(Math.round(idleWindowMilliseconds / 60_000))} min idle`;

/*
 * I24, and the canvas's own heading: closing is visible, never silent. Backup
 * state otherwise belongs to the Revisions pane (v2 D4); the sidebar names it
 * only while it holds a close up.
 */
const closingDetail = (revisions: RevisionStatusProjection | undefined): string => {
  const pending = revisions?.sync.pendingCount ?? 0;
  return pending > 0 ? `Backing up ${pluralize(pending, 'revision')}, then closing…` : 'Closing…';
};

/*
 * Nothing closes silently (I24): a policy close says why, on the row. A user
 * close said it out loud already, so it says nothing here.
 */
const closedDetail = (
  reason: ProjectLivenessStatus['closedReason'],
  idleWindowMilliseconds: number,
): string | undefined => {
  if (reason === 'idle') {
    return idleCloseText(idleWindowMilliseconds);
  }
  return reason === 'budget' ? 'Closed · memory budget · reopen any time' : undefined;
};

const projectGlyph = (session: ProjectLivenessStatus, running: number): ProjectSidebarRow['glyph'] => {
  if (session.live) {
    if (session.status?.state === 'failed') {
      return 'failed';
    }
    if (session.status?.state === 'opening') {
      return 'opening';
    }
    return running > 0 ? 'busy' : 'idle';
  }
  return 'none';
};

/**
 * The project row, aggregated from the one coalesced object.
 *
 * @param status - That project's coalesced status.
 * @param idleWindowMilliseconds - The registry's idle window, for the reason line.
 * @returns What the project row draws.
 * @public
 */
export const selectProjectRow = (status: ProjectSidebarStatus, idleWindowMilliseconds: number): ProjectSidebarRow => {
  const { session, chats, revisions } = status;
  let attention = 0;
  let running = 0;
  let failed = 0;
  let unread = 0;
  for (const chat of chats.values()) {
    const { mark } = selectChatFacts(chat);
    attention += mark === 'attention' ? 1 : 0;
    running += mark === 'running' ? 1 : 0;
    unread += mark === 'unread' ? 1 : 0;
    failed += chatFailedUnread(chat) ? 1 : 0;
  }
  /* One conflict, counted once (R2). It is the project's checkout that is
   * conflicted, not each of its chats. */
  const conflicted = revisions?.sync.state === 'conflicted';
  const closing = session.live && session.status?.state === 'closing';
  return {
    projectId: session.projectId,
    glyph: projectGlyph(session, running),
    closing,
    attention: attention + (conflicted ? 1 : 0),
    conflicted,
    failed,
    running,
    unread,
    detail: closing
      ? closingDetail(revisions)
      : session.live
        ? undefined
        : closedDetail(session.closedReason, idleWindowMilliseconds),
    runs: session.status?.runs ?? 0,
  };
};

const needsYou = (count: number): string => `${String(count)} need${count === 1 ? 's' : ''} you`;

/*
 * The rollup a collapsed project shows for its chats (v2 D3, I2), in priority
 * order: needs-you > failed > running > finished-while-away.
 */
const chatRollup = (row: ProjectSidebarRow): SidebarFacts | undefined => {
  if (row.attention > 0) {
    return {
      mark: 'attention',
      count: row.attention,
      /* R4: "1 needs you" alone sends the person into the chats to look for a
       * conflict that lives in the checkout, so the sentence names it. */
      sentence: `${needsYou(row.attention)}${row.conflicted ? ' · needs resolution' : ''}`,
    };
  }
  if (row.failed > 0) {
    return { mark: 'failed', sentence: `${pluralize(row.failed, 'chat')} failed` };
  }
  if (row.running > 0) {
    return { mark: 'running', sentence: `${pluralize(row.running, 'agent')} working` };
  }
  return row.unread > 0
    ? { mark: 'unread', sentence: `${pluralize(row.unread, 'chat')} finished while you were away` }
    : undefined;
};

/**
 * A project row's mark and sentence.
 *
 * The session's own facts — failed to open, opening, closing — show whether or
 * not the project is expanded. Its chats' facts roll up only while it is
 * collapsed; expanded, the chat rows carry them (v2 D3). Every sentence says
 * whether the project is live (v2 D12), because its position above *Earlier*
 * is not the only channel (I1).
 *
 * @param row - The project row.
 * @param expanded - Whether its chats are showing.
 * @returns What the row draws and says.
 * @public
 */
export const selectProjectFacts = (row: ProjectSidebarRow, expanded: boolean): SidebarFacts => {
  switch (row.glyph) {
    case 'none': {
      return { mark: 'none', sentence: row.detail ?? 'Closed' };
    }
    case 'failed': {
      return { mark: 'failed', sentence: 'Failed to open' };
    }
    case 'opening': {
      return { mark: 'running', sentence: 'Opening…' };
    }
    default: {
      break;
    }
  }
  if (row.closing) {
    return { mark: 'running', sentence: row.detail };
  }
  const liveness = row.glyph === 'busy' ? 'Live, busy' : 'Live';
  const rollup = expanded ? undefined : chatRollup(row);
  if (rollup === undefined) {
    /* An expanded conflict still names itself: no chat row can carry it. */
    return row.conflicted
      ? { mark: 'attention', sentence: `${liveness} · needs resolution` }
      : { mark: 'none', sentence: liveness };
  }
  return { ...rollup, sentence: `${liveness} · ${rollup.sentence ?? ''}` };
};

// ---------------------------------------------------------------------------
// Reading the actors
// ---------------------------------------------------------------------------

const projectSessionOf = (sessions: SessionsActorRef, projectId: string): ProjectSessionActorRef | undefined =>
  sessions.getSnapshot().context.refs[projectId];

const chatReferencesOf = (
  sessions: SessionsActorRef,
  projectId: string,
): Readonly<Record<string, ChatSessionActorRef>> =>
  projectSessionOf(sessions, projectId)?.getSnapshot().context.chatRefs ?? {};

/**
 * The one coalesced object, built once per project.
 *
 * @param sessions - The registry actor.
 * @param projectId - The project the row is about.
 * @returns That project's coalesced status.
 * @public
 */
export const readProjectStatus = (sessions: SessionsActorRef, projectId: string): ProjectSidebarStatus => {
  const chatReferences = Object.entries(chatReferencesOf(sessions, projectId));
  return {
    session: selectProjectLiveness(sessions.getSnapshot().context, projectId),
    chats:
      chatReferences.length === 0
        ? emptyChats
        : new Map(chatReferences.map(([chatId, ref]) => [chatId, selectChatStatus(ref.getSnapshot())])),
    revisions: peekRevisionClient(projectId)?.status(),
  };
};

/* Settled values only (P28): a row repaints when what it draws moved, never
 * when a sibling's tool name did. */
const chatKey = (status: ChatSidebarStatus | undefined): string =>
  status === undefined ? '' : Object.values(status).join(keySeparator);

/*
 * P66: a dependency array is never a change signal.
 *
 * `useSyncExternalStore` has to return the value the row draws, not a key the
 * row is then re-derived from: React Compiler infers a memo's dependencies from
 * what its callback *reads*, so `useMemo(() => read(), [key, read])` compiles to
 * a cache gated on `read` alone and the row freezes on its first value. The
 * store's snapshot is therefore the row itself, held stable while its settled
 * key is unchanged so React can still bail out of a repaint.
 */
const keep = <T>(cache: { current: { key: string; value: T } | undefined }, key: string, value: T): T => {
  if (cache.current?.key !== key) {
    cache.current = { key, value };
  }
  return cache.current.value;
};

const projectRowKey = (row: ProjectSidebarRow): string => Object.values(row).join(keySeparator);

/*
 * Ponytail: one binder, rebound only when the chat set changes.
 *
 * A sidebar row wakes on its own actors — the registry (a project opened or
 * closed), the project session (a chat spawned, the revision facts moved) and
 * the chat machines it draws. Rebinding on every notification would unsubscribe
 * listeners from inside an emit, so the id list is compared first and the churn
 * happens only when a chat actually appears or goes.
 */
const bindProject = ({
  sessions,
  projectId,
  chatIds,
  listener,
}: {
  readonly sessions: SessionsActorRef;
  readonly projectId: string;
  readonly chatIds?: () => readonly string[];
  readonly listener: () => void;
}): (() => void) => {
  let bound: Array<() => void> = [];
  let boundKey: string | undefined;
  let sessionScan: { unsubscribe: () => void } | undefined;
  const rebind = (): void => {
    const session = projectSessionOf(sessions, projectId);
    const ids = chatIds?.() ?? Object.keys(chatReferencesOf(sessions, projectId));
    /*
     * R3: the revision client is created by the project's route subtree, later
     * than this bind, so its presence has to be in the key or a project row
     * never subscribes to the projection it draws its branch and sync from.
     * R4: `openChat` spawns a *fresh* actor for an id it no longer holds, so
     * ids alone would leave the row bound to a stopped machine — the session id
     * is the identity that changes with the swap.
     */
    const references = chatReferencesOf(sessions, projectId);
    const key = [
      session === undefined ? 'closed' : 'live',
      peekRevisionClient(projectId) === undefined ? 'no-client' : 'client',
      ...ids.map((id) => references[id]?.sessionId ?? id),
    ].join(keySeparator);
    if (key === boundKey) {
      return;
    }
    boundKey = key;
    const previous = bound;
    bound = [];
    if (session !== undefined) {
      const subscription = session.subscribe(listener);
      bound.push(() => {
        subscription.unsubscribe();
      });
      for (const id of ids) {
        const ref = references[id];
        if (ref !== undefined) {
          const chatSubscription = ref.subscribe(listener);
          bound.push(() => {
            chatSubscription.unsubscribe();
          });
        }
      }
    }
    const client = peekRevisionClient(projectId);
    if (client !== undefined) {
      bound.push(client.subscribe(listener));
    }
    for (const off of previous) {
      off();
    }
  };
  /* A chat spawning moves the session's snapshot, not the registry's, so the
   * rebind check rides on the session's own notification too — next microtask,
   * because unsubscribing inside an emit is what the guard above avoids. */
  const watchSession = (): void => {
    sessionScan?.unsubscribe();
    sessionScan = projectSessionOf(sessions, projectId)?.subscribe(() => {
      queueMicrotask(rebind);
    });
  };
  rebind();
  watchSession();
  const registry = sessions.subscribe(() => {
    rebind();
    watchSession();
    listener();
  });
  return () => {
    registry.unsubscribe();
    sessionScan?.unsubscribe();
    for (const off of bound) {
      off();
    }
  };
};

/**
 * One project row, repainted only when the row itself moved.
 *
 * The coalesced object is built here and nowhere else; the row is a pure
 * selector over it, and the subscription's key is the row, so four chats
 * changing tool names do not repaint the project.
 *
 * @param projectId - The project the row is about.
 * @returns What that row draws.
 * @public
 */
export const useProjectSidebarRow = (projectId: string): ProjectSidebarRow => {
  const sessions = useSessions();
  const idleWindow = sessions.getSnapshot().context.idleWindowMilliseconds;
  const subscribe = useCallback(
    (listener: () => void) => bindProject({ sessions, projectId, listener }),
    [projectId, sessions],
  );
  const cache = useRef<{ key: string; value: ProjectSidebarRow } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const row = selectProjectRow(readProjectStatus(sessions, projectId), idleWindow);
    return keep(cache, `${projectId}${keySeparator}${projectRowKey(row)}`, row);
  }, [idleWindow, projectId, sessions]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * One chat row, repainted only when that chat moved.
 *
 * @param projectId - The project that owns the chat.
 * @param chatId - The chat the row is about.
 * @returns What the row draws, or `undefined` when the chat has no machine.
 * @public
 */
export const useChatSidebarStatus = (projectId: string, chatId: string): ChatSidebarStatus | undefined => {
  const sessions = useSessions();
  const chatIds = useCallback(() => [chatId], [chatId]);
  const subscribe = useCallback(
    (listener: () => void) => bindProject({ sessions, projectId, chatIds, listener }),
    [chatIds, projectId, sessions],
  );
  const cache = useRef<{ key: string; value: ChatSidebarStatus | undefined } | undefined>(undefined);
  const getSnapshot = useCallback((): ChatSidebarStatus | undefined => {
    const ref = chatReferencesOf(sessions, projectId)[chatId];
    const status = ref === undefined ? undefined : selectChatStatus(ref.getSnapshot());
    return keep(cache, `${projectId}${keySeparator}${chatId}${keySeparator}${chatKey(status)}`, status);
  }, [chatId, projectId, sessions]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * The group label's live count and its *Close idle* set (v2 D5, D19).
 *
 * Both are registry facts — `sessionsCloseSuggestions` is the one closable
 * policy, in touch order (R9) — so the label wakes on the registry alone.
 *
 * @returns The live count and the *Close idle* set.
 * @public
 */
export const useLiveNow = (): LiveNowSummary => {
  const sessions = useSessions();
  const cache = useRef<{ key: string; value: LiveNowSummary } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const { context } = sessions.getSnapshot();
    const summary = { projects: Object.keys(context.refs).length, idleProjectIds: sessionsCloseSuggestions(context) };
    return keep(cache, [summary.projects, ...summary.idleProjectIds].join(keySeparator), summary);
  }, [sessions]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const subscription = sessions.subscribe(listener);
      return () => {
        subscription.unsubscribe();
      };
    },
    [sessions],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** The verbs a sidebar row's controls send. @public */
export type SidebarCommands = Readonly<{
  /** *Close* on a chat: stop the run, keep the chat and its machine (P63). */
  closeChat: (projectId: string, chatId: string) => void;
  /** *Close* on a project: the user's verb, with the registry's own reason. */
  closeProject: (projectId: string) => void;
  /** Make room, then open what the budget refused. */
  openProject: (projectId: string) => void;
}>;

/**
 * The sidebar's verbs, so a row's controls hold no actor plumbing.
 *
 * Every one of them is an event on a machine that already owns the decision:
 * the chat's own `close`, the registry's `close` and `open`. Nothing here
 * decides anything.
 *
 * @returns The verbs.
 * @public
 */
export const useSidebarCommands = (): SidebarCommands => {
  const sessions = useSessions();
  const chatSessions = useChatSessionStore();
  return useMemo(
    () => ({
      /* Two owners, one verb (P63): the store stops the run — the same
       * `stopRequest` the composer's *Stop* sends — and the chat's machine
       * records that the person stopped it, so the row reads `Stopped` instead
       * of vanishing. */
      closeChat: (projectId, chatId) => {
        chatSessions.stopRun(chatId);
        chatReferencesOf(sessions, projectId)[chatId]?.send({ type: 'close' });
      },
      closeProject: (projectId) => {
        const session = projectSessionOf(sessions, projectId);
        sessions.send({ type: 'close', projectId, reason: 'user' });
        /* This command is called only after the existing close dialog has
         * asked about running agents; idle sessions ignore the confirmation. */
        session?.send({ type: 'confirmClose' });
      },
      openProject: (projectId) => {
        sessions.send({ type: 'open', projectId });
      },
    }),
    [chatSessions, sessions],
  );
};
