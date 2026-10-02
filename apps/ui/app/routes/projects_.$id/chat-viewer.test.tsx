import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { DockviewApi, DockviewPanelApi } from 'dockview-react';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';

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
    new Map<string, { type: 'file' | 'dir'; name: string }>([['helper.scad', { type: 'file', name: 'helper.scad' }]]),
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
}));

const { ChatViewer } = await import('./chat-viewer.js');

const mockPanelApi = {
  setTitle: vi.fn(),
  updateParameters: vi.fn(),
} as unknown as DockviewPanelApi;

const mockContainerApi = {} as unknown as DockviewApi;

describe('ChatViewer reopen-renderer overlay', () => {
  beforeEach(() => {
    mockProjectSend.mockClear();
    mockEditorSend.mockClear();
    mockGeometryUnits = new Map();
    mockViewGraphics.set('view-1', mockGraphicsActor);
  });

  it('renders the Reopen renderer button when the geometry unit is closed', () => {
    // `entryFile` is set, the file exists, but geometryUnits.get(entryFile) === undefined
    render(
      <ChatViewer viewId='view-1' entryFile='helper.scad' panelApi={mockPanelApi} containerApi={mockContainerApi} />,
    );

    expect(screen.getByRole('button', { name: /reopen renderer/i })).toBeInTheDocument();
  });

  it('dispatches createGeometryUnit when Reopen renderer is clicked', () => {
    render(
      <ChatViewer viewId='view-1' entryFile='helper.scad' panelApi={mockPanelApi} containerApi={mockContainerApi} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reopen renderer/i }));

    expect(mockProjectSend).toHaveBeenCalledTimes(1);
    expect(mockProjectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryFile: 'helper.scad',
    });
  });

  it('does not render the overlay when a geometry unit exists for the entry file', () => {
    const cadActor = {
      getSnapshot: vi.fn(() => ({
        context: {
          geometries: [],
          units: { length: { symbol: 'mm', factor: 1 } },
          kernelClient: undefined,
          renderTimeout: 30_000,
        },
      })),
      send: vi.fn(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      id: 'cad-test-helper-scad',
    } as unknown as ActorRefFrom<typeof cadMachine>;
    mockGeometryUnits.set('helper.scad', cadActor);

    render(
      <ChatViewer viewId='view-1' entryFile='helper.scad' panelApi={mockPanelApi} containerApi={mockContainerApi} />,
    );

    expect(screen.queryByRole('button', { name: /reopen renderer/i })).not.toBeInTheDocument();
  });
});
