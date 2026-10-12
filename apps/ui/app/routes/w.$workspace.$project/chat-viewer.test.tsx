import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Profiler, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { setLiveViewOptions } from '#workbench-records/live-view-options.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { createActor, createAsyncLogic } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { DockviewPanelApi } from 'dockview-react';
import type { GeometryComponentManifest } from '@taucad/types';
import type { Artifact, Evaluation, KernelIssue, Rendering, ViewUpdateOutcome } from '@taucad/runtime';
import { createMockRuntimeDocument } from '@taucad/runtime-testing';
import type { MockRuntimeDocumentFixture } from '@taucad/runtime-testing';
import { workbenchRecords } from '@taucad/workbench';
import { createEmptyGlb } from '@taucad/geometry-core';
import { defaultGraphicsSettings, defaultOperationTimeout } from '#constants/editor.constants.js';
import type { GraphicsViewSettings, PinnedMeasurement } from '#constants/editor.constants.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';
import type { PartThumbnailService, PartThumbnailState } from '#services/part-thumbnail.service.js';
const mockViewActions = vi.hoisted(() => ({
  edit: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
  remove: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
}));
vi.mock('#workbench-records/view-actions.js', () => ({ useWorkbenchViewCommands: () => mockViewActions }));

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
let mockGraphicsProjection: Readonly<{ artifact: Artifact | undefined; artifactKey: string | undefined }> = {
  artifact: undefined,
  artifactKey: undefined,
};
const mockGraphicsListeners = new Set<() => void>();
const subscribeGraphics = (listener: () => void): (() => void) => {
  mockGraphicsListeners.add(listener);
  return () => {
    mockGraphicsListeners.delete(listener);
  };
};
const mockGltfPresentation: { presentedKey: string | undefined } = { presentedKey: undefined };
const presentPreviewSource = (artifact: Artifact, key: string): void => {
  mockGraphicsProjection = { artifact, artifactKey: key };
  mockGltfPresentation.presentedKey = key;
  for (const listener of mockGraphicsListeners) {
    listener();
  }
};
let mockCaptureRendering: (() => Promise<Rendering>) | undefined;
let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
let mockViewSettings: Record<
  string,
  {
    entryPath: string;
    graphicsSettings: GraphicsViewSettings;
    selectedKernelView?: string;
    kernelViews?: Array<{ id: string; options?: Record<string, unknown>; authoredInstance?: string }>;
  }
> = {};
let mockCameraSeed: unknown;
/** A mounted provider is what acquires the view's camera session (R8). */
let mockGraphicsProviderMounts = 0;
let mockUnitSettings: Record<string, { renderTimeout: number }> = {};
let mockFileTree: Map<string, { type: 'file' | 'dir'; name: string }>;
let mockFileContent: { kind: string; text?: string };
let mockMainEntryPath = 'main.scad';
let mockSyncStatus: { readonly sync: { readonly state: 'checking' | 'backedUp' } } = {
  sync: { state: 'backedUp' },
};
const mockSyncListeners = new Set<() => void>();
let mockHoveredComponentId: string | undefined;
let mockPreviewService: PartThumbnailService | undefined;
let mockPreviewEnabled = false;
let mockAreToolsRunning = false;
let mockCadViewerSecondaryPointerMode: 'component-hit' | 'suppressed';
let mockCadViewerProps:
  | {
      readonly eventPrefix?: string;
      readonly eventSource?: unknown;
      readonly gizmoContainer?: HTMLElement | string;
      readonly secondaryMouseButtonMode?: string;
      readonly artifactHash?: string;
    }
  | undefined;

const helperEntryPath = 'helper.scad';
const helperUnitId = `file:${helperEntryPath}`;
const rightRimComponentId = 'component:right-rim';
const mockArtifact = {
  mimeType: 'model/gltf-binary',
  content: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
} satisfies Artifact;
const mockRendering: Rendering = {
  success: true,
  view: 'model',
  artifact: mockArtifact,
  hash: 'test-rendering',
  requestId: 'test-request',
  evaluationId: 'test-evaluation',
  transient: false,
  issues: [],
};
function successfulEvaluation(evaluation: Evaluation): Extract<Evaluation, { success: true }> {
  if (!evaluation.success) {
    throw new Error('Expected a successful mock evaluation');
  }
  return evaluation;
}
function successfulRendering(rendering: Rendering): Extract<Rendering, { success: true }> {
  if (!rendering.success) {
    throw new Error('Expected a successful mock rendering');
  }
  return rendering;
}
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
        ...(mockPreviewEnabled ? { primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] } : {}),
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
  readonly rendering?: Rendering;
  readonly latestRenderingOutcome?: 'success' | 'failure';
  readonly kernelIssues?: Map<string, KernelIssue[]>;
  readonly tags?: ReadonlyArray<'cad-loading' | 'cad-runtime-error'>;
  readonly fileManagerReady?: boolean;
  readonly runtime?: MockRuntimeDocumentFixture;
  readonly evaluation?: Evaluation;
};

function createMockCadActor(options: MockCadActorOptions = {}): ActorRefFrom<typeof cadMachine> {
  const rendering = 'rendering' in options ? options.rendering : mockRendering;
  const runtime = options.runtime ?? createMockRuntimeDocument();
  if (!options.runtime && rendering) {
    vi.mocked(runtime.view.rendering).mockResolvedValue({ superseded: false, rendering });
  }
  const tags = new Set(options.tags);

  return {
    getSnapshot: vi.fn(() => ({
      context: {
        entryPath: helperEntryPath,
        rendering,
        evaluation: options.evaluation ?? runtime.evaluation,
        document: runtime.document,
        units: { length: 'mm' },
        latestRenderingOutcome: options.latestRenderingOutcome,
        kernelIssues: options.kernelIssues ?? new Map(),
        kernelClient: undefined,
        fileManagerRef: options.fileManagerReady ? {} : undefined,
        operationTimeout: defaultOperationTimeout,
        activeKernelId: undefined,
        capabilities: undefined,
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
      measurements: [],
      units: undefined,
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
      getSnapshot: vi.fn(() => ({ context: { viewSettings: mockViewSettings, unitSettings: mockUnitSettings } })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockEditorSend,
    },
    viewGraphics: mockViewGraphics,
    viewRecords: new Map(
      Object.entries(mockViewSettings).map(([id, settings]) => [
        id,
        workbenchRecords.view.schema.parse({
          version: 1,
          entryPath: settings.entryPath,
          fieldOfView: settings.graphicsSettings.cameraFovAngle,
          selectedKernelView: settings.selectedKernelView,
          kernelViews: settings.kernelViews,
          ...(settings.graphicsSettings.cameraView
            ? { camera: { kind: 'pose', ...settings.graphicsSettings.cameraView } }
            : {}),
        }),
      ]),
    ),
    entriesRecord: { version: 1, entries: mockUnitSettings },
    setViewEntryPath: vi.fn(),
    geometryUnits: mockGeometryUnits,
    mainEntryPath: mockMainEntryPath,
  }),
}));

vi.mock('#providers/part-thumbnail-provider.js', () => ({
  useOptionalPartThumbnailService: () => mockPreviewService,
}));

const mockCanonicalPartPreviews = vi.hoisted(() =>
  vi.fn(async () => ({ previews: [{ key: 'preview-key' }], visualKey: 'preview-key' })),
);
vi.mock('#services/part-thumbnail-visual.js', () => ({
  canonicalPartPreviews: mockCanonicalPartPreviews,
  sourceGlbDigest: async () => 'sha256:viewer-preview',
}));

vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionStatus: () =>
    useSyncExternalStore(
      (listener) => {
        mockSyncListeners.add(listener);
        return () => mockSyncListeners.delete(listener);
      },
      () => mockSyncStatus,
    ),
}));

// =============================================================================
// File tree / file content — surface a real file so we don't hit the missing /
// directory placeholder branches
// =============================================================================

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeSelector: <T,>(select: (tree: typeof mockFileTree) => T): T => select(mockFileTree),
}));

vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: () => mockFileContent,
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
    artifactHash,
  }: {
    readonly eventPrefix?: string;
    readonly eventSource?: unknown;
    readonly gizmoContainer?: HTMLElement | string;
    readonly onModelComponentSecondaryPointerCandidate?: (
      target: { readonly unitId: string; readonly componentId: string } | undefined,
    ) => void;
    readonly secondaryMouseButtonMode?: string;
    readonly artifactHash?: string;
  }) => {
    mockCadViewerProps = { eventPrefix, eventSource, gizmoContainer, secondaryMouseButtonMode, artifactHash };

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

// The issues list opens for a view notice; this stand-in shows the notice as the real list does.
vi.mock('#routes/w.$workspace.$project/chat-stack-trace.js', () => ({
  ViewerIssues: ({
    notice,
    children,
  }: {
    readonly notice?: { message: string; actionLabel: string; onAct: () => void };
    readonly children: (parts: { segment: React.ReactNode; list: React.ReactNode }) => React.ReactNode;
  }): React.ReactNode =>
    children({
      segment: <span data-testid='chat-stack-trace' />,
      list: notice ? (
        <div role='alert'>
          {notice.message}
          <button type='button' onClick={notice.onAct}>
            {notice.actionLabel}
          </button>
        </div>
      ) : null,
    }),
}));

vi.mock('#routes/w.$workspace.$project/chat-viewer-status.js', () => ({
  ChatViewerStatus: () => <span data-testid='chat-viewer-status' />,
}));

vi.mock('#routes/w.$workspace.$project/chat-viewer-controls.js', () => ({
  ChatViewerControls: ({
    captureRendering,
    leading,
    aboveControls,
  }: {
    captureRendering: () => Promise<Rendering>;
    leading?: React.ReactNode;
    aboveControls?: React.ReactNode;
  }) => {
    mockCaptureRendering = captureRendering;
    return (
      <div role='group' aria-label='Viewer controls'>
        {aboveControls}
        {leading}
      </div>
    );
  },
}));

vi.mock('#components/cad/ar-button.js', () => ({
  ArButton: () => <button type='button' aria-label='View in AR' />,
}));

// `use-graphics` drags in three.js via screenshot/camera capability machines, so
// stub the provider/hooks to avoid loading three under jsdom.
vi.mock('#hooks/use-graphics.js', () => ({
  GraphicsProvider: ({ children, seed }: { children: React.ReactNode; seed?: unknown }) => {
    mockCameraSeed = seed;
    mockGraphicsProviderMounts += 1;
    return <div>{children}</div>;
  },
  useGraphics: () => mockGraphicsActor,
  useGraphicsSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) => {
    const selectSnapshot = () =>
      selector({
        context: {
          enableSurfaces: true,
          enableLines: true,
          enableGizmo: true,
          enableGrid: true,
          enableAxes: true,
          enableMatcap: false,
          upDirection: 'z',
          isSectionViewActive: mockAreToolsRunning,
          isMeasureActive: mockAreToolsRunning,
          measurements: [],
          artifact: mockGraphicsProjection.artifact,
          artifactKey: mockGraphicsProjection.artifactKey,
          gltfPresentation: mockGltfPresentation,
        },
      });
    return useSyncExternalStore(subscribeGraphics, selectSnapshot, selectSnapshot);
  },
  useModelInteractionSelector: (selector: (state: { context: ModelInteractionContext }) => unknown) =>
    selector({ context: createModelInteractionContext() }),
  useKinematicsSelector: (
    selector: (state: { context: { unitsById: Record<string, never>; revision: number } }) => unknown,
  ) => selector({ context: { unitsById: {}, revision: 0 } }),
}));

const { ChatViewer } = await import('./chat-viewer.js');

const mockPanelApi = {
  setTitle: vi.fn(),
  updateParameters: vi.fn(),
} as unknown as DockviewPanelApi;

const renderViewer = (ui: React.ReactElement): ReturnType<typeof render> => render(ui, { wrapper: TooltipProvider });

describe('ChatViewer reopen-renderer overlay', () => {
  let getBoundingClientRectSpy: MockInstance<typeof HTMLElement.prototype.getBoundingClientRect> | undefined;

  beforeEach(() => {
    mockProjectSend.mockClear();
    mockEditorSend.mockClear();
    mockGraphicsSend.mockClear();
    mockGraphicsProjection = { artifact: mockRendering.artifact, artifactKey: mockRendering.hash };
    mockGltfPresentation.presentedKey = undefined;
    mockGraphicsSend.mockImplementation((event: { type: string; artifact?: Artifact; hash?: string }) => {
      if (event.type !== 'updateArtifact' && event.type !== 'clearArtifact') {
        return;
      }
      const next =
        event.type === 'clearArtifact'
          ? { artifact: undefined, artifactKey: undefined }
          : { artifact: event.artifact, artifactKey: event.hash };
      if (
        next.artifact === mockGraphicsProjection.artifact &&
        next.artifactKey === mockGraphicsProjection.artifactKey
      ) {
        return;
      }
      mockGraphicsProjection = next;
      for (const listener of mockGraphicsListeners) {
        listener();
      }
    });
    mockCaptureRendering = undefined;
    mockViewActions.edit.mockClear();
    mockViewActions.remove.mockClear();
    mockGeometryUnits = new Map();
    mockViewSettings = {};
    mockCameraSeed = undefined;
    mockGraphicsProviderMounts = 0;
    mockFileTree = new Map([[helperEntryPath, { type: 'file', name: helperEntryPath }]]);
    mockFileContent = { kind: 'text', text: 'cube();' };
    mockMainEntryPath = 'main.scad';
    mockSyncStatus = { sync: { state: 'backedUp' } };
    mockSyncListeners.clear();
    mockUnitSettings = {};
    mockHoveredComponentId = undefined;
    mockPreviewService = undefined;
    mockPreviewEnabled = false;
    mockCanonicalPartPreviews.mockReset();
    mockCanonicalPartPreviews.mockImplementation(async () => ({
      previews: [{ key: 'preview-key' }],
      visualKey: 'preview-key',
    }));
    mockAreToolsRunning = false;
    mockCadViewerSecondaryPointerMode = 'component-hit';
    mockCadViewerProps = undefined;
    mockViewGraphics.set('view-1', mockGraphicsActor);
    vi.mocked(mockPanelApi.updateParameters).mockClear();
    vi.mocked(mockPanelApi.setTitle).mockClear();
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

  it('opens, captures and closes the saved named projection without changing the CAD document', async () => {
    const runtime = createMockRuntimeDocument();
    const drawing: Rendering = {
      ...runtime.rendering,
      success: true,
      view: 'drawing',
      instance: 'sheet-1',
      artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
      hash: 'drawing',
    };
    vi.mocked(runtime.view.rendering).mockResolvedValue({ superseded: false, rendering: drawing });
    const evaluation: Evaluation = {
      ...successfulEvaluation(runtime.evaluation),
      success: true,
      views: [
        { id: 'model', title: 'Model', mimeType: 'model/gltf-binary' },
        { id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' },
      ],
    };
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: defaultGraphicsSettings,
        selectedKernelView: 'drawing',
        kernelViews: [{ id: 'drawing', options: { quality: 'high' }, authoredInstance: 'sheet-1' }],
      },
    };
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ runtime, evaluation, rendering: undefined }));

    const viewer = renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(runtime.viewSpy).toHaveBeenCalledWith('drawing', {
      options: { quality: 'high' },
      instance: 'sheet-1',
    });
    expect(runtime.document.update).not.toHaveBeenCalled();
    expect(runtime.document.close).not.toHaveBeenCalled();
    await expect(mockCaptureRendering?.()).resolves.toBe(drawing);
    const pending = Promise.withResolvers<ViewUpdateOutcome>();
    vi.mocked(runtime.view.rendering).mockReturnValueOnce(pending.promise);
    const capture = mockCaptureRendering?.();
    mockViewSettings['view-1'] = { ...mockViewSettings['view-1']!, selectedKernelView: 'model' };
    viewer.rerender(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);
    pending.resolve({ superseded: false, rendering: drawing });
    await expect(capture).rejects.toThrow('The selected view changed during capture.');
    viewer.unmount();
    expect(runtime.view.close).toHaveBeenCalledTimes(2);
    expect(runtime.document.close).not.toHaveBeenCalled();
  });

  it('re-renders the view from the options panel live draft before the record saves it', () => {
    const runtime = createMockRuntimeDocument();
    const evaluation: Evaluation = {
      ...successfulEvaluation(runtime.evaluation),
      views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
    };
    mockViewSettings = { 'view-1': { entryPath: helperEntryPath, graphicsSettings: defaultGraphicsSettings } };
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ runtime, evaluation, rendering: undefined }));
    const viewer = renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);
    const coarse = { tessellation: { linearTolerance: 0.02, angularTolerance: 80 } };

    // Each panel edit re-renders at once, with no record write in between.
    act(() => {
      setLiveViewOptions('view-1', { viewId: 'model', options: coarse });
    });
    expect(runtime.viewSpy).toHaveBeenLastCalledWith('model', { options: coarse });
    act(() => {
      setLiveViewOptions('view-1', {
        viewId: 'model',
        options: { tessellation: { ...coarse.tessellation, angularTolerance: 5 } },
      });
    });
    expect(runtime.viewSpy).toHaveBeenLastCalledWith('model', {
      options: { tessellation: { linearTolerance: 0.02, angularTolerance: 5 } },
    });
    const calls = runtime.viewSpy.mock.calls.length;

    // The record catches up and the draft yields: the same options keep the same subscription.
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: defaultGraphicsSettings,
        kernelViews: [{ id: 'model', options: { tessellation: { linearTolerance: 0.02, angularTolerance: 5 } } }],
      },
    };
    viewer.rerender(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);
    act(() => {
      setLiveViewOptions('view-1', undefined);
    });
    expect(runtime.viewSpy).toHaveBeenCalledTimes(calls);

    // A draft for another kernel view leaves this one alone.
    act(() => {
      setLiveViewOptions('view-1', { viewId: 'drawing', options: { scale: 2 } });
    });
    expect(runtime.viewSpy).toHaveBeenCalledTimes(calls);
    act(() => {
      setLiveViewOptions('view-1', undefined);
    });
    viewer.unmount();
  });

  it('switches a focused pane with digit keys but ignores editing controls', () => {
    const runtime = createMockRuntimeDocument();
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        runtime,
        evaluation: {
          ...successfulEvaluation(runtime.evaluation),
          views: [
            { id: 'model', title: 'Model', mimeType: 'model/gltf-binary' },
            { id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' },
          ],
        },
      }),
    );
    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const pane = screen.getByTestId('chat-viewer-layout');
    expect(screen.getByRole('button', { name: 'View: Model' })).toBeInTheDocument();
    const canvas = screen.getByRole('application', { name: 'CAD canvas' });
    canvas.focus();
    fireEvent.keyDown(canvas, { key: '2' });
    expect(mockViewActions.edit).toHaveBeenCalledWith('view-1', expect.any(Function));
    const change = mockViewActions.edit.mock.lastCall?.[1] as (record: undefined) => { selectedKernelView?: string };
    expect(change(undefined).selectedKernelView).toBe('drawing');

    mockViewActions.edit.mockClear();
    const input = document.createElement('input');
    pane.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: '1' });
    expect(mockViewActions.edit).not.toHaveBeenCalled();
    fireEvent.keyDown(canvas, { key: '2', isComposing: true });
    expect(mockViewActions.edit).not.toHaveBeenCalled();
  });

  it('keeps the prior picture through a pending and failed named-view switch', () => {
    const runtime = createMockRuntimeDocument();
    vi.mocked(runtime.view.rendering).mockImplementation(
      async () =>
        new Promise(() => {
          /* Pending replacement. */
        }),
    );
    const evaluation: Evaluation = {
      ...successfulEvaluation(runtime.evaluation),
      success: true,
      views: [
        { id: 'model', title: 'Model', mimeType: 'model/gltf-binary' },
        { id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' },
        { id: 'pcb', title: 'PCB', mimeType: 'image/svg+xml' },
      ],
    };
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: defaultGraphicsSettings,
        selectedKernelView: 'drawing',
      },
    };
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ runtime, evaluation, rendering: undefined }));
    const pane = renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);
    act(() => {
      runtime.emitRendered({ ...successfulRendering(runtime.rendering), hash: 'drawing-picture', view: 'drawing' });
    });
    expect(mockCadViewerProps?.artifactHash).toBe('drawing-picture');

    mockViewSettings = {
      'view-1': { entryPath: helperEntryPath, graphicsSettings: defaultGraphicsSettings, selectedKernelView: 'pcb' },
    };
    pane.rerender(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} profile='shared' />);
    expect(screen.queryByRole('button', { name: /^View:/ })).not.toBeInTheDocument();
    expect(runtime.viewSpy).toHaveBeenLastCalledWith('pcb', { options: {} });
    expect(mockCadViewerProps?.artifactHash).toBe('drawing-picture');
    act(() => {
      runtime.emitViewStatus('error');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The selected view is unavailable.');
    act(() => {
      runtime.emitRendered({
        success: false,
        requestId: 'pcb-failed',
        evaluationId: evaluation.id,
        transient: false,
        issues: [{ message: 'PCB render failed', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      });
      runtime.emitViewStatus('error');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('PCB render failed');
    expect(mockCadViewerProps?.artifactHash).toBe('drawing-picture');
    pane.unmount();
  });

  it('leaves a failed evaluation to the Issues card instead of a view alert', () => {
    const runtime = createMockRuntimeDocument();
    const issue = { message: 'Compile failed', code: 'RUNTIME', type: 'runtime', severity: 'error' } as const;
    const evaluation: Evaluation = { id: 'failed-evaluation', success: false, transient: false, issues: [issue] };
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ runtime, evaluation, rendering: undefined }));
    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    act(() => {
      runtime.emitRendered({
        success: false,
        requestId: 'default-failed',
        evaluationId: evaluation.id,
        transient: false,
        issues: [issue],
      });
      runtime.emitViewStatus('error');
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use default view' })).not.toBeInTheDocument();
  });

  it('preserves an unavailable saved projection until the user explicitly recovers', () => {
    const runtime = createMockRuntimeDocument();
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: defaultGraphicsSettings,
        selectedKernelView: 'missing-drawing',
      },
    };
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ runtime }));

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Saved view “missing-drawing” is unavailable');
    expect(runtime.viewSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cad-viewer-canvas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use default view' }));
    expect(mockViewActions.edit).toHaveBeenCalledWith('view-1', expect.any(Function));
  });

  it('clears the displayed picture when an evaluation succeeds with no views', () => {
    const runtime = createMockRuntimeDocument();
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        runtime,
        evaluation: { ...successfulEvaluation(runtime.evaluation), views: [] },
        rendering: mockRendering,
      }),
    );

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.queryByTestId('cad-viewer-canvas')).not.toBeInTheDocument();
    expect(runtime.viewSpy).not.toHaveBeenCalled();
  });

  it('presents a successful Replicad empty GLB offer as an accessible empty model', async () => {
    const runtime = createMockRuntimeDocument();
    const emptyRendering: Rendering = {
      ...mockRendering,
      artifact: { mimeType: 'model/gltf-binary', content: createEmptyGlb() },
      hash: 'empty-model',
    };
    vi.mocked(runtime.view.rendering).mockResolvedValue({ superseded: false, rendering: emptyRendering });
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ runtime, rendering: emptyRendering }));

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByRole('status', { name: 'Empty model' })).toBeInTheDocument();
    expect(screen.queryByTestId('cad-viewer-canvas')).not.toBeInTheDocument();
    expect(mockGraphicsSend).toHaveBeenCalledWith({ type: 'clearArtifact' });
    expect(mockGraphicsSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'updateArtifact', hash: 'empty-model' }),
    );
  });

  it('renders the Reopen renderer button when the geometry unit is closed', () => {
    // `entryPath` is set, the file exists, but geometryUnits.get(entryPath) === undefined
    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
  });

  it('dispatches createGeometryUnit when Reopen renderer is clicked', () => {
    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireEvent.click(screen.getByRole('button', { name: /reopen renderer/i }));

    expect(mockProjectSend).toHaveBeenCalledTimes(1);
    expect(mockProjectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryPath: helperEntryPath,
    });
  });

  it('does not render the overlay when a geometry unit exists for the entry path', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.queryByRole('button', { name: /reopen renderer/i })).not.toBeInTheDocument();
  });

  it('leaves an editor failure to the existing issue panel when no geometry exists', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        rendering: undefined,
        latestRenderingOutcome: 'failure',
        kernelIssues: new Map([
          [
            helperEntryPath,
            [{ message: 'editor failure sentinel', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
          ],
        ]),
      }),
    );

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('chat-stack-trace')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Waiting for geometry' })).toBeInTheDocument();
    expect(screen.queryByTestId('cad-viewer-canvas')).not.toBeInTheDocument();
  });

  it('leaves editor connection failures to the existing issue panel', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        rendering: undefined,
        kernelIssues: new Map([
          [
            '__connection__',
            [{ message: 'desktop runtime connection sentinel', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
          ],
        ]),
        tags: ['cad-runtime-error'],
      }),
    );

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('chat-stack-trace')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
  });

  it('keeps retained geometry visible without duplicating the editor issue panel', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        latestRenderingOutcome: 'failure',
        kernelIssues: new Map([
          [
            helperEntryPath,
            [{ message: 'stale geometry sentinel', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
          ],
        ]),
      }),
    );

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('chat-stack-trace')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
  });

  it('keeps the runtime overlay for shared viewers that have no issue panel', () => {
    const message = 'shared failure sentinel';
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        latestRenderingOutcome: 'failure',
        kernelIssues: new Map([[helperEntryPath, [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }]]]),
      }),
    );

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} profile='shared' />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    expect(screen.getByRole('alert', { name: 'CAD runtime error' })).toHaveTextContent(message);
    expect(screen.queryByTestId('chat-stack-trace')).not.toBeInTheDocument();
  });

  it('does not present warnings from a successful render as a failure', () => {
    mockGeometryUnits.set(
      helperEntryPath,
      createMockCadActor({
        latestRenderingOutcome: 'success',
        kernelIssues: new Map([
          [helperEntryPath, [{ message: 'warning sentinel', code: 'RUNTIME', type: 'runtime', severity: 'warning' }]],
        ]),
      }),
    );

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'CAD runtime error' })).not.toBeInTheDocument();
  });

  it('uses the semantic loading tag while geometry is pending', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ rendering: undefined, tags: ['cad-loading'] }));

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('status', { name: 'Loading geometry' })).toHaveAttribute('aria-busy', 'true');
  });

  /* Law 1: one create-only seed carries every camera-owned key. A project that is navigated away
   * from keeps its graphics actor, so the seed is what a cold load uses and revisit ignores. */
  it('passes one camera seed built from the persisted settings and the current entry', () => {
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

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(mockCameraSeed).toEqual({
      identity: helperEntryPath,
      camera: { cameraFovAngle: 42, cameraView: { kind: 'pose', ...cameraView } },
    });
  });

  /* R8: a branch with no canvas has nothing to drive a camera, and building one there would latch
   * the persisted pose against an entry the person never rendered. */
  it('builds no camera session on the branches that render no canvas', () => {
    mockViewSettings = {
      'view-1': { entryPath: helperEntryPath, graphicsSettings: { ...defaultGraphicsSettings } },
    };

    const noFile = renderViewer(<ChatViewer viewId='view-1' entryPath={undefined} panelApi={mockPanelApi} />);
    expect(mockGraphicsProviderMounts).toBe(0);
    noFile.unmount();

    mockFileTree = new Map([['src/parts/gear.scad', { type: 'file', name: 'gear.scad' }]]);
    const directory = renderViewer(<ChatViewer viewId='view-1' entryPath='src/parts' panelApi={mockPanelApi} />);
    expect(mockGraphicsProviderMounts).toBe(0);
    directory.unmount();

    mockFileTree = new Map();
    mockFileContent = { kind: 'orphaned' };
    renderViewer(<ChatViewer viewId='view-1' entryPath='gone.scad' panelApi={mockPanelApi} />);
    expect(mockGraphicsProviderMounts).toBe(0);
    expect(mockCameraSeed).toBeUndefined();
  });

  it('shows the initial remote check, then follows the main file named by the synced manifest', () => {
    mockFileTree = new Map();
    mockFileContent = { kind: 'orphaned' };
    mockSyncStatus = { sync: { state: 'checking' } };
    const viewer = renderViewer(<ChatViewer viewId='view-1' entryPath='main.scad' panelApi={mockPanelApi} />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking synced files…');
    expect(screen.queryByText('File not found')).not.toBeInTheDocument();

    act(() => {
      mockSyncStatus = { sync: { state: 'backedUp' } };
      for (const listener of mockSyncListeners) {
        listener();
      }
    });
    expect(screen.getByText('File not found')).toBeInTheDocument();

    mockMainEntryPath = 'bracket.scad';
    viewer.rerender(<ChatViewer viewId='view-1' entryPath='main.scad' panelApi={mockPanelApi} profile='shared' />);

    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'createGeometryUnit', entryPath: 'bracket.scad' });
    expect(mockPanelApi.updateParameters).toHaveBeenCalledWith({ entryPath: 'bracket.scad' });
    expect(mockPanelApi.setTitle).toHaveBeenCalledWith('bracket.scad');
  });

  it('keeps a viewer on a user-selected file when the synced main file changes', () => {
    const viewer = renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    mockMainEntryPath = 'bracket.scad';
    viewer.rerender(
      <ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} profile='shared' />,
    );

    expect(mockPanelApi.updateParameters).not.toHaveBeenCalled();
  });

  it('recovers a missing file when its content arrives at the same path', () => {
    mockFileTree = new Map();
    mockFileContent = { kind: 'orphaned' };
    const viewer = renderViewer(<ChatViewer viewId='view-1' entryPath='main.scad' panelApi={mockPanelApi} />);
    expect(screen.getByText('File not found')).toBeInTheDocument();

    mockFileTree = new Map([['main.scad', { type: 'file', name: 'main.scad' }]]);
    mockFileContent = { kind: 'text', text: 'cube();' };
    viewer.rerender(<ChatViewer viewId='view-1' entryPath='main.scad' panelApi={mockPanelApi} profile='shared' />);

    expect(screen.queryByText('File not found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
  });

  /* Finding 4 / E1: the render timeout is owned per file by the entry's CAD actor and seeded at
   * spawn. A mount-scoped push would rewrite a live owner from a stale record on every revisit. */
  it('sends no render timeout from a mount effect and seeds a reopened unit instead', () => {
    mockViewSettings = {
      'view-1': {
        entryPath: helperEntryPath,
        graphicsSettings: { ...defaultGraphicsSettings },
      },
    };
    mockUnitSettings = { [helperEntryPath]: { renderTimeout: 30_000 } };
    const cadActor = createMockCadActor();
    mockGeometryUnits.set(helperEntryPath, cadActor);

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(cadActor.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setOperationTimeout' }));

    mockGeometryUnits.delete(helperEntryPath);
    mockProjectSend.mockClear();
    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);
    fireEvent.click(screen.getAllByRole('button', { name: /reopen renderer/i })[0]!);

    expect(mockProjectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryPath: helperEntryPath,
      operationTimeout: 30_000,
    });
  });

  it('should switch a shared preview file without writing an editor view record', () => {
    renderViewer(<ChatViewer viewId='view-1' entryPath={undefined} panelApi={mockPanelApi} profile='shared' />);
    fireEvent.click(screen.getByTestId('file-selector'));
    expect(mockPanelApi.updateParameters).toHaveBeenCalledWith({ entryPath: 'other.scad' });
    expect(mockViewActions.edit).not.toHaveBeenCalled();
  });

  it('should clear the camera pose, every cut and every measurement when the pane switches files', () => {
    const pinned = {
      id: 'measurement-pinned',
      frameId: 'tau:root',
      startPoint: [0, 0, 0],
      endPoint: [0.02, 0, 0],
      distance: 0.02,
    } satisfies PinnedMeasurement;
    const graphics = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: { pinnedMeasurements: [pinned] } },
    ).start();
    onTestFinished(() => {
      graphics.stop();
    });
    graphics.send({ type: 'setSectionViewActive', payload: true });
    graphics.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    expect(graphics.getSnapshot().context.sectionCuts).toHaveLength(2);
    // Measuring, with one unpinned measurement and a point placed toward the next.
    graphics.send({ type: 'setMeasureActive', payload: true });
    graphics.send({ type: 'startMeasurement', payload: [0, 0, 0] });
    graphics.send({ type: 'completeMeasurement', payload: [0, 0.01, 0] });
    graphics.send({ type: 'startMeasurement', payload: [0, 0, 0.01] });
    expect(graphics.getSnapshot().context.measurements).toHaveLength(2);
    mockViewGraphics.set('view-1', graphics);
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
        graphicsSettings: {
          ...defaultGraphicsSettings,
          cameraFovAngle: 42,
          cameraView,
          sectionView: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: true }] },
        },
      },
    };
    renderViewer(<ChatViewer viewId='view-1' entryPath={undefined} panelApi={mockPanelApi} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select another file' }));

    expect(mockViewActions.edit).toHaveBeenCalledWith('view-1', expect.any(Function));
    const change = mockViewActions.edit.mock.lastCall?.[1] as (
      current: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => unknown;
    expect(change(workbenchRecords.view.schema.parse({ version: 1, entryPath: helperEntryPath }))).toMatchObject({
      entryPath: 'other.scad',
      camera: { kind: 'preset', preset: 'isometric' },
      section: { active: false, cuts: [] },
      measurements: [],
    });
    /* The retained actor must drop the cuts and measurements too: Section off alone keeps the cuts, the
     * pinned measurement still draws, and the next persist writes both -- placed on geometry that is no
     * longer open -- into the record the clear just emptied. */
    expect(graphics.getSnapshot().context).toMatchObject({
      sectionCuts: [],
      isSectionViewActive: false,
      measurements: [],
      currentMeasurementStart: undefined,
    });
  });

  it('should centre the bar on the last line of a strip that passes pointer events to the canvas, never past its left edge', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const bar = screen.getByRole('group', { name: 'Viewer controls' });
    const strip = bar.parentElement!;
    expect(strip).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-x-2',
      'bottom-2',
      'flex-col',
      'items-center-safe',
    );
    expect(strip).not.toHaveClass('items-center');
    expect(strip.lastElementChild).toBe(bar);
  });

  it('should keep the AR button on the line above the bar and the issues inside the bar', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const line = screen.getByRole('button', { name: 'View in AR' }).parentElement!;
    const bar = screen.getByRole('group', { name: 'Viewer controls' });
    expect(line).toHaveClass('[&>*]:pointer-events-auto');
    expect(line.nextElementSibling).toBe(bar);
    expect(bar).toContainElement(screen.getByTestId('chat-stack-trace'));
  });

  it('should make the viewer root the frame the shortcuts target and the container the bar sizes to', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const root = screen.getByTestId('chat-viewer-layout');
    expect(root).toHaveAttribute('data-viewer-frame');
    expect(root).toHaveClass('@container/viewer');
    expect(root).toContainElement(screen.getByRole('group', { name: 'Viewer controls' }));
  });

  it('should leave running tools to the bar, with no status chip or tool panel', () => {
    mockAreToolsRunning = true;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByRole('group', { name: 'Viewer controls' })).toBeInTheDocument();
    expect(screen.queryByText(/section view|measur/i)).not.toBeInTheDocument();
  });

  it('should centre the build status in an empty viewer, where the model will appear', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor({ rendering: undefined, tags: ['cad-loading'] }));

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.queryByTestId('cad-viewer-canvas')).not.toBeInTheDocument();
    const overlay = screen.getByTestId('chat-viewer-status').parentElement!;
    expect(overlay).toHaveClass('absolute', 'top-1/2', '-translate-y-1/2');
  });

  it('should keep the build status in the upper band over a model, below the gizmo and above its middle', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    expect(screen.getByTestId('cad-viewer-canvas')).toBeInTheDocument();
    const overlay = screen.getByTestId('chat-viewer-status').parentElement!;
    expect(overlay).toHaveClass('absolute', 'top-[clamp(5rem,16%,8rem)]');
    expect(overlay).not.toHaveClass('top-1/2');
  });

  it('anchors the gizmo to the clipped canvas region', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    expect(document.querySelector(mockCadViewerProps?.gizmoContainer as string)).toBe(canvasRegion);
    expect(canvasRegion).toHaveClass('relative', 'overflow-hidden');
  });

  it('should show the hovered component name under the pointer when the canvas has a hovered component', () => {
    mockHoveredComponentId = rightRimComponentId;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    const label = screen.getByTestId('model-component-name-badge');
    expect(label).toHaveTextContent('Right Rim');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(label.className).toContain('pointer-events-none');
    // The badge is placed from custom properties written straight to the
    // layout element, so a pointer move never re-renders the viewer subtree.
    expect(screen.getByTestId('chat-viewer-layout')).toHaveStyle({
      '--viewer-hover-label-x': '64px',
      '--viewer-hover-label-y': '72px',
    });
    expect(label).toHaveStyle({
      left: 'var(--viewer-hover-label-x, 0px)',
      top: 'var(--viewer-hover-label-y, 0px)',
    });
  });

  it('should place the hover badge on later pointer moves without re-rendering the viewer', () => {
    mockHoveredComponentId = rightRimComponentId;
    const cadActor = createMockCadActor();
    const onRender = vi.fn();
    mockGeometryUnits.set(helperEntryPath, cadActor);

    render(
      <Profiler id='viewer' onRender={onRender}>
        <ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />
      </Profiler>,
    );

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    fireCanvasPointerMove(canvasRegion, { clientX: 74, clientY: 92 });

    // React can retry a render while bailing out a repeated state update.
    // The profiler counts committed renders, which pointer movement must avoid.
    const commitsAfterFirstMove = onRender.mock.calls.length;
    fireCanvasPointerMove(canvasRegion, { clientX: 120, clientY: 140 });
    fireCanvasPointerMove(canvasRegion, { clientX: 160, clientY: 180 });

    expect(onRender.mock.calls.length).toBe(commitsAfterFirstMove);
    expect(screen.getByTestId('chat-viewer-layout')).toHaveStyle({
      '--viewer-hover-label-x': '150px',
      '--viewer-hover-label-y': '160px',
    });
  });

  it('should flip the hover badge above the pointer as the pointer nears the top of a grown bar', () => {
    mockHoveredComponentId = rightRimComponentId;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    // The viewer spans y 20–320; with three rows open the bottom controls start 150 px above its bottom edge.
    const bottomControls = screen.getByRole('group', { name: 'Viewer controls' }).parentElement!;
    // An own method: the prototype is already spied for every element.
    bottomControls.getBoundingClientRect = () => new DOMRect(18, 170, 484, 142);
    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    const layout = screen.getByTestId('chat-viewer-layout');

    fireCanvasPointerMove(canvasRegion, { clientX: 74, clientY: 150 });
    expect(layout).toHaveStyle({ '--viewer-hover-label-translate-y': 'calc(-100% - 10px)' });

    fireCanvasPointerMove(canvasRegion, { clientX: 74, clientY: 100 });
    expect(layout).toHaveStyle({ '--viewer-hover-label-translate-y': '10px' });
  });

  it('should hide the hovered component label when the pointer leaves the canvas region', () => {
    mockHoveredComponentId = rightRimComponentId;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    fireCanvasPointerMove(canvasRegion, { clientX: 74, clientY: 92 });
    expect(screen.getByText('Right Rim')).toBeInTheDocument();

    fireEvent.pointerLeave(canvasRegion);

    expect(screen.queryByText('Right Rim')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when no component is hovered', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when the hovered id is absent from the manifest', () => {
    mockHoveredComponentId = 'component:missing';
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when the geometry unit is closed', () => {
    mockHoveredComponentId = rightRimComponentId;

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should open the model component action menu from a viewer right-click', async () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

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
    expect(screen.getByRole('spinbutton', { name: 'Opacity' })).toHaveValue('100');

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

  it('submits one manual preview request for each completed retry in the viewer menu', async () => {
    mockPreviewEnabled = true;
    presentPreviewSource(mockRendering.artifact, mockRendering.hash);
    const requestForOwner = vi.fn();
    const failedSnapshot: ReadonlyMap<string, PartThumbnailState> = new Map([
      [rightRimComponentId, { status: 'failed' }],
    ]);
    mockPreviewService = {
      subscribe: () => () => undefined,
      snapshot: () => failedSnapshot,
      announcePresentedSource: vi.fn(),
      releaseOwner: vi.fn(),
      requestForOwner,
      dispose: vi.fn(),
    } as unknown as PartThumbnailService;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());
    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const openMenu = (): void => {
      const canvas = screen.getByTestId('cad-viewer-canvas');
      fireCanvasPointerEvent(canvas, 'pointerdown', { button: 2, pointerId: 31, clientX: 150, clientY: 180 });
      fireCanvasPointerEvent(canvas, 'pointerup', { button: 2, pointerId: 31, clientX: 151, clientY: 181 });
    };
    openMenu();
    await waitFor(() => {
      expect(requestForOwner).toHaveBeenCalled();
    });
    for (const count of [1, 2]) {
      // oxlint-disable-next-line no-await-in-loop -- The previous failed manual preview must settle before retrying again.
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Retry preview' }));
      // oxlint-disable-next-line no-await-in-loop -- Count completed manual admissions in order.
      await waitFor(() => {
        expect(requestForOwner.mock.calls.filter((call) => call[3]?.manualPartId === rightRimComponentId)).toHaveLength(
          count,
        );
      });
      if (count === 1) {
        openMenu();
      }
    }
  });

  it('resumes an unsubmitted retry for the same source and drops it after a source change', async () => {
    mockPreviewEnabled = true;
    presentPreviewSource(mockRendering.artifact, mockRendering.hash);
    const requestForOwner = vi.fn();
    const announcePresentedSource = vi.fn();
    const failedSnapshot: ReadonlyMap<string, PartThumbnailState> = new Map([
      [rightRimComponentId, { status: 'failed' }],
    ]);
    mockPreviewService = {
      subscribe: () => () => undefined,
      snapshot: () => failedSnapshot,
      announcePresentedSource,
      releaseOwner: vi.fn(),
      requestForOwner,
      dispose: vi.fn(),
    } as unknown as PartThumbnailService;
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());
    const tree = (profile: 'editor' | 'shared' = 'editor') => (
      <ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} profile={profile} />
    );
    const view = render(tree());
    const openMenu = (): void => {
      const canvas = screen.getByTestId('cad-viewer-canvas');
      fireCanvasPointerEvent(canvas, 'pointerdown', { button: 2, pointerId: 32, clientX: 150, clientY: 180 });
      fireCanvasPointerEvent(canvas, 'pointerup', { button: 2, pointerId: 32, clientX: 151, clientY: 181 });
    };
    const manualCalls = () =>
      requestForOwner.mock.calls.filter((call) => call[3]?.manualPartId === rightRimComponentId);
    openMenu();
    await waitFor(() => {
      expect(requestForOwner).toHaveBeenCalled();
    });

    const canceled = Promise.withResolvers<{ previews: Array<{ key: string }>; visualKey: string }>();
    const beforeRetry = mockCanonicalPartPreviews.mock.calls.length;
    mockCanonicalPartPreviews.mockImplementation(async () => canceled.promise);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Retry preview' }));
    await waitFor(() => {
      expect(mockCanonicalPartPreviews.mock.calls.length).toBeGreaterThan(beforeRetry);
    });
    mockCanonicalPartPreviews.mockImplementation(async () => ({
      previews: [{ key: 'preview-key' }],
      visualKey: 'preview-key',
    }));
    act(() => {
      presentPreviewSource({ ...mockArtifact }, mockRendering.hash);
    });
    view.rerender(tree('shared'));
    await waitFor(() => {
      expect(manualCalls()).toHaveLength(1);
    });
    await act(async () => {
      canceled.resolve({ previews: [{ key: 'preview-key' }], visualKey: 'preview-key' });
      await canceled.promise;
    });
    expect(manualCalls()).toHaveLength(1);

    openMenu();
    const stale = Promise.withResolvers<{ previews: Array<{ key: string }>; visualKey: string }>();
    const beforeStaleRetry = mockCanonicalPartPreviews.mock.calls.length;
    mockCanonicalPartPreviews.mockImplementation(async () => stale.promise);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Retry preview' }));
    await waitFor(() => {
      expect(mockCanonicalPartPreviews.mock.calls.length).toBeGreaterThan(beforeStaleRetry);
    });
    mockCanonicalPartPreviews.mockImplementation(async () => ({
      previews: [{ key: 'preview-key' }],
      visualKey: 'preview-key',
    }));
    act(() => {
      presentPreviewSource({ ...mockArtifact }, 'new-source');
    });
    view.rerender(tree());
    await act(async () => {
      stale.resolve({ previews: [{ key: 'preview-key' }], visualKey: 'preview-key' });
      await stale.promise;
    });
    expect(manualCalls()).toHaveLength(1);
    view.rerender(tree());
    expect(manualCalls()).toHaveLength(1);
    const beforeReturn = announcePresentedSource.mock.calls.length;
    act(() => {
      presentPreviewSource({ ...mockArtifact }, mockRendering.hash);
    });
    view.rerender(tree('shared'));
    await waitFor(() => {
      expect(announcePresentedSource.mock.calls.length).toBeGreaterThan(beforeReturn);
    });
    expect(manualCalls()).toHaveLength(1);
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Retry preview' }));
    await waitFor(() => {
      expect(manualCalls()).toHaveLength(2);
    });
  });

  it('should keep a right-button drag as camera pan instead of opening model component actions', () => {
    mockGeometryUnits.set(helperEntryPath, createMockCadActor());

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

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

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

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

    renderViewer(<ChatViewer viewId='view-1' entryPath={helperEntryPath} panelApi={mockPanelApi} />);

    const contextMenuEvent = fireInspectableContextMenu(screen.getByTestId('cad-viewer-canvas-region'));

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(screen.queryByText('Focus on part')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide')).not.toBeInTheDocument();
  });
});
