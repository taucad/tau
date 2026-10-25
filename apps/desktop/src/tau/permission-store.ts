/**
 * The desktop permission store (blueprint D19, D25, W9): each chat's permission mode and the Settings default, kept by
 * the services host as their one reader and writer.
 *
 * Entries live in a versioned file under the app's user-data directory, keyed by the host-admitted project root plus
 * the chat id, never by a `tau.json`/`.tau/project.json` id, which a copied or hostile project can reuse. A chat with no
 * entry reads Ask whatever the default says; a new chat copies the default only when the desktop seeds it at creation,
 * and its entry goes when the chat is deleted. Every mode change, seed, removal and every mode the shell consults is
 * appended to a durable log beside the file.
 */

import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PermissionMode, ShellOutput } from '@taucad/host';

import { canonicalPath } from '#main/project-roots.js';

/** The file's schema version; any other version reads as empty, so every chat is Ask. */
const storeVersion = 1;
const storeFile = 'permission-modes.json';
const logFile = 'permission-log.jsonl';
/** The log rolls to one previous generation past this size. */
const logBytes = 4 * 1024 * 1024;

/** The store in memory: canonical project root → chat id → mode. Maps, so no id is ever a prototype key. */
type StoreState = {
  defaultMode: PermissionMode;
  chats: Map<string, Map<string, PermissionMode>>;
};

/** One durable log entry. `by: 'person'` is the only writer a mode change has; the model has no path to the store. */
export type PermissionLogEntry =
  | Readonly<{
      event: 'mode-changed';
      scope: 'chat';
      projectRoot: string;
      chatId: string;
      from: PermissionMode;
      to: PermissionMode;
      by: 'person';
    }>
  | Readonly<{ event: 'mode-changed'; scope: 'default'; from: PermissionMode; to: PermissionMode; by: 'person' }>
  | Readonly<{ event: 'chat-seeded'; projectRoot: string; chatId: string; mode: PermissionMode }>
  | Readonly<{ event: 'chat-removed'; projectRoot: string; chatId: string; mode: PermissionMode }>
  | Readonly<{
      event: 'mode-consulted';
      projectRoot: string;
      chatId: string | undefined;
      runId: string;
      mode: PermissionMode;
    }>
  | Readonly<{
      event: 'shell-call';
      projectRoot: string;
      chatId: string | undefined;
      runId: string;
      toolCallId: string;
      /** The mode in force when the call ran: the one the decision recorded, else the chat's. */
      mode: PermissionMode;
      /** Present when the call asked to widen access: who decided, or that the person declined. */
      decision?:
        | Readonly<{ outcome: 'granted'; approvedBy: 'person' | 'bypass' }>
        | Readonly<{ outcome: 'denied'; deniedBy: 'person' }>;
      status: ShellOutput['status'];
    }>;

/** @public */
export type PermissionStore = Readonly<{
  /** The chat's mode; Ask when it has no entry, whatever the default (D25). */
  modeOf: (projectRoot: string, chatId: string) => Promise<PermissionMode>;
  /** The mode new chats copy. Ask out of the box. */
  defaultMode: () => Promise<PermissionMode>;
  /** Copy the default into a chat that has no entry yet; an existing entry is kept. Returns the chat's mode. */
  seed: (projectRoot: string, chatId: string) => Promise<PermissionMode>;
  /** A person's change to one chat, logged with its from/to. Applies from the next call; answers nothing pending. */
  setChatMode: (projectRoot: string, chatId: string, mode: PermissionMode) => Promise<PermissionMode>;
  /** A person's change to the default. Existing chats keep their own mode. */
  setDefaultMode: (mode: PermissionMode) => Promise<PermissionMode>;
  /** Drop a deleted chat's entry, so it never outlives the chat. Returns Ask, what a chat with no entry reads. */
  remove: (projectRoot: string, chatId: string) => Promise<PermissionMode>;
  /** Append one entry to the durable log. Never throws; a log that cannot be written is reported to `onError`. */
  record: (entry: PermissionLogEntry) => Promise<void>;
}>;

/** @public */
export type PermissionStoreOptions = Readonly<{
  /** `<userData>/permissions`. */
  directory: string;
  now?: (() => Date) | undefined;
  /** Diagnostics for a file that could not be read or written. */
  onError?: ((event: string, message: string) => void) | undefined;
}>;

const emptyStore = (): StoreState => ({ defaultMode: 'ask', chats: new Map() });

const isMode = (value: unknown): value is PermissionMode => value === 'ask' || value === 'bypass';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Parse the file strictly: anything unexpected is dropped, never coerced into Bypass. */
const parseStore = (text: string): StoreState | undefined => {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed['version'] !== storeVersion) {
    return undefined;
  }
  const { defaultMode, chats } = parsed;
  const store = emptyStore();
  store.defaultMode = isMode(defaultMode) ? defaultMode : 'ask';
  for (const [root, entries] of Object.entries(isRecord(chats) ? chats : {})) {
    const kept = new Map(
      Object.entries(isRecord(entries) ? entries : {}).filter((entry): entry is [string, PermissionMode] =>
        isMode(entry[1]),
      ),
    );
    if (kept.size > 0) {
      store.chats.set(root, kept);
    }
  }
  return store;
};

const serialise = (store: StoreState): string =>
  `${JSON.stringify(
    {
      version: storeVersion,
      defaultMode: store.defaultMode,
      chats: Object.fromEntries([...store.chats].map(([root, entries]) => [root, Object.fromEntries(entries)])),
    },
    undefined,
    2,
  )}\n`;

/**
 * Open the store. Reads lazily on first use and keeps the file in memory after, because this process is its only
 * writer; writes are serialised and land by rename, so a crash leaves the old file or the new one.
 *
 * @public
 * @param options - Where the store lives.
 * @returns The store.
 */
export const createPermissionStore = (options: PermissionStoreOptions): PermissionStore => {
  const { directory } = options;
  const now = options.now ?? (() => new Date());
  const storePath = join(directory, storeFile);
  const logPath = join(directory, logFile);
  let loaded: Promise<StoreState> | undefined;
  /* One queue for every read-modify-write and log append, so two changes never interleave. */
  let queue: Promise<void> = Promise.resolve();

  const serial = async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = queue;
    const turn = Promise.withResolvers<void>();
    queue = turn.promise;
    try {
      await previous;
      return await work();
    } finally {
      turn.resolve();
    }
  };

  const load = async (): Promise<StoreState> => {
    loaded ??= (async (): Promise<StoreState> => {
      try {
        return parseStore(await readFile(storePath, 'utf8')) ?? emptyStore();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          /* A corrupt file reads as empty: every chat Ask, default Ask. The next change replaces it. */
          options.onError?.('permissions.store-unreadable', error instanceof Error ? error.message : String(error));
        }
        return emptyStore();
      }
    })();
    return loaded;
  };

  const persist = async (store: StoreState): Promise<void> => {
    await mkdir(directory, { recursive: true });
    const temporary = `${storePath}.tmp`;
    await writeFile(temporary, serialise(store), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, storePath);
  };

  const append = async (entry: PermissionLogEntry): Promise<void> => {
    try {
      await mkdir(directory, { recursive: true });
      let size = 0;
      try {
        ({ size } = await stat(logPath));
      } catch {
        /* No log yet. */
      }
      if (size > logBytes) {
        await rename(logPath, `${logPath}.1`);
      }
      await appendFile(logPath, `${JSON.stringify({ at: now().toISOString(), ...entry })}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (error) {
      options.onError?.('permissions.log-unwritable', error instanceof Error ? error.message : String(error));
    }
  };

  const keyOf = (projectRoot: string): string => canonicalPath(projectRoot);

  const read = (store: StoreState, root: string, chatId: string): PermissionMode | undefined =>
    store.chats.get(root)?.get(chatId);

  const entriesOf = (store: StoreState, root: string): Map<string, PermissionMode> => {
    const existing = store.chats.get(root);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, PermissionMode>();
    store.chats.set(root, created);
    return created;
  };

  return {
    modeOf: async (projectRoot, chatId) => read(await load(), keyOf(projectRoot), chatId) ?? 'ask',
    defaultMode: async () => {
      const store = await load();
      return store.defaultMode;
    },
    seed: async (projectRoot, chatId) =>
      serial(async () => {
        const store = await load();
        const root = keyOf(projectRoot);
        const existing = read(store, root, chatId);
        if (existing !== undefined) {
          return existing;
        }
        const mode = store.defaultMode;
        entriesOf(store, root).set(chatId, mode);
        await persist(store);
        await append({ event: 'chat-seeded', projectRoot: root, chatId, mode });
        return mode;
      }),
    setChatMode: async (projectRoot, chatId, mode) =>
      serial(async () => {
        const store = await load();
        const root = keyOf(projectRoot);
        const from = read(store, root, chatId) ?? 'ask';
        entriesOf(store, root).set(chatId, mode);
        await persist(store);
        await append({ event: 'mode-changed', scope: 'chat', projectRoot: root, chatId, from, to: mode, by: 'person' });
        return mode;
      }),
    setDefaultMode: async (mode) =>
      serial(async () => {
        const store = await load();
        const from = store.defaultMode;
        store.defaultMode = mode;
        await persist(store);
        await append({ event: 'mode-changed', scope: 'default', from, to: mode, by: 'person' });
        return mode;
      }),
    remove: async (projectRoot, chatId) =>
      serial(async (): Promise<PermissionMode> => {
        const store = await load();
        const root = keyOf(projectRoot);
        const existing = read(store, root, chatId);
        if (existing === undefined) {
          return 'ask';
        }
        const entries = entriesOf(store, root);
        entries.delete(chatId);
        if (entries.size === 0) {
          store.chats.delete(root);
        }
        await persist(store);
        await append({ event: 'chat-removed', projectRoot: root, chatId, mode: existing });
        return 'ask';
      }),
    record: async (entry) => serial(async () => append(entry)),
  };
};

/**
 * The `permissionModeOf` the desktop hands `probeHostShell` for one project's agent host (D19, D25). The shell service
 * calls it per call, after recall; it resolves the run's chat through the host's own run→chat map, never from model
 * input, reads that chat's entry (Ask when absent or when the run has no chat) and logs the mode it answered.
 *
 * @public
 * @param store - The desktop permission store.
 * @param projectRoot - The host-admitted root the agent host serves.
 * @param chatOfRun - The agent host's run→chat map; undefined for a run it does not know.
 * @returns The per-call mode reader.
 */
export const permissionModeOfRun =
  (
    store: PermissionStore,
    projectRoot: string,
    chatOfRun: (runId: string) => string | undefined,
  ): ((runId: string) => Promise<PermissionMode>) =>
  async (runId) => {
    const chatId = chatOfRun(runId);
    const mode = chatId === undefined ? 'ask' : await store.modeOf(projectRoot, chatId);
    await store.record({ event: 'mode-consulted', projectRoot: canonicalPath(projectRoot), chatId, runId, mode });
    return mode;
  };

/**
 * Record one finished `shell` call in the durable log: the mode in force and, for a widening, who decided (D19).
 * The composition calls it with each call's output.
 *
 * @public
 * @param store - The desktop permission store.
 * @param call - The call's identity and output.
 * @returns Once the entry is appended.
 */
export const recordShellCall = async (
  store: PermissionStore,
  call: Readonly<{
    projectRoot: string;
    chatId: string | undefined;
    runId: string;
    toolCallId: string;
    widened: boolean;
    output: ShellOutput;
  }>,
): Promise<void> => {
  const { output } = call;
  const approval = 'approval' in output ? output.approval : undefined;
  const mode =
    approval?.mode ?? (call.chatId === undefined ? 'ask' : await store.modeOf(call.projectRoot, call.chatId));
  const decision =
    approval === undefined
      ? output.status === 'not-started' && output.code === 'access-denied'
        ? ({ outcome: 'denied', deniedBy: 'person' } as const)
        : undefined
      : ({ outcome: 'granted', approvedBy: approval.approvedBy } as const);
  await store.record({
    event: 'shell-call',
    projectRoot: canonicalPath(call.projectRoot),
    chatId: call.chatId,
    runId: call.runId,
    toolCallId: call.toolCallId,
    mode,
    ...(call.widened && decision !== undefined ? { decision } : {}),
    status: output.status,
  });
};
