/**
 * One scriptable stand-in for the page's revision client.
 *
 * Every revision surface reads the same two hooks (`useRevisionStatus` and
 * `useRevisionClient`), so their suites share one harness rather than each
 * re-deriving a client mock — which is how two surfaces end up asserting
 * different shapes of the same projection.
 *
 * @see apps/ui/app/hooks/use-revision-status.ts
 */

import { vi } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type { RevisionDiffEntry, RevisionRow } from '@taucad/revisions';
import type { RevisionToast, RevisionFileComparison } from '#machines/file-manager.worker.revisions.js';

const emptyStatus = (): RevisionStatusProjection => ({
  projectId: 'p',
  checkoutId: 'live',
  checkoutRoot: '/projects/p',
  branch: 'main',
  projectDirty: false,
  dirty: false,
  minting: false,
  headRevisionId: undefined,
  follow: 'chat',
  attention: 0,
  restore: { asking: false, busy: false, removedPathCount: 0, dirty: false, revisionNumber: undefined },
  remote: {
    kind: 'none',
    url: undefined,
    phase: 'none',
    storage: undefined,
    overQuota: [],
    error: undefined,
    fetchOnly: false,
    provider: undefined,
    repositoryId: undefined,
    quota: undefined,
  },
  branches: [{ name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] }],
  branchVerb: { busy: false, asking: false, operation: undefined, branch: undefined, question: undefined },
  publish: { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined },
  sync: {
    state: 'noRemote',
    pendingCount: 0,
    online: true,
    conflictRef: undefined,
    error: undefined,
    reason: undefined,
  },
  conflicts: [],
});

const emptyComparison = (): RevisionFileComparison => ({ original: '', modified: '' });

/** What the scripted client answers, and what the surface under test sent it. */
export const revisionStatusHarness = {
  status: emptyStatus(),
  /* The frame before the worker has answered at all, which a surface must
   * render as nothing rather than as an empty project. */
  connected: true,
  rows: [] as readonly RevisionRow[],
  rowsByBranch: new Map<string, readonly RevisionRow[]>(),
  diff: [] as readonly RevisionDiffEntry[],
  /** Every revision a surface asked for a diff of, in order (C52). */
  diffRequests: [] as string[],
  comparison: emptyComparison(),
  comparisonError: undefined as Error | undefined,
  toasts: new Set<(toast: RevisionToast) => void>(),
  commands: {
    restore: vi.fn<(revisionId: string) => void>(),
    returnToLatest: vi.fn(),
    undo: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    switchTo: vi.fn<(branch: string) => void>(),
    createBranch: vi.fn<(name: string, from?: string) => void>(),
    discardBranch: vi.fn<(branch: string, checkoutId?: string) => void>(),
    mergeBranch: vi.fn<(branch: string) => void>(),
    renameBranch: vi.fn<(branch: string, name: string) => void>(),
    confirmBranch: vi.fn(),
    cancelBranch: vi.fn(),
    resolveFile: vi.fn<(revisionId: string, path: string, side: 'mine' | 'theirs') => void>(),
    openConflictInEditor: vi.fn<(revisionId: string, path: string) => void>(),
    resolveFileInEditor: vi.fn<(revisionId: string, path: string, content: string) => void>(),
    finishResolution: vi.fn<(revisionId: string) => void>(),
    abandonResolution: vi.fn<(revisionId: string) => void>(),
    askChatToResolve: vi.fn<(revisionId: string) => void>(),
    followChat: vi.fn<(chatId: string) => void>(),
    pinTo: vi.fn<(checkoutId: string) => void>(),
    connectRemote: vi.fn<(kind: 'none' | 'tau' | 'git', url?: string) => void>(),
    syncNow: vi.fn(),
    saveRevision: vi.fn<(trigger?: 'save' | 'hidden' | 'close') => void>(),
    tag: vi.fn(),
    deleteTag: vi.fn(),
    publishProject: vi.fn<(tag?: string) => void>(),
    confirmPublish: vi.fn(),
    cancelPublish: vi.fn(),
    resetPublish: vi.fn(),
    disconnectRemote: vi.fn(),
    cancelRemote: vi.fn(),
  },
  reset(): void {
    this.status = emptyStatus();
    this.connected = true;
    this.rows = [];
    this.rowsByBranch.clear();
    this.diff = [];
    this.diffRequests.length = 0;
    this.comparison = emptyComparison();
    this.comparisonError = undefined;
    this.toasts.clear();
    for (const command of Object.values(this.commands)) {
      command.mockClear();
    }
  },
};

/**
 * The module factory `vi.mock('#hooks/use-revision-status.js', …)` returns.
 *
 * @returns The hook surface, backed by {@link revisionStatusHarness}.
 */
export const revisionStatusMock = (): Record<string, unknown> => {
  /* One client object for the whole suite, because the product's
   * `useRevisionClient` is memoized on the worker: a mock that minted a fresh
   * object per render made every downstream `useMemo` miss, which is the very
   * defect B9 exists to catch. */
  const client = {
    status: () => revisionStatusHarness.status,
    subscribe: () => () => undefined,
    subscribeEvents: () => () => undefined,
    subscribeToasts: (listener: (toast: RevisionToast) => void) => {
      revisionStatusHarness.toasts.add(listener);
      return () => revisionStatusHarness.toasts.delete(listener);
    },
    admitTurn: async () => ({ checkoutId: 'live', root: '/projects/p', baseRevisionId: '' }),
    log: async (request?: { readonly branch?: string }) =>
      (request?.branch === undefined ? undefined : revisionStatusHarness.rowsByBranch.get(request.branch)) ??
      revisionStatusHarness.rows,
    diff: async (revisionId: string) => {
      revisionStatusHarness.diffRequests.push(revisionId);
      return revisionStatusHarness.diff;
    },
    compare: async () => {
      if (revisionStatusHarness.comparisonError !== undefined) throw revisionStatusHarness.comparisonError;
      return revisionStatusHarness.comparison;
    },
    send: () => undefined,
    saveRevision: async () => undefined,
    open: () => undefined,
    close: () => undefined,
  };
  return {
    useRevisionStatus: () => (revisionStatusHarness.connected ? revisionStatusHarness.status : undefined),
    useRevisionCommands: () => revisionStatusHarness.commands,
    useRevisionClient: () => client,
  };
};
