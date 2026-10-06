// @vitest-environment jsdom
/**
 * Viewer renders per cad transition.
 *
 * A parameter drag walks the cad machine through render states many times per
 * second, and most transitions carry no new geometry. The viewer must render
 * once per presented geometry, with the canvas receiving that geometry and the
 * presentation revision the graphics machine assigns it in the same render; a
 * render under the previous revision starts preparing the geometry twice.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createActor, setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, SnapshotFrom } from 'xstate';
import type { DockviewPanelApi } from 'dockview-react';
import type { Geometry } from '@taucad/types';
import type { Artifact, Rendering } from '@taucad/runtime';
import { eventSchemas } from '#lib/xstate.lib.js';
import type { cadMachine } from '#machines/cad.machine.js';

const entryPath = 'main.scad';

type GltfGeometry = Extract<Geometry, { format: 'gltf' }>;

const gltf = (hash: string): GltfGeometry => ({ format: 'gltf', content: new Uint8Array([1, 2, 3, 4]), hash });
const renderingFrom = (geometry: GltfGeometry): Rendering => ({
  success: true,
  requestId: geometry.hash,
  evaluationId: 'evaluation',
  transient: false,
  view: 'model',
  issues: [],
  hash: geometry.hash,
  artifact: { mimeType: 'model/gltf-binary', content: geometry.content },
});

/** Renders of the viewer body (counted through a child it always renders) and of the canvas. */
const renders = vi.hoisted(() => ({
  viewer: 0,
  canvas: [] as Array<{ readonly hash: string | undefined; readonly revision: number }>,
}));

/** The cad machine's rendering states as the viewer's selectors read them. */
const cadLikeMachine = setup({
  schemas: {
    context: types<{
      entryPath: string;
      rendering: Rendering | undefined;
      units: { length: 'mm' };
      kernelIssues: Map<string, never[]>;
      kernelClient: undefined;
      latestGeometryOutcome: 'success';
    }>(),
    events: eventSchemas<{ type: 'scrub' } | { type: 'settle' } | { type: 'present'; geometry: GltfGeometry }>(),
  },
}).createMachine({
  context: {
    entryPath,
    rendering: renderingFrom(gltf('first')),
    units: { length: 'mm' },
    kernelIssues: new Map(),
    kernelClient: undefined,
    latestGeometryOutcome: 'success',
  },
  initial: 'idle',
  states: {
    idle: { on: { scrub: { target: 'rendering' } } },
    rendering: {
      tags: ['cad-loading'],
      on: {
        settle: { target: 'idle' },
        present: { target: 'idle', context: ({ event }) => ({ rendering: renderingFrom(event.geometry) }) },
      },
    },
  },
});

/** The graphics machine's geometry intake: each update is a new presentation revision. */
const graphicsLikeMachine = setup({
  schemas: {
    context: types<{
      artifact: Artifact | undefined;
      artifactKey: string | undefined;
      artifactSourceFile?: string;
      gltfPresentation: { requestedRevision: number };
      enableSurfaces: boolean;
      enableLines: boolean;
      enableGizmo: boolean;
      enableGrid: boolean;
      enableAxes: boolean;
      enableMatcap: boolean;
      upDirection: 'z';
    }>(),
    events: eventSchemas<{ type: 'updateArtifact'; artifact: Artifact; hash: string; sourceFile: string }>(),
  },
}).createMachine({
  context: {
    artifact: undefined,
    artifactKey: undefined,
    gltfPresentation: { requestedRevision: 0 },
    enableSurfaces: true,
    enableLines: true,
    enableGizmo: true,
    enableGrid: true,
    enableAxes: true,
    enableMatcap: false,
    upDirection: 'z',
  },
  on: {
    updateArtifact: {
      context: ({ context, event }) => ({
        artifact: event.artifact,
        artifactKey: event.hash,
        artifactSourceFile: event.sourceFile,
        gltfPresentation: { requestedRevision: context.gltfPresentation.requestedRevision + 1 },
      }),
    },
  },
});

const actors = vi.hoisted(() => ({
  cad: undefined as AnyActorRef | undefined,
  graphics: undefined as AnyActorRef | undefined,
}));

const editorStub = vi.hoisted(() => {
  const snapshot = { context: { viewSettings: {}, unitSettings: {} } };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: () => undefined }),
    on: () => ({ unsubscribe: () => undefined }),
    send: () => undefined,
  };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: editorStub,
    editorRef: editorStub,
    viewGraphics: new Map([['view-1', actors.graphics]]),
    viewRecords: new Map(),
    entriesRecord: { version: 1, entries: {} },
    setViewEntryPath: () => undefined,
    geometryUnits: new Map([[entryPath, actors.cad]]),
    mainEntryPath: entryPath,
  }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({
    edit: async () => true,
    remove: async () => true,
  }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: () => undefined }));
vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeSelector: <T,>(select: (tree: Map<string, unknown>) => T): T =>
    select(new Map([[entryPath, { type: 'file', name: entryPath }]])),
}));
vi.mock('#hooks/use-file-content.js', () => ({ useFileContent: () => ({ kind: 'text', text: 'cube();' }) }));
vi.mock('#hooks/use-graphics.js', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    GraphicsProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
    useGraphics: () => actors.graphics,
    useGraphicsSelector: <T,>(selector: (state: SnapshotFrom<typeof graphicsLikeMachine>) => T): T =>
      useSelector(actors.graphics!, selector),
    useModelInteractionSelector: <T,>(selector: (state: { context: Record<string, unknown> }) => T): T =>
      selector({ context: { unitsById: {} } }),
    useKinematicsSelector: <T,>(selector: (state: { context: Record<string, unknown> }) => T): T =>
      selector({ context: { unitsById: {} } }),
  };
});
vi.mock('#components/geometry/cad/cad-viewer.js', async () => {
  const { useGraphicsSelector } = await import('#hooks/use-graphics.js');
  const { memo } = await import('react');
  return {
    CadViewer: memo(({ artifactHash }: { readonly artifactHash?: string }) => {
      const revision = useGraphicsSelector(
        (state: { context: { gltfPresentation: { requestedRevision: number } } }) =>
          state.context.gltfPresentation.requestedRevision,
      );
      renders.canvas.push({ hash: artifactHash, revision });
      return <div data-testid='cad-viewer-canvas' />;
    }),
  };
});
vi.mock('#routes/w.$workspace.$project/chat-viewer-controls.js', () => ({
  ChatViewerControls: () => {
    renders.viewer += 1;
    return null;
  },
}));
vi.mock('#routes/w.$workspace.$project/chat-stack-trace.js', () => ({
  ViewerIssues: ({
    children,
  }: {
    readonly children: (parts: { segment: React.ReactNode; list: React.ReactNode }) => React.ReactNode;
  }): React.ReactNode => children({ segment: null, list: null }),
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-status.js', () => ({ ChatViewerStatus: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-interface-graphics.js', () => ({ ChatInterfaceGraphics: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-interface-status.js', () => ({ ChatInterfaceStatus: () => null }));
vi.mock('#components/cad/ar-button.js', () => ({ ArButton: () => null }));

const { ChatViewer } = await import('./chat-viewer.js');

const panelApi = { setTitle: vi.fn(), updateParameters: vi.fn() } as unknown as DockviewPanelApi;

function renderViewer(): { readonly cad: ActorRefFrom<typeof cadLikeMachine> } {
  const cad = createActor(cadLikeMachine).start();
  actors.cad = cad as unknown as ActorRefFrom<typeof cadMachine>;
  actors.graphics = createActor(graphicsLikeMachine).start();
  render(<ChatViewer viewId='view-1' entryPath={entryPath} panelApi={panelApi} />);
  expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
  expect(renders.canvas).toEqual([{ hash: 'first', revision: 1 }]);
  renders.viewer = 0;
  renders.canvas = [];
  return { cad };
}

const revision = (): number =>
  (actors.graphics!.getSnapshot() as SnapshotFrom<typeof graphicsLikeMachine>).context.gltfPresentation
    .requestedRevision;

beforeEach(() => {
  renders.viewer = 0;
  renders.canvas = [];
});

describe('ChatViewer renders per cad transition', () => {
  it('should not re-render the viewer for a render transition that presents no geometry', () => {
    const { cad } = renderViewer();

    act(() => {
      cad.send({ type: 'scrub' });
    });
    act(() => {
      cad.send({ type: 'settle' });
    });

    expect(renders.viewer).toBe(0);
    expect(renders.canvas).toEqual([]);
  });

  it('should render the canvas once per presented geometry, under its own presentation revision', () => {
    const { cad } = renderViewer();
    const before = revision();

    act(() => {
      cad.send({ type: 'scrub' });
    });
    act(() => {
      cad.send({ type: 'present', geometry: gltf('second') });
    });

    expect(revision()).toBe(before + 1);
    expect(renders.canvas).toEqual([{ hash: 'second', revision: before + 1 }]);
    expect(renders.viewer).toBe(2);
  });
});
