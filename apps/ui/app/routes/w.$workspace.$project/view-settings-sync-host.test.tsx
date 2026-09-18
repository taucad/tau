// @vitest-environment jsdom
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

const projectContext = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => projectContext.current }));

function createGraphicsActor(): GraphicsRef {
  return createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: {},
  }).start();
}

/** Minimal project + editor pair: the host reads the view map, the view's entry and its CAD unit. */
function createProjectContext(views: Record<string, { graphicsRef: GraphicsRef; entryPath?: string }>): {
  editorSend: ReturnType<typeof vi.fn<(event: EditorSendEvent) => void>>;
} {
  const viewGraphics = new Map(Object.entries(views).map(([viewId, view]) => [viewId, view.graphicsRef]));
  const projectSnapshot = { context: { viewGraphics, geometryUnits: new Map() } };
  const editorSnapshot = {
    context: {
      viewSettings: Object.fromEntries(
        Object.entries(views).map(([viewId, view]) => [viewId, { entryPath: view.entryPath }]),
      ),
    },
  };
  const subscribe = (): { unsubscribe: () => void } => ({ unsubscribe: () => undefined });
  const editorSend = vi.fn<(event: EditorSendEvent) => void>();

  projectContext.current = {
    projectRef: { getSnapshot: () => projectSnapshot, subscribe } as unknown as ActorRefFrom<typeof projectMachine>,
    editorRef: mock<ActorRefFrom<typeof editorMachine>>({
      send: editorSend,
      getSnapshot: () => editorSnapshot,
      subscribe,
    } as unknown as Partial<ActorRefFrom<typeof editorMachine>>),
  };

  return { editorSend };
}

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
});
