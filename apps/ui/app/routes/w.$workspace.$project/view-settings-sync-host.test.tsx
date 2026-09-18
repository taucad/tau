// @vitest-environment jsdom
import { useSyncExternalStore } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import type { projectMachine } from '#machines/project.machine.js';
import { ViewSettingsSyncHost } from '#routes/w.$workspace.$project/view-settings-sync-host.js';

type GraphicsRef = ActorRefFrom<typeof graphicsMachine>;
type EditorSendEvent = Parameters<ActorRefFrom<typeof editorMachine>['send']>[0];
type View = { graphicsRef: GraphicsRef; entryPath?: string };

/* The real provider re-renders its consumers through `useSelector`, so a view the project adds or
 * destroys reaches the host as a new context value. This store is that contract, and nothing more. */
const projectStore = vi.hoisted(() => {
  let snapshot: unknown;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    set(next: unknown) {
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot),
}));

function createGraphicsActor(): GraphicsRef {
  return createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: {},
  }).start();
}

/** Minimal project + editor pair: the host reads the view map, the view's entry and its CAD unit. */
function createProjectContext(initial: Record<string, View>): {
  editorSend: ReturnType<typeof vi.fn<(event: EditorSendEvent) => void>>;
  setViews: (next: Record<string, View>) => void;
} {
  const editorSend = vi.fn<(event: EditorSendEvent) => void>();
  const subscribe = (): { unsubscribe: () => void } => ({ unsubscribe: () => undefined });

  const setViews = (views: Record<string, View>): void => {
    const editorSnapshot = {
      context: {
        viewSettings: Object.fromEntries(
          Object.entries(views).map(([viewId, view]) => [viewId, { entryPath: view.entryPath }]),
        ),
      },
    };
    projectStore.set({
      /* A new Map identity per create/destroy is what the real machine hands out. */
      viewGraphics: new Map(Object.entries(views).map(([viewId, view]) => [viewId, view.graphicsRef])),
      projectRef: {
        getSnapshot: () => ({ context: { geometryUnits: new Map() } }),
        subscribe,
      } as unknown as ActorRefFrom<typeof projectMachine>,
      editorRef: mock<ActorRefFrom<typeof editorMachine>>({
        send: editorSend,
        getSnapshot: () => editorSnapshot,
        subscribe,
      } as unknown as Partial<ActorRefFrom<typeof editorMachine>>),
    });
  };

  setViews(initial);
  return { editorSend, setViews };
}

const lastUpdateFor = (
  editorSend: ReturnType<typeof vi.fn<(event: EditorSendEvent) => void>>,
  viewId: string,
): EditorSendEvent | undefined =>
  editorSend.mock.calls
    .map(([event]) => event)
    .findLast((event) => event.type === 'updateViewSettings' && event.viewId === viewId);

describe('ViewSettingsSyncHost', () => {
  /* R6: the host is mounted beside the project's persistence guard, not inside a pane, so a project
   * the person is not looking at -- one with no panes rendered at all -- still writes what its own
   * actors hold. Before, the only writer was the viewer component, and an unfocused project had none. */
  it('writes a live view whose project renders no panes', async () => {
    const graphicsRef = createGraphicsActor();
    const { editorSend } = createProjectContext({ 'view-1': { graphicsRef, entryPath: 'src/main.ts' } });

    render(<ViewSettingsSyncHost />);

    act(() => {
      graphicsRef.send({ type: 'setGridVisibility', payload: false });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        viewId: 'view-1',
        settings: { enableGrid: false },
      });
    });
    graphicsRef.stop();
  });

  it('writes every live view of the project, each under its own id', async () => {
    const first = createGraphicsActor();
    const second = createGraphicsActor();
    const { editorSend } = createProjectContext({
      'view-1': { graphicsRef: first, entryPath: 'src/main.ts' },
      'view-2': { graphicsRef: second, entryPath: 'src/part.ts' },
    });

    render(<ViewSettingsSyncHost />);
    editorSend.mockClear();

    act(() => {
      second.send({ type: 'setAxesVisibility', payload: false });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        viewId: 'view-2',
        settings: { enableAxes: false },
      });
    });
    expect(editorSend.mock.calls.every(([event]) => !('viewId' in event) || event.viewId === 'view-2')).toBe(true);
    first.stop();
    second.stop();
  });

  /* A pane opened after the project came up is the ordinary case: the host mounts with the project,
   * every view arrives later. */
  it('starts writing a view the project adds after it mounted', async () => {
    const first = createGraphicsActor();
    const added = createGraphicsActor();
    const { editorSend, setViews } = createProjectContext({
      'view-1': { graphicsRef: first, entryPath: 'src/main.ts' },
    });

    render(<ViewSettingsSyncHost />);
    act(() => {
      setViews({
        'view-1': { graphicsRef: first, entryPath: 'src/main.ts' },
        'view-2': { graphicsRef: added, entryPath: 'src/part.ts' },
      });
    });
    editorSend.mockClear();

    act(() => {
      added.send({ type: 'setAxesVisibility', payload: false });
    });

    await waitFor(() => {
      expect(lastUpdateFor(editorSend, 'view-2')).toMatchObject({ settings: { enableAxes: false } });
    });
    first.stop();
    added.stop();
  });

  it('stops writing a view the project destroyed', async () => {
    const kept = createGraphicsActor();
    const removed = createGraphicsActor();
    const { editorSend, setViews } = createProjectContext({
      'view-1': { graphicsRef: kept, entryPath: 'src/main.ts' },
      'view-2': { graphicsRef: removed, entryPath: 'src/part.ts' },
    });

    render(<ViewSettingsSyncHost />);
    act(() => {
      setViews({ 'view-1': { graphicsRef: kept, entryPath: 'src/main.ts' } });
    });
    editorSend.mockClear();

    act(() => {
      removed.send({ type: 'setAxesVisibility', payload: false });
      kept.send({ type: 'setAxesVisibility', payload: false });
    });

    await waitFor(() => {
      expect(lastUpdateFor(editorSend, 'view-1')).toMatchObject({ settings: { enableAxes: false } });
    });
    expect(lastUpdateFor(editorSend, 'view-2')).toBeUndefined();
    kept.stop();
    removed.stop();
  });
});
