import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { DockviewApi, DockviewPanelApi } from 'dockview-react';
import type { GeometryComponentManifest } from '@taucad/types';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';

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
let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
let mockHoveredComponentId: string | undefined;

const helperEntryFile = 'helper.scad';
const helperUnitId = `file:${helperEntryFile}`;
const rightRimComponentId = 'component:right-rim';

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
    sourceFile: helperEntryFile,
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
    activeUnitId: helperUnitId,
    viewerHoverSuppressionReasons: [],
    isViewerHoverSuppressed: false,
    revision: 0,
    displayRevision: 0,
    lastInteractionSource: 'viewer',
  };
}

function createMockCadActor(): ActorRefFrom<typeof cadMachine> {
  return {
    getSnapshot: vi.fn(() => ({
      context: {
        geometries: [],
        units: { length: { symbol: 'mm', factor: 1 } },
        kernelClient: undefined,
        renderTimeout: defaultRenderTimeout,
      },
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
    },
  })),
  send: vi.fn(),
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
      getSnapshot: vi.fn(() => ({ context: { viewSettings: {} } })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockEditorSend,
    },
    viewGraphics: mockViewGraphics,
    geometryUnits: mockGeometryUnits,
    mainEntryFile: 'main.scad',
  }),
}));

// =============================================================================
// File tree / file content — surface a real file so we don't hit the missing /
// directory placeholder branches
// =============================================================================

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () =>
    new Map<string, { type: 'file' | 'dir'; name: string }>([
      [helperEntryFile, { type: 'file', name: helperEntryFile }],
    ]),
}));

vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: () => ({ kind: 'text', text: 'cube();' }),
}));

// =============================================================================
// Children that aren't relevant to the overlay assertion
// =============================================================================

vi.mock('#components/geometry/cad/cad-viewer.js', () => ({
  CadViewer: () => <div data-testid='cad-viewer-canvas' />,
}));

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: () => <div data-testid='file-selector' />,
}));

vi.mock('#routes/projects_.$id/chat-stack-trace.js', () => ({
  ChatStackTrace: () => null,
}));

vi.mock('#routes/projects_.$id/chat-viewer-status.js', () => ({
  ChatViewerStatus: () => null,
}));

vi.mock('#routes/projects_.$id/chat-viewer-controls.js', () => ({
  ChatViewerControls: () => null,
}));

vi.mock('#routes/projects_.$id/chat-interface-graphics.js', () => ({
  ChatInterfaceGraphics: () => null,
}));

vi.mock('#routes/projects_.$id/chat-interface-status.js', () => ({
  ChatInterfaceStatus: () => null,
}));

vi.mock('#components/cad/ar-button.js', () => ({
  ArButton: () => null,
}));

vi.mock('#components/panes/use-is-top-right-group.js', () => ({
  useIsTopRightPanel: () => false,
}));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => false,
}));

vi.mock('#hooks/use-view-settings-sync.js', () => ({
  useViewSettingsSync: () => undefined,
}));

// `use-graphics` drags in three.js via screenshot/camera capability machines, so
// stub the provider/hooks to avoid loading three under jsdom.
vi.mock('#hooks/use-graphics.js', () => ({
  GraphicsProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

const mockContainerApi = {} as unknown as DockviewApi;

describe('ChatViewer reopen-renderer overlay', () => {
  let getBoundingClientRectSpy: MockInstance<typeof HTMLElement.prototype.getBoundingClientRect> | undefined;

  beforeEach(() => {
    mockProjectSend.mockClear();
    mockEditorSend.mockClear();
    mockGeometryUnits = new Map();
    mockHoveredComponentId = undefined;
    mockViewGraphics.set('view-1', mockGraphicsActor);
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(10, 20, 500, 300));
  });

  afterEach(() => {
    getBoundingClientRectSpy?.mockRestore();
    getBoundingClientRectSpy = undefined;
  });

  it('renders the Reopen renderer button when the geometry unit is closed', () => {
    // `entryFile` is set, the file exists, but geometryUnits.get(entryFile) === undefined
    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
  });

  it('dispatches createGeometryUnit when Reopen renderer is clicked', () => {
    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reopen renderer/i }));

    expect(mockProjectSend).toHaveBeenCalledTimes(1);
    expect(mockProjectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryFile: helperEntryFile,
    });
  });

  it('does not render the overlay when a geometry unit exists for the entry file', () => {
    mockGeometryUnits.set(helperEntryFile, createMockCadActor());

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    expect(screen.queryByRole('button', { name: /reopen renderer/i })).not.toBeInTheDocument();
  });

  it('lets empty bottom-control overlay space pass pointer events through to the canvas', () => {
    mockGeometryUnits.set(helperEntryFile, createMockCadActor());

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    const overlay = screen.getByTestId('chat-viewer-bottom-controls-overlay');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('[&>*]:pointer-events-auto');
  });

  it('should show the hovered component name under the pointer when the canvas has a hovered component', () => {
    mockHoveredComponentId = rightRimComponentId;
    mockGeometryUnits.set(helperEntryFile, createMockCadActor());

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

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
    mockGeometryUnits.set(helperEntryFile, createMockCadActor());

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    const canvasRegion = screen.getByTestId('cad-viewer-canvas-region');
    fireCanvasPointerMove(canvasRegion, { clientX: 74, clientY: 92 });
    expect(screen.getByText('Right Rim')).toBeInTheDocument();

    fireEvent.pointerLeave(canvasRegion);

    expect(screen.queryByText('Right Rim')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when no component is hovered', () => {
    mockGeometryUnits.set(helperEntryFile, createMockCadActor());

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when the hovered id is absent from the manifest', () => {
    mockHoveredComponentId = 'component:missing';
    mockGeometryUnits.set(helperEntryFile, createMockCadActor());

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });

  it('should not render the hovered component label when the geometry unit is closed', () => {
    mockHoveredComponentId = rightRimComponentId;

    render(
      <ChatViewer
        viewId='view-1'
        entryFile={helperEntryFile}
        panelApi={mockPanelApi}
        containerApi={mockContainerApi}
      />,
    );

    fireCanvasPointerMove(screen.getByTestId('cad-viewer-canvas-region'), { clientX: 74, clientY: 92 });

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
    expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
  });
});
