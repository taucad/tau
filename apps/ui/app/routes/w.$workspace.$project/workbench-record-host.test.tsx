/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable typescript/no-confusing-void-expression -- Testing Library and adapter callbacks assert observable state. */
import type { WatchEvent } from '@taucad/filesystem';
// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workbenchRecords, workbenchPaths } from '@taucad/workbench';
import type { WorkbenchLaneNode, WorkbenchLayout, WorkbenchView } from '@taucad/workbench';
import type { PreviousWorkbenchLayout } from '@taucad/ui-core/types/editor.types';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type * as LayoutControllerModule from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { WorkbenchRecordHost } from '#routes/w.$workspace.$project/workbench-record-host.js';
import { readRecordIssues } from '#workbench-records/record-issues.js';

let fileManager: unknown;
let project: unknown;
let workspace: unknown;
vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => fileManager,
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));
vi.mock('./project-workspace-context.js', () => ({
  useProjectWorkspace: () => workspace,
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
vi.mock('#hooks/use-flush-on-close.js', () => ({
  useFlushOnClose: () => undefined,
}));
/** Every layout store the host builds, and whether it was disposed: one record session per file (I13). */
const layoutStores = vi.hoisted((): Array<{ disposed: boolean }> => []);
vi.mock('./workbench-layout-controller.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LayoutControllerModule>();
  return {
    ...actual,
    createWorkbenchLayoutStore: (...input: Parameters<typeof actual.createWorkbenchLayoutStore>) => {
      const store = actual.createWorkbenchLayoutStore(...input);
      const tracked = { disposed: false };
      layoutStores.push(tracked);
      return {
        ...store,
        dispose: () => {
          tracked.disposed = true;
          store.dispose();
        },
      };
    },
  };
});

const encoder = new TextEncoder();
const first = (): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-abcd1234' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});
const second = (): WorkbenchLayout => ({
  ...first(),
  lanes: { chat: false, workbench: true },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'kernel' }] },
});

const viewSeed = (): WorkbenchView =>
  workbenchRecords.view.schema.parse({
    version: 1,
    entryPath: 'models/other.ts',
    name: 'Other',
  });

function mount(
  options: {
    layout?: WorkbenchLayout;
    previous?: PreviousWorkbenchLayout;
    viewExists?: boolean;
    initialRead?: Promise<void>;
    pendingFirstRead?: Promise<void>;
    failInitialRead?: boolean;
    initialServiceMissing?: boolean;
    branchScenario?: boolean;
    pendingLayoutAck?: Promise<void>;
    onLayoutWriteStarted?: () => void;
    strict?: boolean;
    registerProducer?: (flush: () => Promise<unknown>) => () => void;
  } = {},
) {
  let bytes: Uint8Array<ArrayBuffer> | undefined = encoder.encode(
    workbenchRecords.layout.serialize(options.layout ?? first()),
  );
  let viewBytes: Uint8Array<ArrayBuffer> | undefined =
    options.viewExists === false ? undefined : encoder.encode(workbenchRecords.view.serialize(viewSeed()));
  let liveWatch: (() => void) | undefined;
  let selectedRoot = options.branchScenario ? '/projects/p' : '/root';
  let failNextRead = options.failInitialRead ?? false;
  let firstFileRead = true;
  let controller: WorkbenchLayoutController | undefined;
  let previousLayout = options.previous;
  const editorListeners = new Set<() => void>();
  let desktopLayout = { chatOpen: true, workbenchOpen: true };
  let { pendingLayoutAck } = options;
  const writes = vi.fn(
    async ({
      path,
      data,
      preconditions,
    }: {
      path: string;
      data: string;
      preconditions: ReadonlyArray<{
        expected: Uint8Array<ArrayBuffer> | null;
      }>;
    }) => {
      const current = path.endsWith(workbenchPaths.layout) ? bytes : viewBytes;
      const expected = preconditions[0]?.expected;
      if (
        expected !== null &&
        expected !== undefined &&
        current &&
        (expected.length !== current.length || !expected.every((v, i) => v === current[i]))
      ) {
        return { status: 'conflict', conflicts: [{ path, actual: current }] };
      }
      const next = encoder.encode(data);
      if (path.endsWith(workbenchPaths.layout)) {
        bytes = next;
        const gate = pendingLayoutAck;
        pendingLayoutAck = undefined;
        if (gate) {
          options.onLayoutWriteStarted?.();
          await gate;
        }
      } else {
        viewBytes = next;
      }
      return { status: 'applied', content: next };
    },
  );
  const send = vi.fn((event: { type: string; layout?: PreviousWorkbenchLayout; panelState?: unknown }) => {
    if (event.type === 'setPreviousLayout') {
      previousLayout = event.layout;
      for (const listener of editorListeners) {
        listener();
      }
    }
    if (
      event.type === 'setPanelState' &&
      event.panelState &&
      typeof event.panelState === 'object' &&
      'desktopLayout' in event.panelState
    ) {
      desktopLayout = event.panelState.desktopLayout as typeof desktopLayout;
    }
  });
  const makeService = () => ({ subscribe: () => () => undefined });
  const fileManagerState = {
    fileManagerRef: {
      getSnapshot: () => ({ context: { rootDirectory: selectedRoot } }),
    },
    parameterFiles: {
      exists: async (path: string) => {
        if (path.endsWith(workbenchPaths.layout)) {
          await options.initialRead;
        }
        if (options.branchScenario && !path.startsWith('/projects/p/')) {
          return false;
        }
        return path.endsWith(workbenchPaths.layout) ? bytes !== undefined : viewBytes !== undefined;
      },
      readFile: async (path: string) => {
        if (options.branchScenario && !path.startsWith('/projects/p/')) {
          throw new Error('candidate record read');
        }
        if (firstFileRead && options.pendingFirstRead) {
          firstFileRead = false;
          await options.pendingFirstRead;
          throw new Error('old worker closed');
        }
        if (failNextRead) {
          failNextRead = false;
          throw new Error('offline');
        }
        return path.endsWith(workbenchPaths.layout) ? bytes! : viewBytes!;
      },
      writeFileChecked: writes,
    },
    workbenchFiles: { deleteFileChecked: vi.fn(), writeFileChecked: writes },
    contentService: options.initialServiceMissing ? undefined : makeService(),
    watchRecordFile: (path: string, listener: (event: WatchEvent) => void) => {
      liveWatch = () => listener({ type: 'change', path });
      return {
        ready: Promise.resolve(),
        closed: new Promise<void>(() => {
          /* This watch stays open until fixture disposal. */
        }),
        dispose: () => {
          liveWatch = undefined;
        },
      };
    },
  };
  fileManager = fileManagerState;
  const applied = new Map<string, `sha256:${string}`>();
  const setAppliedWorkbenchRevision = vi.fn((path: string, digest: `sha256:${string}` | undefined) => {
    if (digest) {
      applied.set(path, digest);
    } else {
      applied.delete(path);
    }
  });
  project = {
    projectId: 'p',
    editorRef: {
      subscribe: (listener: (state: unknown) => void) => {
        const notify = () => listener({ context: { previousLayout, panelState: { desktopLayout } } });
        editorListeners.add(notify);
        return { unsubscribe: () => editorListeners.delete(notify) };
      },
      send,
      getSnapshot: () => ({
        context: { previousLayout, panelState: { desktopLayout } },
      }),
    },
    viewRecords: options.viewExists === false ? new Map() : new Map([['v-abcd1234', viewSeed()]]),
    registerWorkbenchRecordProducer: options.registerProducer ?? (() => () => undefined),
    setAppliedWorkbenchRevision,
  };
  workspace = {
    registerLayoutController: (value: WorkbenchLayoutController) => {
      controller = value;
      return () => {
        controller = undefined;
      };
    },
  };
  const rendered = render(<WorkbenchRecordHost />, options.strict ? { wrapper: StrictMode } : undefined);
  return {
    ...rendered,
    get controller() {
      return controller!;
    },
    get bytes() {
      return bytes;
    },
    get viewBytes() {
      return viewBytes;
    },
    set: async (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
      await act(async () => {
        liveWatch?.();
      });
    },
    setLive: async (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
      await act(async () => {
        liveWatch?.();
      });
    },
    selectCheckout: () => {
      selectedRoot = '/checkouts/c';
      rendered.rerender(<WorkbenchRecordHost />);
    },
    failRead: async () => {
      failNextRead = true;
      await act(async () => {
        liveWatch?.();
      });
    },
    readyService: () => {
      fileManagerState.contentService = makeService();
      rendered.rerender(<WorkbenchRecordHost />);
    },
    deleteView: () => {
      viewBytes = undefined;
    },
    get previous() {
      return previousLayout;
    },
    changePrevious: (next: PreviousWorkbenchLayout | undefined) => {
      previousLayout = next;
      for (const listener of editorListeners) {
        listener();
      }
    },
    writes,
    send,
    applied,
    setAppliedWorkbenchRevision,
  };
}

describe('live workbench record host', () => {
  it('should refresh restore availability without changing the layout digest and reject a stale target', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()).toBeDefined());
    const before = host.controller.snapshot()!;
    expect(before.restoreUnavailable).toBe('No previous layout is saved.');
    const changed = vi.fn();
    const unsubscribe = host.controller.subscribe(changed);
    act(() => host.changePrevious({ layout: second(), views: { 'v-abcd1234': viewSeed() } }));
    const ready = host.controller.snapshot()!;
    expect(ready.layoutDigest).toBe(before.layoutDigest);
    expect(ready.restoreUnavailable).toBeUndefined();
    expect(changed).toHaveBeenCalled();
    act(() => host.changePrevious({ layout: first(), views: {} }));
    expect(host.controller.snapshot()?.restoreUnavailable).toContain('has no saved record');
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: ready.layoutDigest,
          target: ready.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(false);
    expect(host.writes).not.toHaveBeenCalled();
    unsubscribe();
    host.unmount();
  });

  it('should admit one restore across callers and retain existing view settings', async () => {
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const host = mount({
      layout: second(),
      previous: { layout: first(), views: { 'v-abcd1234': { ...viewSeed(), name: 'Old' } } },
      pendingLayoutAck: gate.promise,
      onLayoutWriteStarted: () => started.resolve(),
    });
    await waitFor(() => expect(host.controller.snapshot()).toBeDefined());
    const expected = {
      layoutDigest: host.controller.snapshot()!.layoutDigest,
      target: host.controller.snapshot()!.restoreTarget!,
      eligible: () => true,
    };
    let saving: Promise<boolean>;
    await act(async () => {
      saving = host.controller.restorePreviousArrangement(expected);
      await started.promise;
    });
    expect(host.controller.snapshot()?.restoring).toBe(true);
    expect(await host.controller.restorePreviousArrangement(expected)).toBe(false);
    await act(async () => {
      gate.resolve();
      expect(await saving!).toBe(true);
    });
    expect(host.writes).toHaveBeenCalledOnce();
    expect(workbenchRecords.view.read(host.viewBytes!)).toMatchObject({ status: 'current', record: viewSeed() });
    expect(screen.getByRole('status')).toHaveTextContent('Restore written.');
    host.unmount();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the live layout after code switches to a checkout and adopts a live-root edit', async () => {
    const host = mount({ branchScenario: true });
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.selectCheckout();
    });
    await host.setLive(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    expect(host.writes).not.toHaveBeenCalled();
    act(() => {
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group'
          ? {
              ...node,
              tabs: [...node.tabs, { kind: 'pane', pane: 'revisions' }],
            }
          : node,
      );
    });
    await waitFor(
      () => {
        expect(host.writes).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/projects/p/.tau/workbench/layout.json',
          }),
        );
      },
      { timeout: 1600 },
    );
    host.unmount();
  });

  it('does not overwrite an authored layout when a widget emits before its first record read', async () => {
    const gate = Promise.withResolvers<void>();
    const authored = second();
    const host = mount({ layout: authored, initialRead: gate.promise });
    act(() => {
      host.controller.personViewerChanged({ kind: 'group', tabs: [] });
    });
    gate.resolve();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(authored);
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 650);
      });
    });
    expect(host.writes).not.toHaveBeenCalled();
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
      status: 'current',
      record: authored,
    });
    host.unmount();
  });

  it('merges explicit pre-read pane requests onto the authored layout after the first read', async () => {
    const gate = Promise.withResolvers<void>();
    const authored = second();
    const host = mount({ layout: authored, initialRead: gate.promise });
    act(() => {
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group'
          ? {
              ...node,
              tabs: [...node.tabs, { kind: 'pane', pane: 'revisions' }],
            }
          : node,
      );
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'details' }] } : node,
      );
    });
    gate.resolve();
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'kernel' },
            { kind: 'pane', pane: 'revisions' },
            { kind: 'pane', pane: 'details' },
          ],
        });
      },
      { timeout: 1600 },
    );
    expect(host.controller.snapshot()?.layout.viewer).toEqual(authored.viewer);
    host.unmount();
  });

  it('retries an initial IO failure when the service arrives before applying an explicit pane request', async () => {
    const authored = second();
    const host = mount({
      layout: authored,
      failInitialRead: true,
      initialServiceMissing: true,
    });
    // A bounded retry is not a problem yet: the header stays empty.
    await act(async () => undefined);
    expect(readRecordIssues('p')).toEqual([]);
    act(() => {
      host.readyService();
    });
    act(() => {
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group'
          ? {
              ...node,
              tabs: [...node.tabs, { kind: 'pane', pane: 'revisions' }],
            }
          : node,
      );
    });
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'kernel' },
            { kind: 'pane', pane: 'revisions' },
          ],
        });
      },
      { timeout: 1600 },
    );
    expect(host.controller.snapshot()?.layout.viewer).toEqual(authored.viewer);
    host.unmount();
  });

  it.each(['before', 'after'] as const)(
    'carries a pre-read pane request when the old read rejects %s the new read',
    async (order) => {
      const gate = Promise.withResolvers<void>();
      const authored = second();
      const host = mount({
        layout: authored,
        pendingFirstRead: gate.promise,
        initialServiceMissing: true,
      });
      act(() => {
        host.controller.personWorkbenchChanged((node) =>
          node.kind === 'group'
            ? {
                ...node,
                tabs: [...node.tabs, { kind: 'pane', pane: 'revisions' }],
              }
            : node,
        );
      });
      act(() => {
        host.readyService();
      });
      if (order === 'after') {
        await waitFor(() => {
          expect(host.controller.snapshot()?.layout).toEqual(authored);
        });
      }
      gate.reject(new Error('old worker closed'));
      await waitFor(
        () => {
          expect(host.controller.snapshot()?.layout.workbench).toEqual({
            kind: 'group',
            tabs: [
              { kind: 'pane', pane: 'kernel' },
              { kind: 'pane', pane: 'revisions' },
            ],
          });
        },
        { timeout: 1600 },
      );
      expect(host.controller.snapshot()?.layout.viewer).toEqual(authored.viewer);
      host.unmount();
    },
  );

  it('reapplies identical layout bytes after an IO error without writing a watcher echo', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const apply = vi.fn((_node, applied: () => void) => {
      applied();
    });
    act(() => {
      host.controller.registerViewer(apply);
      host.controller.registerWorkbench(apply);
    });
    expect(host.applied.has(workbenchPaths.layout)).toBe(true);
    await host.failRead();
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    expect(readRecordIssues('p')).toEqual([]);
    const priorApplications = apply.mock.calls.length;
    await host.set(host.bytes!);
    await waitFor(() => {
      expect(host.applied.has(workbenchPaths.layout)).toBe(true);
    });
    await waitFor(() => {
      expect(readRecordIssues('p')).toEqual([]);
    });
    expect(apply.mock.calls.length).toBeGreaterThan(priorApplications);
    expect(host.writes).not.toHaveBeenCalled();
    host.unmount();
  });

  it('keeps rapid pre-adapter pane requests in the intended layout until the adapter mounts', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group'
          ? {
              ...node,
              tabs: [...node.tabs, { kind: 'pane', pane: 'revisions' }],
            }
          : node,
      );
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'details' }] } : node,
      );
    });
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'parameters' },
            { kind: 'pane', pane: 'revisions' },
            { kind: 'pane', pane: 'details' },
          ],
        });
      },
      { timeout: 1500 },
    );
    const apply = vi.fn((_node, applied: () => void) => {
      applied();
    });
    act(() => {
      host.controller.registerWorkbench(apply);
    });
    expect(apply).toHaveBeenCalledExactlyOnceWith(host.controller.snapshot()?.layout.workbench, expect.any(Function));
    host.unmount();
  });

  it('seeds a workbench adapter that mounts before a pending pane request is written with that request', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'share' }] } : node,
      );
    });
    const apply = vi.fn((_node, applied: () => void) => {
      applied();
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => {
        applied();
      });
      host.controller.registerWorkbench(apply);
    });
    // The shown arrangement is not the stored record yet, so the stored digest is not reported as applied.
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    const requested = {
      kind: 'group',
      tabs: [
        { kind: 'pane', pane: 'parameters' },
        { kind: 'pane', pane: 'share' },
      ],
    };
    expect(host.writes).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledExactlyOnceWith(requested, expect.any(Function));
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual(requested);
      },
      { timeout: 1500 },
    );
    await waitFor(() => {
      expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    });
    host.unmount();
  });

  it('shows a pane asked for before the first read on a workbench that mounted before the read', async () => {
    const gate = Promise.withResolvers<void>();
    const host = mount({ initialRead: gate.promise });
    const shown: unknown[] = [];
    const apply = vi.fn((node: unknown, applied: () => void) => {
      shown.push(node);
      applied();
    });
    act(() => {
      host.controller.registerWorkbench(apply);
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'share' }] } : node,
      );
    });
    gate.resolve();
    await waitFor(() => {
      expect(shown).not.toHaveLength(0);
    });
    await act(async () => undefined);
    // The mounted workbench reports what it shows on its next change (here a file opening) before the debounced pane
    // request is written: what it shows must already hold the pane, or that report replaces the request.
    const showing = shown.at(-1) as WorkbenchLaneNode;
    act(() => {
      host.controller.personWorkbenchChanged(
        showing.kind === 'group' ? { ...showing, tabs: [...showing.tabs, { kind: 'pane', pane: 'details' }] } : showing,
      );
    });
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'parameters' },
            { kind: 'pane', pane: 'share' },
            { kind: 'pane', pane: 'details' },
          ],
        });
      },
      { timeout: 1600 },
    );
    host.unmount();
  });

  it('shows a pane requested before the read together with the read, so the read cannot replace it', async () => {
    const gate = Promise.withResolvers<void>();
    const host = mount({ initialRead: gate.promise });
    const shown: unknown[] = [];
    const apply = vi.fn((node: unknown, applied: () => void) => {
      shown.push(node);
      applied();
    });
    act(() => {
      host.controller.registerWorkbench(apply);
      host.controller.personWorkbenchChanged((node) =>
        node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'share' }] } : node,
      );
    });
    gate.resolve();
    const requested = {
      kind: 'group',
      tabs: [
        { kind: 'pane', pane: 'parameters' },
        { kind: 'pane', pane: 'share' },
      ],
    };
    await waitFor(
      () => {
        expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ record: { workbench: requested } });
      },
      { timeout: 1600 },
    );
    // The mounted workbench is never handed the saved arrangement without the pane, so nothing applied late can
    // leave it showing that.
    expect(shown).toEqual([requested]);
    host.unmount();
  });

  it('hands a pane request back when the first read fails', async () => {
    const host = mount({ failInitialRead: true });
    const unapplied = vi.fn();
    act(() => {
      host.controller.personWorkbenchChanged(
        (node) => (node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'share' }] } : node),
        unapplied,
      );
    });
    await waitFor(() => {
      expect(unapplied).toHaveBeenCalledOnce();
    });
    host.unmount();
  });

  it('hands a pane request back and shows only the stored arrangement while the record is refused', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    await host.set(encoder.encode('{"version":2}'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    const unapplied = vi.fn();
    act(() => {
      host.controller.personWorkbenchChanged({ kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] });
      host.controller.personWorkbenchChanged(
        (node) => (node.kind === 'group' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane: 'share' }] } : node),
        unapplied,
      );
    });
    expect(unapplied).toHaveBeenCalledOnce();
    const apply = vi.fn((_node, applied: () => void) => {
      applied();
    });
    act(() => {
      host.controller.registerWorkbench(apply);
    });
    expect(apply).toHaveBeenCalledExactlyOnceWith(first().workbench, expect.any(Function));
    host.unmount();
  });

  it('re-announces each distinct foreign adoption exactly once and ignores a byte-equal echo', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const initial = screen.getByRole('status').firstChild;
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    const secondAnnouncement = screen.getByRole('status').firstChild;
    expect(secondAnnouncement).not.toBe(initial);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await host.set(encoder.encode(workbenchRecords.layout.serialize(first())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const thirdAnnouncement = screen.getByRole('status').firstChild;
    expect(thirdAnnouncement).not.toBe(secondAnnouncement);
    await host.set(encoder.encode(workbenchRecords.layout.serialize(first())));
    expect(screen.getByRole('status').firstChild).toBe(thirdAnnouncement);
    host.unmount();
  });

  it('should leave the viewer adapter untouched when only the workbench lane changes', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const viewer = vi.fn((_node, applied: () => void) => applied());
    const workbench = vi.fn((_node, applied: () => void) => applied());
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    viewer.mockClear();
    workbench.mockClear();
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    expect(viewer).not.toHaveBeenCalled();
    expect(workbench).toHaveBeenCalledOnce();
    expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    host.unmount();
  });

  it('should not replay a watched local layout write over a newer live pane edit before acknowledgement', async () => {
    const started = Promise.withResolvers<void>();
    const ack = Promise.withResolvers<void>();
    const host = mount({
      pendingLayoutAck: ack.promise,
      onLayoutWriteStarted: started.resolve,
    });
    try {
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
      const apply = vi.fn((_node, applied: () => void) => applied());
      act(() => {
        host.controller.registerViewer(apply);
        host.controller.registerWorkbench(apply);
      });
      const a: WorkbenchLayout['workbench'] = {
        kind: 'group',
        tabs: [{ kind: 'pane', pane: 'revisions' }],
      };
      const b: WorkbenchLayout['workbench'] = {
        kind: 'group',
        tabs: [{ kind: 'pane', pane: 'details' }],
      };
      act(() => host.controller.personWorkbenchChanged(a));
      await started.promise;
      act(() => host.controller.personWorkbenchChanged(() => b));
      apply.mockClear();
      await host.setLive(host.bytes!);
      await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(a));
      expect(apply).not.toHaveBeenCalledWith(a, expect.any(Function));
    } finally {
      ack.resolve();
      host.unmount();
    }
  });

  it('should keep a newer live viewer edit when a foreign lane change retains the old viewer tree', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const viewer = vi.fn((_node, applied: () => void) => {
      applied();
    });
    const workbench = vi.fn((_node, applied: () => void) => {
      applied();
    });
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    const edited: WorkbenchLayout['viewer'] = { kind: 'group', tabs: [] };
    act(() => {
      host.controller.personViewerChanged(edited);
    });
    viewer.mockClear();
    await host.setLive(
      encoder.encode(
        workbenchRecords.layout.serialize({
          ...first(),
          lanes: { chat: false, workbench: true },
        }),
      ),
    );
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout.lanes.chat).toBe(false);
    });
    expect(viewer).not.toHaveBeenCalled();
    expect(host.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setPanelState',
        panelState: { desktopLayout: { chatOpen: false, workbenchOpen: true } },
      }),
    );
    host.unmount();
  });

  it('acknowledges layout bytes only after both adapters apply and rejects stale callbacks', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const viewerCallbacks: Array<() => void> = [];
    const workbenchCallbacks: Array<() => void> = [];
    host.controller.registerViewer((_node, applied) => {
      viewerCallbacks.push(applied);
    });
    expect(host.applied.has(workbenchPaths.layout)).toBe(false); // Mobile editor drawer may not be mounted yet.
    host.controller.registerWorkbench((_node, applied) => {
      workbenchCallbacks.push(applied);
    });
    viewerCallbacks.at(-1)?.();
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    workbenchCallbacks.at(-1)?.();
    expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    const staleWorkbench = workbenchCallbacks.at(-1)!;
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    viewerCallbacks.at(-1)?.();
    staleWorkbench();
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    workbenchCallbacks.at(-1)?.();
    expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    const staleViewer = viewerCallbacks.at(-1)!;
    await host.set(encoder.encode('{bad'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    staleViewer();
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    host.unmount();
    workbenchCallbacks.at(-1)?.();
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
  });

  it('adopts one arrangement without stealing focus, reports refused debug panes, and restores prior bytes', async () => {
    const host = mount();
    const editor = document.createElement('button');
    document.body.append(editor);
    editor.focus();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const adoptViewer = vi.fn();
    const adoptWorkbench = vi.fn();
    const unsubViewer = host.controller.registerViewer(adoptViewer);
    const unsubWorkbench = host.controller.registerWorkbench(adoptWorkbench);
    const changed = vi.fn();
    const unsubscribe = host.controller.subscribe(changed);
    await host.set(encoder.encode(JSON.stringify(second(), null, 2)));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    expect(host.controller.snapshot()?.refused).toEqual([
      { tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' },
    ]);
    expect(host.controller.snapshot()?.layoutDigest).toMatch(/^sha256:/u);
    expect(adoptViewer).toHaveBeenCalledWith(second().viewer, expect.any(Function));
    expect(adoptWorkbench).toHaveBeenCalledWith(second().workbench, expect.any(Function));
    expect(document.activeElement).toBe(editor);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Workbench arrangement updated.');
    expect(changed).toHaveBeenCalled();
    expect(host.send).toHaveBeenCalledWith({
      type: 'setPreviousLayout',
      layout: { layout: first(), views: { 'v-abcd1234': viewSeed() } },
    });
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: host.controller.snapshot()!.layoutDigest,
          target: host.controller.snapshot()!.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(true);
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
      status: 'current',
      record: first(),
    });
    expect(host.writes).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubViewer();
    unsubWorkbench();
    editor.remove();
    host.unmount();
  });

  it('clears the reactive snapshot for invalid/newer bytes and offers Reset only for invalid bytes', async () => {
    // Offered through the settings trigger: the host publishes the issue and renders no page text.
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const changed = vi.fn();
    host.controller.subscribe(changed);
    await host.set(encoder.encode('{broken'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    expect(changed).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(readRecordIssues('p')).toMatchObject([{ kind: 'layout', state: 'invalid' }]);
    });
    await host.set(encoder.encode('{"version":2}'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    await waitFor(() => {
      expect(readRecordIssues('p')).toMatchObject([{ kind: 'layout', state: 'newer' }]);
    });
    expect(host.writes).not.toHaveBeenCalled();
    host.unmount();
  });

  it('recreates the closed non-main view from its device rollback seed before Restore', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    host.deleteView();
    const closed: WorkbenchLayout = {
      ...first(),
      viewer: { kind: 'group', tabs: [] },
    };
    await host.set(encoder.encode(workbenchRecords.layout.serialize(closed)));
    await waitFor(() => {
      expect(host.previous?.layout).toEqual(first());
    });
    expect(host.viewBytes).toBeUndefined();
    expect(host.writes).not.toHaveBeenCalled();
    expect(host.previous?.views['v-abcd1234']?.entryPath).toBe('models/other.ts');
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: host.controller.snapshot()!.layoutDigest,
          target: host.controller.snapshot()!.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(true);
    expect(workbenchRecords.view.read(host.viewBytes!)).toMatchObject({
      status: 'current',
      record: { entryPath: 'models/other.ts' },
    });
    expect(host.controller.snapshot()?.layout).toEqual(first());
    host.unmount();
  });

  it('restores a prior non-main view after device-row reload without choosing another entry', async () => {
    const closed: WorkbenchLayout = {
      ...first(),
      viewer: { kind: 'group', tabs: [] },
    };
    const host = mount({
      layout: closed,
      previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } },
      viewExists: false,
    });
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(closed);
    });
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: host.controller.snapshot()!.layoutDigest,
          target: host.controller.snapshot()!.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(true);
    expect(workbenchRecords.view.read(host.viewBytes!)).toMatchObject({
      status: 'current',
      record: { entryPath: 'models/other.ts' },
    });
    expect(host.controller.snapshot()?.layout).toEqual(first());
    host.unmount();
  });
});

describe('layout host rows (A0.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutStores.length = 0;
  });

  const landAtOnce = () => vi.fn((_node: unknown, applied: () => void) => applied());
  const restoreCommand = (host: ReturnType<typeof mount>) => ({
    layoutDigest: host.controller.snapshot()!.layoutDigest,
    target: host.controller.snapshot()!.restoreTarget!,
    eligible: () => true,
  });

  // A0.3 row 2, Y3/I12: while no adapter is attached the applied revision reads as unknown, a publication is not
  // acknowledged, and the adapter that attaches next is shown that publication and only then acknowledges it.
  it('should read the applied revision as unknown while detached and acknowledge a detached publication on attach', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    let detachViewer = (): void => undefined;
    let detachWorkbench = (): void => undefined;
    act(() => {
      detachViewer = host.controller.registerViewer(viewer);
      detachWorkbench = host.controller.registerWorkbench(workbench);
    });
    expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    act(() => {
      detachWorkbench();
    });
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    act(() => {
      detachViewer();
    });
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    expect(host.applied.has(workbenchPaths.layout)).toBe(false);
    viewer.mockClear();
    workbench.mockClear();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    expect(viewer).toHaveBeenCalledExactlyOnceWith(second().viewer, expect.any(Function));
    expect(workbench).toHaveBeenCalledExactlyOnceWith(second().workbench, expect.any(Function));
    expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    host.unmount();
  });

  // A0.3 row 3, Y2/I10: a foreign publication lands while the person's pane edit is not yet written. The person's
  // arrangement wins: the workbench is never handed an arrangement without the person's edit.
  it.fails('I10: should not show a foreign arrangement over an unwritten person edit', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const shown: WorkbenchLaneNode[] = [];
    act(() => {
      host.controller.registerViewer(landAtOnce());
      host.controller.registerWorkbench((node, applied) => {
        shown.push(node);
        applied();
      });
    });
    const edited: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'revisions' }] };
    act(() => {
      host.controller.personWorkbenchChanged(edited);
    });
    shown.length = 0;
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout.lanes).toEqual(second().lanes));
    // A merged arrangement that keeps the person's tree is fine; showing the foreign tree is not.
    expect(shown).not.toContainEqual(second().workbench);
    host.unmount();
  });

  // A0.3 row 4, Y1/I14: a restore from the arrange-workbench card is written and shown on the attached adapters,
  // then acknowledged.
  it('should write a restore, show it on the attached adapters, and acknowledge it', async () => {
    const host = mount({ layout: second(), previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } } });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    workbench.mockClear();
    expect(await act(async () => host.controller.restorePreviousArrangement(restoreCommand(host)))).toBe(true);
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ status: 'current', record: first() });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    expect(workbench).toHaveBeenLastCalledWith(first().workbench, expect.any(Function));
    expect(host.applied.get(workbenchPaths.layout)).toBe(host.controller.snapshot()?.layoutDigest);
    host.unmount();
  });

  // A0.3 row 4, Y1/I14: restore is a repeatable command. The same command again is refused and changes nothing; the
  // card's refreshed command restores the arrangement the first restore replaced.
  it('should refuse a repeated restore command and apply the refreshed one', async () => {
    const host = mount({ layout: second(), previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } } });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    const command = restoreCommand(host);
    expect(await act(async () => host.controller.restorePreviousArrangement(command))).toBe(true);
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const restored = host.bytes;
    expect(await act(async () => host.controller.restorePreviousArrangement(command))).toBe(false);
    expect(host.bytes).toBe(restored);
    expect(host.writes).toHaveBeenCalledOnce();
    expect(host.previous?.layout).toEqual(second());
    expect(await act(async () => host.controller.restorePreviousArrangement(restoreCommand(host)))).toBe(true);
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ status: 'current', record: second() });
    expect(host.writes).toHaveBeenCalledTimes(2);
    host.unmount();
  });

  // A0.3 row 4, Y1/I14: when the arrangement moved after the card read its command, the restore is refused and the
  // arrangement is unchanged, whether the person's edit is still owed or already written.
  it.each(['owed', 'written'] as const)(
    'should refuse a restore when the arrangement moved and leave it unchanged (edit %s)',
    async (edit) => {
      const host = mount({ layout: second(), previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } } });
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
      const command = restoreCommand(host);
      const moved: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] };
      act(() => {
        host.controller.personWorkbenchChanged(moved);
      });
      if (edit === 'written') {
        await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(moved), { timeout: 1600 });
      }
      expect(await act(async () => host.controller.restorePreviousArrangement(command))).toBe(false);
      await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(moved), { timeout: 1600 });
      expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
        status: 'current',
        record: { ...second(), workbench: moved },
      });
      expect(host.writes).toHaveBeenCalledOnce();
      host.unmount();
    },
  );

  // A0.3 row 5, Y3/S25: under a StrictMode double mount the host registers one producer, and its flush settles a
  // layout write in flight, which lands once.
  it('should keep one producer under StrictMode whose flush settles a layout write in flight', async () => {
    const started = Promise.withResolvers<void>();
    const ack = Promise.withResolvers<void>();
    const producers = new Set<() => Promise<unknown>>();
    const host = mount({
      strict: true,
      pendingLayoutAck: ack.promise,
      onLayoutWriteStarted: started.resolve,
      registerProducer: (flush) => {
        producers.add(flush);
        return () => producers.delete(flush);
      },
    });
    try {
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
      expect(producers.size).toBe(1);
      const edited: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] };
      await act(async () => {
        host.controller.personWorkbenchChanged(edited);
        await started.promise;
      });
      let settled = false;
      const flushing = (async () => {
        await [...producers][0]!();
        settled = true;
      })();
      await act(async () => undefined);
      expect(settled).toBe(false);
      await act(async () => {
        ack.resolve();
        await flushing;
      });
      expect(host.writes).toHaveBeenCalledOnce();
      expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
        status: 'current',
        record: { ...first(), workbench: edited },
      });
    } finally {
      ack.resolve();
      host.unmount();
    }
    expect(producers.size).toBe(0);
  });

  // A0.3 row 5, Y3/I13: one record session per record file. Today StrictMode's double render builds a second layout
  // store (and starts its record actor) that is never disposed.
  it.fails('I13: should hold one live layout record session under a StrictMode double mount', async () => {
    const host = mount({ strict: true });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    await act(async () => undefined);
    expect(layoutStores.filter((store) => !store.disposed)).toHaveLength(1);
    host.unmount();
  });
});
