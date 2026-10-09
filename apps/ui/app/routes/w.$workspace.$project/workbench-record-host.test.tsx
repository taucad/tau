/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable typescript/no-confusing-void-expression -- Testing Library and adapter callbacks assert observable state. */
import type { WatchEvent } from '@taucad/filesystem';
// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workbenchRecords, workbenchPaths } from '@taucad/workbench';
import type { WorkbenchLayout, WorkbenchView } from '@taucad/workbench';
import type { PreviousWorkbenchLayout } from '#types/editor.types.js';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
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
    registerWorkbenchRecordProducer: () => () => undefined,
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
  const rendered = render(<WorkbenchRecordHost />);
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
