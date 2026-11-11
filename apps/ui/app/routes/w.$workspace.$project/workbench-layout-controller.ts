/**
 * The layout record's page contract and its store: a shim over `recordSync` (graphics event-driven state charter D6)
 * that keeps the API the workbench record host was written against. Every fact about the record (what was read, what
 * is owed, which writes are this store's own) is in the machine; what is here is the file's two ports, the digest the
 * host shows, and the eligibility of a running restore.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout, WorkbenchTab } from '@taucad/workbench';
import { workbenchPaths } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { ActorOptions, AnyActorLogic } from 'xstate';
import { digestBytes } from '@taucad/ui-core/utils/crypto.utils';
import { isPotentiallyApplied } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { layoutPolicy } from '#workbench-records/layout-policy.js';
import type { WorkbenchLayoutPatch as PolicyPatch } from '#workbench-records/layout-policy.js';
import { createRecordSync } from '#workbench-records/record-sync.js';
import { createRecordSyncMachine } from '#workbench-records/record-sync.machine.js';
import type { RecordSyncEmitted } from '#workbench-records/record-sync.machine.js';

/** The focused page's applied portable arrangement and any tabs it cannot display. */
export type WorkbenchLayoutSnapshot = Readonly<{
  layout: WorkbenchLayout;
  refused: ReadonlyArray<Readonly<{ tab: WorkbenchTab; reason: 'debug-only' }>>;
  layoutDigest: `sha256:${string}` | 'missing';
  /** Fingerprint of the existing device rollback slot, not call-specific history. */
  restoreTarget?: string;
  restoreUnavailable?: string;
  restoring?: boolean;
}>;

/** Project-scoped page commands. Restore writes the saved projection as an authoritative record edit. */
export type WorkbenchLayoutController = Readonly<{
  snapshot: () => WorkbenchLayoutSnapshot | undefined;
  subscribe: (listener: () => void) => () => void;
  restorePreviousArrangement: (
    expected: Readonly<{ layoutDigest: string; target: string; eligible: () => boolean }>,
  ) => Promise<boolean>;
  registerViewer: (apply: (node: ViewerNode, applied: () => void) => void) => () => void;
  registerWorkbench: (apply: (node: WorkbenchLaneNode, applied: () => void) => void) => () => void;
  personViewerChanged: (node: ViewerNode) => void;
  /**
   * The person changed the workbench arrangement. A change given as a function is applied to the record's arrangement;
   * `unapplied` runs instead when the record cannot take it (its first read failed, or it holds a refused record), so
   * the caller can show the pane another way.
   */
  personWorkbenchChanged: (
    node: WorkbenchLaneNode | ((current: WorkbenchLaneNode) => WorkbenchLaneNode),
    unapplied?: () => void,
  ) => void;
  /**
   * Whether the record's first read has finished. Until then the record's arrangement replaces whatever the workbench
   * shows when it arrives, so a pane opened earlier must be asked for as a change ({@link personWorkbenchChanged} with a
   * function), which is applied on top of the record once it is read.
   */
  ready: () => boolean;
}>;

type LayoutFiles = Readonly<{
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

type LayoutState = Readonly<{
  layout: WorkbenchLayout | undefined;
  bytes: Uint8Array<ArrayBuffer> | null;
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string } | undefined;
  digest: `sha256:${string}` | 'missing';
}>;

/** The trees and lane flags of a layout one person changed. */
export type WorkbenchLayoutPatch = PolicyPatch;

/** The layout record's `recordSync` machine; every layout store runs its own actor of it. */
const layoutRecordSyncMachine = createRecordSyncMachine(layoutPolicy);

/** One tab's checked layout writer. Reads always precede the first person edit. */
export function createWorkbenchLayoutStore(
  input: Readonly<{
    root: string;
    files: LayoutFiles;
    onChange: (state: LayoutState, source: 'read' | 'write', locallyAuthored?: WorkbenchLayoutPatch) => void;
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
  edit: (next: WorkbenchLayout) => Promise<boolean>;
  /**
   * Write a saved arrangement over the one shown, once, while the file's digest is `expectedDigest` and `eligible`
   * holds. Refused while an edit is owed; never rebased over foreign bytes and never retried.
   */
  restore: (next: WorkbenchLayout, expectedDigest: string, eligible: () => boolean) => Promise<boolean>;
  /** Replace a refused record; `reviewed` is the exact refused bytes the person saw, and a newer file refuses the reset. */
  reset: (next: WorkbenchLayout, reviewed?: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => LayoutState;
  health: () => RecordHealth;
  ready: () => boolean;
  intendedLayout: () => WorkbenchLayout | undefined;
}> {
  const path = `${input.root}/${workbenchPaths.layout}`;
  let disposed = false;
  /**
   * What the host was last shown. The digest is computed after the machine publishes, so the state moves when it is
   * known; every command waits for it before it answers. Absence keeps the last layout: it is not an adoption command,
   * and live owners keep their values.
   */
  let state: LayoutState = { layout: undefined, bytes: null, refusal: undefined, digest: 'missing' };
  let published = 0;
  /** Whether the host has been shown a read of the file: the store is ready once it has. */
  let observed = false;
  let shown: Promise<void> = Promise.resolve();
  /** Whether a restore still wants its write, by the request id its write is asked with. */
  const eligibility = new Map<string, () => boolean>();
  const { actor, commands, context, on } = createRecordSync({
    machine: layoutRecordSyncMachine,
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
        }
      },
      async write({ data, expected, requestId }) {
        if (disposed || eligibility.get(requestId)?.() === false) {
          return { status: 'ineligible' };
        }
        try {
          const result = await input.files.writeFileChecked({ path, data, preconditions: [{ path, expected }] });
          return result.status === 'conflict' ? { status: 'conflict' } : { status: 'applied', content: result.content };
        } catch (error) {
          return { status: 'failed', error, lost: isPotentiallyApplied(error) };
        }
      },
    },
  });
  /** Show the host one publication once its digest is known, unless a later one has superseded it. */
  const show = async (
    sequence: number,
    event: Extract<RecordSyncEmitted<WorkbenchLayout, WorkbenchLayoutPatch>, { type: 'published' }>,
  ): Promise<void> => {
    const { snapshot, origin, patch } = event;
    try {
      const digest = snapshot.bytes === null ? 'missing' : await digestBytes(snapshot.bytes);
      if (disposed || sequence !== published) {
        return;
      }
      state = { layout: snapshot.record ?? state.layout, bytes: snapshot.bytes, refusal: snapshot.refusal, digest };
      observed = true;
      input.onChange(state, origin === 'own' ? 'write' : 'read', patch);
    } catch (error) {
      if (!disposed) {
        input.onError(error);
      }
    }
  };
  on('published', (event) => {
    shown = show(++published, event);
  });
  on('failed', ({ error }) => {
    if (!disposed) {
      input.onError(error);
    }
  });
  on('healthChanged', ({ health }) => {
    if (!disposed) {
      input.onHealth?.(health);
    }
  });
  actor.start();
  /** A command's answer, once the host has been shown what it published. */
  const answered = async (answer: Promise<boolean>): Promise<boolean> => {
    const ok = await answer;
    // A publication that superseded the awaited one shows its own state; wait until the latest has been shown.
    let showing: Promise<void>;
    do {
      showing = shown;
      // oxlint-disable-next-line no-await-in-loop -- each pass waits for the publication that is latest now.
      await showing;
    } while (showing !== shown);
    return ok;
  };
  const restorable = (expectedDigest: string, edits: number, eligible: () => boolean): boolean => {
    const current = context();
    return (
      !disposed &&
      current.health.read === 'ok' &&
      state.refusal === undefined &&
      state.digest === expectedDigest &&
      current.edits === edits &&
      current.pending === undefined &&
      current.deferred === undefined &&
      eligible()
    );
  };
  return {
    read: async (notify = false) => (disposed ? false : answered(commands.read(notify))),
    invalidateRead: () => {
      if (!disposed) {
        commands.invalidate();
      }
    },
    retryRead: async () => (disposed ? false : answered(commands.retryRead())),
    edit: async (next) => (disposed ? false : answered(commands.edit(next))),
    restore: async (next, expectedDigest, eligible) => {
      const { edits } = context();
      if (!restorable(expectedDigest, edits, eligible)) {
        return false;
      }
      // Read first: the restore is written only over the bytes the file holds now.
      if (!(await answered(commands.read())) || !restorable(expectedDigest, edits, eligible)) {
        return false;
      }
      const requestId = commands.nextRequestId();
      eligibility.set(requestId, () => restorable(expectedDigest, edits, eligible));
      try {
        return await answered(commands.restore(next, state.bytes, requestId));
      } finally {
        eligibility.delete(requestId);
      }
    },
    reset: async (next, reviewed) => {
      if (disposed || state.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      return answered(commands.reset(next, reviewed === undefined ? state.bytes : reviewed));
    },
    flush: async () => answered(commands.flush()),
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      commands.close();
    },
    snapshot: () => state,
    health: () => context().health,
    ready: () => observed,
    intendedLayout: () => context().intended ?? state.layout,
  };
}
