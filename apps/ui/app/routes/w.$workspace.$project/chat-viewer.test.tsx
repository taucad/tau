import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { DockviewPanelApi } from 'dockview-react';
import type { Geometry, GeometryComponentManifest } from '@taucad/types';
import type { KernelIssue, ProgressiveSceneUpdate, ResolvedSceneAsset, SceneNodeId } from '@taucad/runtime';
import { defaultGraphicsSettings, defaultRenderTimeout } from '#constants/editor.constants.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';
import {
  appendSceneTimelineUpdate,
  createSceneTimeline,
  selectSceneTimelineSequence,
} from '#machines/scene-timeline.js';
import { createProgressiveSceneProjection } from '#machines/progressive-scene-projection.js';

// =============================================================================
// xstate/react: lightweight mock that mirrors selector(undefined) when actor is
// undefined. Used by all the selector hooks in chat-viewer / its children.
// =============================================================================

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) => {
    if (!actor) {
      return selector(undefined);
    }
    return selector(actor.getSnapshot());
  },
}));

// =============================================================================
// Project context — projectRef.send is the assertion target for the reopen flow
// =============================================================================

const mockProjectSend = vi.fn();
const mockEditorSend = vi.fn();
const mockGraphicsSend = vi.fn();
let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
let mockViewSettings: Record<string, { entryPath: string; graphicsSettings: GraphicsViewSettings }> = {};
let mockCameraViewRestore: unknown;
const mockUseViewSettingsSync = vi.fn();
let mockHoveredComponentId: string | undefined;
let mockCadViewerSecondaryPointerMode: 'component-hit' | 'suppressed';
let mockCadViewerProps:
  | {
      readonly eventPrefix?: string;
      readonly eventSource?: unknown;
      readonly gizmoContainer?: HTMLElement | string;
      readonly secondaryMouseButtonMode?: string;
    }
  | undefined;

const helperEntryPath = 'helper.scad';
const helperUnitId = `file:${helperEntryPath}`;
const rightRimComponentId = 'component:right-rim';
const mockGeometry = {
  format: 'gltf',
  content: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
  hash: 'test-geometry',
} satisfies Geometry;
const sceneTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

const createProgressiveReset = (sequence: number): ProgressiveSceneUpdate => ({
  type: 'reset',
  renderId: 'render-progressive',
  sequence,
  revision: sequence,
  sceneDigest: `scene-${sequence}` as Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>['sceneDigest'],
  skippedBefore: 0,
  snapshot: {
    manifest: {
      schemaVersion: 1,
      rootNodeIds: ['root' as SceneNodeId],
      nodes: {
        root: { id: 'root' as SceneNodeId, childIds: [], transform: sceneTransform, visible: true },
      },
      presentation: {},
    },
    assets: [],
  },
});

const componentCapabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
} satisfies GeometryComponentManifest['capabilities'];

function createManifest(): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile: helperEntryPath,
    rootId: 'root',
    nodeOrder: ['root', rightRimComponentId],
    capabilities: componentCapabilities,
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [rightRimComponentId],
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities: componentCapabilities,
      },
      [rightRimComponentId]: {
        id: rightRimComponentId,
        name: 'Right Rim',
        kind: 'part',
        selector: 'node/0',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'Right Rim'],
        meshNodeIndices: [0],
        primitiveIndices: [0],
        materialIndices: [0],
        capabilities: componentCapabilities,
      },
    },
  };
}

function createModelInteractionContext(): ModelInteractionContext {
  return {
    unitsById: {
      [helperUnitId]: {
        manifest: createManifest(),
        hoveredComponentId: mockHoveredComponentId,
        selectedComponentIds: [],
        focusedComponentId: undefined,
        hiddenComponentIds: [],
        isolatedComponentIds: [],
        opacityByComponentId: {},
      },
    },
    unitOrder: [helperUnitId],
    revision: 0,
    displayRevision: 0,
    lastInteractionSource: 'viewer',
  };
}

type MockCadActorOptions = {
  readonly geometry?: Geometry;
  readonly latestGeometryOutcome?: 'success' | 'failure';
  readonly kernelIssues?: Map<string, KernelIssue[]>;
  readonly tags?: ReadonlyArray<'cad-loading' | 'cad-runtime-error'>;
  readonly sceneTimeline?: ReturnType<typeof createSceneTimeline>;
  readonly progressiveSupported?: boolean;
  readonly fileManagerReady?: boolean;
};

function createMockCadActor(options: MockCadActorOptions = {}): ActorRefFrom<typeof cadMachine> {
  const geometry = 'geometry' in options ? options.geometry : mockGeometry;
  const tags = new Set(options.tags);

  return {
    getSnapshot: vi.fn(() => ({
      context: {
        entryPath: helperEntryPath,
        geometry,
        units: { length: 'mm' },
        latestGeometryOutcome: options.latestGeometryOutcome,
        kernelIssues: options.kernelIssues ?? new Map(),
        kernelClient: undefined,
        fileManagerRef: options.fileManagerReady ? {} : undefined,
        renderTimeout: defaultRenderTimeout,
        sceneTimeline: options.sceneTimeline ?? createSceneTimeline(),
        activeKernelId: options.progressiveSupported ? 'picogk' : undefined,
        capabilities: options.progressiveSupported
          ? {
              routes: [],
              registrations: [],
              renderCapabilities: {
                picogk: {
                  renderOptions: { schema: {}, defaults: {} },
                  progressiveScene: {
                    type: 'supported',
                    deliveries: ['reset'],
                    bookmarks: ['explicit'],
                    replay: ['live', 'retained'],
                  },
                },
              },
            }
          : undefined,
      },
      hasTag: (tag: string) => tags.has(tag as 'cad-loading' | 'cad-runtime-error'),
    })),
    send: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    on: vi.fn(() => ({ unsubscribe: vi.fn() })),
    id: 'cad-test-helper-scad',
  } as unknown as ActorRefFrom<typeof cadMachine>;
}

function fireCanvasPointerMove(
  element: HTMLElement,
  coordinates: { readonly clientX: number; readonly clientY: number },
): void {
  fireEvent(
    element,
    new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: coordinates.clientX,
      clientY: coordinates.clientY,
    }),
  );
}

function fireCanvasPointerEvent(
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  options: {
    readonly button?: number;
    readonly pointerId?: number;
    readonly clientX: number;
    readonly clientY: number;
  },
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  fireEvent(element, event);
  return event;
}

function fireInspectableContextMenu(element: HTMLElement): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
  });
  fireEvent(element, event);
  return event;
}

const mockGraphicsActor = {
  getSnapshot: vi.fn(() => ({
    context: {
      enableSurfaces: true,
      enableLines: true,
      enableGizmo: true,
      enableGrid: true,
      enableAxes: true,
      enableMatcap: false,
      enablePostProcessing: false,
      upDirection: 'z',
      cameraFovAngle: 45,
      environmentPreset: 'studio',
      measurements: [],
      units: undefined,
      progressiveScene: createProgressiveSceneProjection(),
    },
  })),
  send: mockGraphicsSend,
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
} as unknown as ActorRefFrom<typeof graphicsMachine>;

const mockViewGraphics = new Map([['view-1', mockGraphicsActor]]);

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      getSnapshot: vi.fn(() => ({ context: {} })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockProjectSend,
    },
    editorRef: {
      getSnapshot: vi.fn(() => ({ context: { viewSettings: mockViewSettings } })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockEditorSend,
    },
    viewGraphics: mockViewGraphics,
    geometryUnits: mockGeometryUnits,
    mainEntryPath: 'main.scad',
  }),
}));

// =============================================================================
// File tree / file content — surface a real file so we don't hit the missing /
// directory placeholder branches
// =============================================================================

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () =>
    new Map<string, { type: 'file' | 'dir'; name: string }>([
      [helperEntryPath, { type: 'file', name: helperEntryPath }],
    ]),
}));

vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: () => ({ kind: 'text', text: 'cube();' }),
}));

// =============================================================================
// Children that aren't relevant to the overlay assertion
// =============================================================================

vi.mock('#components/geometry/cad/cad-viewer.js', () => ({
  CadViewer: ({
    eventPrefix,
    eventSource,
    gizmoContainer,
    onModelComponentSecondaryPointerCandidate,
    secondaryMouseButtonMode,
  }: {
    readonly eventPrefix?: string;
    readonly eventSource?: unknown;
    readonly gizmoContainer?: HTMLElement | string;
    readonly onModelComponentSecondaryPointerCandidate?: (
      target: { readonly unitId: string; readonly componentId: string } | undefined,
    ) => void;
    readonly secondaryMouseButtonMode?: string;
  }) => {
    mockCadViewerProps = { eventPrefix, eventSource, gizmoContainer, secondaryMouseButtonMode };

    return (
      <div
        data-testid='cad-viewer-canvas'
        onPointerDown={(event) => {
          if (event.button !== 2) {
            return;
          }

          onModelComponentSecondaryPointerCandidate?.(
            mockCadViewerSecondaryPointerMode === 'suppressed'
              ? undefined
              : { unitId: helperUnitId, componentId: rightRimComponentId },
          );
        }}
      />
    );
  },
}));

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: ({ onSelect }: { readonly onSelect: (path: string) => void }) => (
    <button
      type='button'
      data-testid='file-selector'
      onClick={() => {
        onSelect('other.scad');
      }}
    >
      Select another file
    </button>
  ),
}));

vi.mock('#routes/w.$workspace.$project/chat-stack-trace.js', () => ({
  ChatStackTrace: () => <div data-testid='chat-stack-trace' />,
}));

vi.mock('#routes/w.$workspace.$project/chat-viewer-status.js', () => ({
  ChatViewerStatus: () => null,
}));

vi.mock('#routes/w.$workspace.$project/chat-viewer-controls.js', () => ({
  ChatViewerControls: () => null,
}));

vi.mock('#routes/w.$workspace.$project/chat-interface-graphics.js', () => ({
  ChatInterfaceGraphics: () => null,
}));

vi.mock('#routes/w.$workspace.$project/chat-interface-status.js', () => ({
  ChatInterfaceStatus: () => null,
}));

vi.mock('#components/cad/ar-button.js', () => ({
  ArButton: () => null,
}));

vi.mock('#hooks/use-view-settings-sync.js', () => ({
  useViewSettingsSync: (options: unknown) => {
    mockUseViewSettingsSync(options);
  },
}));

// `use-graphics` drags in three.js via screenshot/camera capability machines, so
// stub the provider/hooks to avoid loading three under jsdom.
vi.mock('#hooks/use-graphics.js', () => ({
  GraphicsProvider: ({ children, cameraViewRestore }: { children: React.ReactNode; cameraViewRestore?: unknown }) => {
    mockCameraViewRestore = cameraViewRestore;
    return <div>{children}</div>;
  },
  useGraphics: () => mockGraphicsActor,
  useGraphicsSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({
      context: {
        enableSurfaces: true,
        enableLines: true,
        enableGizmo: true,
        enableGrid: true,
        enableAxes: true,
        enableMatcap: false,
        upDirection: 'z',
        progressiveScene: createProgressiveSceneProjection(),
      },
    }),
  useModelInteractionSelector: (selector: (state: { context: ModelInteractionContext }) => unknown) =>
    selector({ context: createModelInteractionContext() }),
}));

const { ChatViewer } = await import('./chat-viewer.js');

const mockPanelApi = {
  setTitle: vi.fn(),
  updateParameters: vi.fn(),
} as unknown as DockviewPanelApi;

describe('ChatViewer reopen-renderer overlay', () => {
  let getBoundingClientRectSpy: MockInstance<typeof HTMLElement.prototype.getBoundingClientRect> | undefined;

  beforeEach(() => {
    mockProjectSend.mockClear();
    mockEditorSend.mockClear();
    mockGraphicsSend.mockClear();
    mockGeometryUnits = new Map();
    mockViewSettings = {};
    mockCameraViewRestore = undefined;
    mockUseViewSettingsSync.mockClear();
    mockHoveredComponentId = undefined;
    mockCadViewerSecondaryPointerMode = 'component-hit';
    mockCadViewerProps = undefined;
    mockViewGraphics.set('view-1', mockGraphicsActor);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(10, 20, 500, 300));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getBoundingClientRectSpy?.mockRestore();
    getBoundingClientRectSpy = undefined;
  });

  it('renders the Reopen renderer button when the geometry unit is closed', () => {
    // `entryPath` is set, the file exists, but geometryUnits.get(entryPath) === undefined
    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
  });

  it('dispatches createGeometryUnit when Reopen renderer is clicked', () => {
    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireEvent.click(screen.getByRole('button', { name: /reopen renderer/i }));

    expect(mockProjectSend).toHaveBeenCalledTimes(1);
    expect(mockProjectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryPath: helperEntryPath,
    });
  });

  it('does not render the overlay when a geometry unit exists for the entry path', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.queryByRole('button', { name: /reopen renderer/i })).not.toBeInTheDocument();
  });

  it('leaves an editor failure to the existing issue panel when no geometry exists', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        geometry: undefined,
        latestGeometryOutcome: 'failure',
        kernelIssues: new Map([
          [
            helperEntryPath,
            [{ message: 'editor failure sentinel', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
          ],
        ]),
      }),
    );

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('chat-stack-trace')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Waiting for geometry' })).toBeInTheDocument();
    expect(screen.queryByTestId('cad-viewer-canvas')).not.toBeInTheDocument();
  });

  it('leaves editor connection failures to the existing issue panel', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        geometry: undefined,
        kernelIssues: new Map([
          [
            '__connection__',
            [{ message: 'desktop runtime connection sentinel', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
          ],
        ]),
        tags: ['cad-runtime-error'],
      }),
    );

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('chat-stack-trace')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
  });

  it('keeps retained geometry visible without duplicating the editor issue panel', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        latestGeometryOutcome: 'failure',
        kernelIssues: new Map([
          [
            helperEntryPath,
            [{ message: 'stale geometry sentinel', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
          ],
        ]),
      }),
    );

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('chat-stack-trace')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
  });

  it('keeps the runtime overlay for shared viewers that have no issue panel', () => {
    const message = 'shared failure sentinel';
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        latestGeometryOutcome: 'failure',
        kernelIssues: new Map([[helperEntryPath, [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }]]]),
      }),
    );

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} profile='shared' />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    expect(screen.getByRole('alert', { name: 'CAD runtime error' })).toHaveTextContent(message);
    expect(screen.queryByTestId('chat-stack-trace')).not.toBeInTheDocument();
  });

  it('does not present warnings from a successful render as a failure', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        latestGeometryOutcome: 'success',
        kernelIssues: new Map([
          [helperEntryPath, [{ message: 'warning sentinel', code: 'RUNTIME', type: 'runtime', severity: 'warning' }]],
        ]),
      }),
    );

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
  });

  it('uses the semantic loading tag while geometry is pending', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ geometry: undefined, tags: ['cad-loading'] }));

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('status', { name: 'Loading geometry' })).toHaveAttribute('aria-busy', 'true');
  });

  it('passes the persisted camera view to the provider for the current entry', () => {
    const cameraView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1.25,
    } as const;
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: { ...defaultGraphicsSettings, cameraFovAngle: 42, cameraView },
      },
    };
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(mockCameraViewRestore).toEqual({ identity: helperEntryPath, cameraView });
    expect(mockUseViewSettingsSync).toHaveBeenCalledWith(expect.objectContaining({ persistCameraView: true }));
  });

  it('clears geometry-dependent camera state when the pane switches files', () => {
    const cameraView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1.25,
    } as const;
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: { ...defaultGraphicsSettings, cameraFovAngle: 42, cameraView },
      },
    };
    render(<ChatViewer viewId='view-1' entryPath={undefined} panelApi={mockPanelApi} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select another file' }));

    expect(mockEditorSend).toHaveBeenCalledWith({
      type: 'setViewSettings',
      viewId: 'view-1',
      viewState: {
        entryPath: 'other.scad',
        graphicsSettings: {
          ...defaultGraphicsSettings,
          cameraFovAngle: 42,
          cameraView: undefined,
          pinnedMeasurements: undefined,
        },
      },
    });
  });

  it('lets empty bottom-control overlay space pass pointer events through to the canvas', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const overlay = screen.getByTestId('chat-viewer-bottom-controls-overlay');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('[&>*]:pointer-events-auto');
  });

  it('anchors the gizmo to the clipped canvas region', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    expect(document.querySelector(mockCadViewerProps?.gizmoContainer as string)).toBe(canvasRegion);
    expect(canvasRegion).toHaveClass('relative', 'overflow-hidden');
  });

  it('bridges accepted scene frames and timeline controls to the owning actors', () => {
    const first = createProgressiveReset(0);
    const second = createProgressiveReset(1);
    let timeline = appendSceneTimelineUpdate(createSceneTimeline(), first);
    timeline = appendSceneTimelineUpdate(timeline, second);
    timeline = selectSceneTimelineSequence(timeline, 0);
    const cadActor = createMockCadActor({
      sceneTimeline: timeline,
      progressiveSupported: true,
      fileManagerReady: true,
    });
    mockGeometryUnits = new Map([[helperEntryPath, cadActor]]);

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('slider', { name: 'Scene timeline' })).toBeInTheDocument();
    expect(mockGraphicsSend).toHaveBeenCalledWith({
      type: 'syncProgressiveScene',
      updates: [first, second],
      selectedSequence: 0,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Return to live scene' }));
    expect(cadActor.send).toHaveBeenCalledWith({ type: 'followLiveScene' });
  });

  it('routes the explicit preview-stage save action to the owning CAD actor', () => {
    const first = createProgressiveReset(0);
    if (first.type !== 'reset') {
      throw new TypeError('Expected reset fixture');
    }
    const asset: ResolvedSceneAsset = {
      contentDigest: 'asset-stage' as (typeof first.snapshot.assets)[number]['contentDigest'],
      mediaType: 'model/gltf-binary',
      byteLength: 4,
      geometry: { format: 'gltf', content: new Uint8Array([0x67, 0x6c, 0x54, 0x46]) },
    };
    const portableFirst: ProgressiveSceneUpdate = {
      ...first,
      snapshot: {
        manifest: {
          ...first.snapshot.manifest,
          nodes: {
            root: {
              ...first.snapshot.manifest.nodes['root']!,
              geometry: {
                contentDigest: asset.contentDigest,
                mediaType: asset.mediaType,
                byteLength: asset.byteLength,
              },
            },
          },
        },
        assets: [asset],
      },
    };
    let timeline = appendSceneTimelineUpdate(createSceneTimeline(), portableFirst);
    timeline = appendSceneTimelineUpdate(timeline, createProgressiveReset(1));
    timeline = selectSceneTimelineSequence(timeline, 0);
    const cadActor = createMockCadActor({
      sceneTimeline: timeline,
      progressiveSupported: true,
      fileManagerReady: true,
    });
    mockGeometryUnits = new Map([[helperEntryPath, cadActor]]);

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save selected preview stage to project' }));

    expect(cadActor.send).toHaveBeenCalledWith({ type: 'saveSelectedSceneStage' });
  });

  it('should show the hovered component name under the pointer when the canvas has a hovered component', () => {
    mockHoveredComponentId = rightRimComponentId;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    const label = screen.getByTestId('model-component-name-badge');
    expect(label).toHaveTextContent('Right Rim');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(label.className).toContain('pointer-events-none');
    expect(label).toHaveStyle({
      left: '64px',
      top: '72px',
      '--viewer-hover-label-x': '64px',
      '--viewer-hover-label-y': '72px',
    });
  });

  it('should hide the hovered component label when the pointer leaves the canvas region', () => {
    mockHoveredComponentId = rightRimComponentId;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    fireCanvasPointerMove(canvasRegion, { clientX: 74, clientY: 92 });
    expect(screen.getByText('Right Rim')).toBeInTheDocument();

    fireEvent.pointerLeave(canvasRegion);

    expect(screen.queryByText('Right Rim')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when no component is hovered', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when the hovered id is absent from the manifest', () => {
    mockHoveredComponentId = 'component:missing';
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when the geometry unit is closed', () => {
    mockHoveredComponentId = rightRimComponentId;

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should open the model component action menu from a viewer right-click', async () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    const canvas = screen.getByTestId('cad-viewer-canvas');
    expect(mockCadViewerProps?.secondaryMouseButtonMode).toBe('camera-pan');
    expect(mockCadViewerProps?.eventPrefix).toBeUndefined();
    expect((mockCadViewerProps?.eventSource as RefObject<HTMLElement> | undefined)?.current).toBe(canvasRegion);

    fireCanvasPointerEvent(canvas, 'pointerdown', {
      button: 2,
      pointerId: 11,
      clientX: 150,
      clientY: 180,
    });
    fireCanvasPointerEvent(canvas, 'pointerup', {
      button: 2,
      pointerId: 11,
      clientX: 151,
      clientY: 181,
    });

    expect(await screen.findByRole('menuitem', { name: 'Focus on part' })).toBeInTheDocument();
    expect(screen.getByText('Add to chat')).toBeInTheDocument();
    expect(screen.getByText('Reveal in Explorer')).toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Isolate')).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('100');

    fireEvent.click(screen.getByText('Reveal in Explorer'));

    expect(mockGraphicsSend).toHaveBeenCalledWith({
      type: 'selectModelComponent',
      unitId: helperUnitId,
      componentId: rightRimComponentId,
      source: 'viewer',
    });
    expect(mockEditorSend).toHaveBeenCalledWith({
      type: 'revealModelComponentInExplorer',
      entryPath: helperEntryPath,
      unitId: helperUnitId,
      componentId: rightRimComponentId,
    });
  });

  it('should keep a right-button drag as camera pan instead of opening model component actions', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvas = screen.getByTestId('cad-viewer-canvas');
    fireCanvasPointerEvent(canvas, 'pointerdown', {
      button: 2,
      pointerId: 12,
      clientX: 150,
      clientY: 180,
    });
    fireCanvasPointerEvent(screen.getByTestId('cad-viewer-canvas-region'), 'pointermove', {
      pointerId: 12,
      clientX: 164,
      clientY: 180,
    });
    fireCanvasPointerEvent(canvas, 'pointerup', {
      button: 2,
      pointerId: 12,
      clientX: 164,
      clientY: 180,
    });

    expect(screen.queryByText('Focus on part')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide')).not.toBeInTheDocument();
    expect(mockGraphicsSend).toHaveBeenCalledWith({ type: 'markModelPointerGestureMoved' });
  });

  it('should not render model component actions when CadViewer suppresses a right-click gesture', () => {
    mockCadViewerSecondaryPointerMode = 'suppressed';
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvas = screen.getByTestId('cad-viewer-canvas');
    fireCanvasPointerEvent(canvas, 'pointerdown', {
      button: 2,
      pointerId: 13,
      clientX: 150,
      clientY: 180,
    });
    fireCanvasPointerEvent(canvas, 'pointerup', {
      button: 2,
      pointerId: 13,
      clientX: 150,
      clientY: 180,
    });

    expect(screen.queryByText('Focus on part')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide')).not.toBeInTheDocument();
  });

  it('should suppress the browser context menu on the viewer surface without opening model actions', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    render(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const contextMenuEvent = fireInspectableContextMenu(screen.getByTestId('cad-viewer-canvas-region'));

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(screen.queryByText('Focus on part')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide')).not.toBeInTheDocument();
  });
});
