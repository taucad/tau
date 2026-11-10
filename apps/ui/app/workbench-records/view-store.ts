/**
 * The view record's store: a shim over `recordSync` (graphics event-driven state charter D6) that keeps the API its
 * callers were written against. Every fact about the record (what was read, what is owed, which writes are this
 * store's own) is in the machine; what is here is the file's two ports and the close fence shared by the owners of
 * one view file.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { workbenchPaths } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { ActorOptions, AnyActorLogic } from 'xstate';
import { isPotentiallyApplied } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { createRecordSync } from '#workbench-records/record-sync.js';
import { createRecordSyncMachine } from '#workbench-records/record-sync.machine.js';
import { viewRecordPolicy } from '#workbench-records/view-record-policy.js';
import type { ViewRecordPatch } from '#workbench-records/view-record-policy.js';

export type { ViewRecordPatch } from '#workbench-records/view-record-policy.js';

type Files = Readonly<{
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  writeFileChecked: (input: {
    path: string;
    data: string;
    preconditions: ReadonlyArray<{
      path: string;
      expected: Uint8Array<ArrayBuffer> | null;
    }>;
  }) => Promise<CheckedFileWriteResult>;
}>;

const closingViews = new Set<string>();
/** One store of a view file: whether it was disposed, and how the close fence stops its machine. */
type ViewOwner = { disposed: boolean; close: () => void };
type ViewLifetime = { owners: Set<WeakRef<ViewOwner>> };
type RetiredViewOwner = { path: string; viewLifetime: ViewLifetime; owner: WeakRef<ViewOwner> };
const viewLifetimes = new Map<string, ViewLifetime>();
const releaseViewOwner = ({ path, viewLifetime, owner }: RetiredViewOwner): void => {
  viewLifetime.owners.delete(owner);
  if (viewLifetime.owners.size === 0 && viewLifetimes.get(path) === viewLifetime) {
    viewLifetimes.delete(path);
  }
};
// Render attempts may be abandoned before effects commit. They own weak tokens only;
// disposal retires immediately, while abandoned construction is cleaned up eventually by GC.
const retiredViewOwners = new FinalizationRegistry<RetiredViewOwner>(releaseViewOwner);
const activeWrites = new Map<string, Set<Promise<CheckedFileWriteResult>>>();

/** Stop a closed view's owners and wait for checked writes before deleting its file. */
export async function fenceClosedView(path: string): Promise<void> {
  closingViews.add(path);
  const owners = viewLifetimes.get(path)?.owners ?? [];
  viewLifetimes.delete(path);
  for (const owner of owners) {
    owner.deref()?.close();
  }
  await Promise.allSettled(activeWrites.get(path) ?? []);
}

/** Release the close fence after checked deletion; new owners get a new lifetime. */
export function finishClosedView(path: string): void {
  closingViews.delete(path);
}

export type ViewRecordState = Readonly<{
  record: WorkbenchView | undefined;
  bytes: Uint8Array<ArrayBuffer> | null;
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string } | undefined;
}>;

/** The view record's `recordSync` machine; every view store runs its own actor of it. */
const viewRecordSyncMachine = createRecordSyncMachine(viewRecordPolicy);

/** Per-view checked writer: person field diffs merge onto fresh bytes after conflicts. */
export function createWorkbenchViewStore(
  input: Readonly<{
    root: string;
    viewId: string;
    files: Files;
    onChange: (state: ViewRecordState, source: 'read' | 'write', locallyAuthored: ViewRecordPatch | undefined) => void;
    onError: (error: unknown) => void;
    onHealth?: (health: RecordHealth) => void;
    /** Milliseconds. */
    editDebounce?: number;
  }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): Readonly<{
  read: (notify?: boolean) => Promise<boolean>;
  /** Fence a pending read as soon as its source changes. */
  invalidateRead: () => void;
  /** *Try again* after reads stopped: a fresh set of attempts. */
  retryRead: () => Promise<boolean>;
  edit: (next: WorkbenchView) => Promise<boolean>;
  ensure: (seed: WorkbenchView, eligible: () => boolean) => Promise<boolean>;
  /** Replace a refused record; `reviewed` is the exact refused bytes the person saw, and a newer file refuses the reset. */
  reset: (next: WorkbenchView, reviewed?: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => ViewRecordState;
  health: () => RecordHealth;
  ready: () => boolean;
}> {
  const path = `${input.root}/${workbenchPaths.view(input.viewId)}`;
  const viewEpoch = viewLifetimes.get(path) ?? { owners: new Set<WeakRef<ViewOwner>>() };
  viewLifetimes.set(path, viewEpoch);
  const ownerToken: ViewOwner = {
    disposed: false,
    close() {
      commands.close();
    },
  };
  const owner = new WeakRef(ownerToken);
  const retirement = { path, viewLifetime: viewEpoch, owner };
  viewEpoch.owners.add(owner);
  retiredViewOwners.register(ownerToken, retirement, ownerToken);
  // Replacement owns its lifetime before a first read; explicit close fences every earlier owner.
  const closed = (): boolean => ownerToken.disposed || closingViews.has(path) || viewLifetimes.get(path) !== viewEpoch;
  /** Whether an `ensure` still wants its file, by the request id its write is asked with. */
  const eligibility = new Map<string, () => boolean>();
  const { actor, commands, context, on } = createRecordSync({
    machine: viewRecordSyncMachine,
    editDebounce: input.editDebounce,
    clock: input.clock,
    inspect: input.inspect,
    onRejectedEvent: input.onRejectedEvent,
    ports: {
      async read() {
        try {
          return { status: 'read', bytes: (await input.files.exists(path)) ? await input.files.readFile(path) : null };
        } catch (error) {
          return { status: 'failed', error };
        } finally {
          // A view that closed while its file was being read publishes nothing: the close reaches the machine first.
          fenced();
        }
      },
      async write({ data, expected, requestId }) {
        if (fenced() || eligibility.get(requestId)?.() === false) {
          return { status: 'ineligible' };
        }
        const operation = input.files.writeFileChecked({ path, data, preconditions: [{ path, expected }] });
        const writes = activeWrites.get(path) ?? new Set<Promise<CheckedFileWriteResult>>();
        writes.add(operation);
        activeWrites.set(path, writes);
        try {
          const result = await operation;
          return result.status === 'conflict' ? { status: 'conflict' } : { status: 'applied', content: result.content };
        } catch (error) {
          return { status: 'failed', error, lost: isPotentiallyApplied(error) };
        } finally {
          writes.delete(operation);
          if (writes.size === 0) {
            activeWrites.delete(path);
          }
        }
      },
    },
  });
  on('published', ({ snapshot, origin, patch }) => {
    if (!fenced()) {
      input.onChange(snapshot, origin === 'own' ? 'write' : 'read', patch);
    }
  });
  on('failed', ({ error }) => {
    input.onError(error);
  });
  on('healthChanged', ({ health }) => {
    input.onHealth?.(health);
  });
  actor.start();
  /**
   * Whether the view is closed. A closed view stops its machine the first time anything asks: `fenceClosedView`
   * closes the owners it can still reach, and this covers the ones it cannot.
   */
  function fenced(): boolean {
    if (closed()) {
      commands.close();
      return true;
    }
    return false;
  }
  return {
    read: async (notify = false) => (fenced() ? false : commands.read(notify)),
    invalidateRead: () => {
      if (!fenced()) {
        commands.invalidate();
      }
    },
    edit: async (next) => (fenced() ? false : commands.edit(next)),
    ensure: async (seed, eligible) => {
      if (fenced()) {
        return false;
      }
      const requestId = commands.nextRequestId();
      eligibility.set(requestId, eligible);
      try {
        // A file that is already there is no reason to say yes to an owner that no longer wants it.
        return (await commands.ensure(seed, requestId)) && eligible();
      } finally {
        eligibility.delete(requestId);
      }
    },
    reset: async (next, reviewed) => {
      const shown = context().published;
      if (fenced() || shown.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      return commands.reset(next, reviewed === undefined ? shown.bytes : reviewed);
    },
    flush: async () => {
      fenced();
      return commands.flush();
    },
    dispose: () => {
      if (ownerToken.disposed) {
        return;
      }
      ownerToken.disposed = true;
      retiredViewOwners.unregister(ownerToken);
      releaseViewOwner(retirement);
      commands.close();
    },
    snapshot: () => context().published,
    health: () => context().health,
    retryRead: async () => (fenced() ? false : commands.retryRead()),
    ready: () => context().origin !== 'none',
  };
}
