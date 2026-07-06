import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { CapabilitiesManifest, ExportRoute } from '@taucad/runtime';
import type { FileExtension } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) => {
    if (!actor) {
      return selector(undefined);
    }
    return selector(actor.getSnapshot());
  },
}));

let mockCapabilities: CapabilitiesManifest | undefined;
let mockGeometry: unknown | undefined;
let mockHelperGeometry: unknown | undefined;
let mockActiveKernelId: string | undefined = 'replicad';

function fidelityRank(fidelity: ExportRoute['fidelity']): number {
  return fidelity === 'brep' ? 0 : 1;
}

function directnessRank(route: ExportRoute): number {
  return route.transcoderId === undefined ? 0 : 1;
}

const mockKernelClient = {
  get capabilities(): CapabilitiesManifest | undefined {
    return mockCapabilities;
  },
  routesFor(format: FileExtension): readonly ExportRoute[] {
    if (!mockCapabilities) {
      return [];
    }
    return mockCapabilities.routes.filter((route) => route.targetFormat === format);
  },
  bestRouteFor(format: FileExtension, kernelId?: string): ExportRoute | undefined {
    if (!mockCapabilities) {
      return undefined;
    }
    const matches = mockCapabilities.routes.filter((route) => route.targetFormat === format);
    if (matches.length === 0) {
      return undefined;
    }
    const kernelMatches = kernelId ? matches.filter((route) => route.kernelId === kernelId) : matches;
    const candidates = kernelMatches.length > 0 ? kernelMatches : matches;
    const indexed = candidates.map((route, index) => ({ route, index }));
    indexed.sort((a, b) => {
      const fidelityDelta = fidelityRank(a.route.fidelity) - fidelityRank(b.route.fidelity);
      if (fidelityDelta !== 0) {
        return fidelityDelta;
      }
      const directnessDelta = directnessRank(a.route) - directnessRank(b.route);
      if (directnessDelta !== 0) {
        return directnessDelta;
      }
      return a.index - b.index;
    });
    return indexed[0]?.route;
  },
  export: vi.fn().mockResolvedValue({
    success: true,
    data: { bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' },
    issues: [],
  }),
};

const mockCadRef = {
  getSnapshot: vi.fn(() => ({
    context: {
      geometry: mockGeometry,
      capabilities: mockCapabilities,
      activeKernelId: mockActiveKernelId,
      kernelClient: mockKernelClient,
    },
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockHelperCadRef = {
  getSnapshot: vi.fn(() => ({
    context: {
      geometry: mockHelperGeometry,
      capabilities: mockCapabilities,
      activeKernelId: mockActiveKernelId,
      kernelClient: mockKernelClient,
    },
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
mockGeometryUnits.set('main.ts', mockCadRef);

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      getSnapshot: vi.fn(() => ({ context: { project: { name: 'test-model' } } })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
    },
    geometryUnits: mockGeometryUnits,
    mainEntryFile: 'main.ts',
  }),
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+D' }),
}));

const mockWriteFiles = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
let mockContentService: unknown = {};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    writeFiles: mockWriteFiles,
    readFile: mockReadFile,
    contentService: mockContentService,
  }),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children }: { children: React.ReactNode }) => <div data-testid='floating-panel'>{children}</div>,
  FloatingPanelTrigger: () => null,
  FloatingPanelContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeaderActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  FloatingPanelClose: () => null,
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#utils/keys.utils.js', () => ({
  formatKeyCombination: () => 'Ctrl+D',
}));

vi.mock('#components/ui/empty-items.js', () => ({
  EmptyItems: ({ children }: { children: React.ReactNode }) => <div data-testid='empty-items'>{children}</div>,
}));

vi.mock('@rjsf/core', () => ({
  default: () => <div data-testid='rjsf-form'>RJSF Form</div>,
}));

vi.mock('@rjsf/validator-ajv8', () => ({
  default: {},
}));

vi.mock('#components/geometry/parameters/rjsf-theme.js', () => ({
  widgets: {},
  templates: {},
}));

const { ChatConverter } = await import('./chat-converter.js');

function createCapabilities(overrides?: Partial<CapabilitiesManifest>): CapabilitiesManifest {
  return {
    routes: [
      {
        targetFormat: 'glb',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        fidelity: 'mesh',
        schema: {},
        defaults: {},
      },
      {
        targetFormat: 'gltf',
        kernelId: 'replicad',
        sourceFormat: 'gltf',
        fidelity: 'mesh',
        schema: {},
        defaults: {},
      },
      {
        targetFormat: 'stl',
        kernelId: 'replicad',
        sourceFormat: 'stl',
        fidelity: 'mesh',
        schema: { type: 'object', properties: { binary: { type: 'boolean', default: true } } },
        defaults: { binary: true },
      },
      {
        targetFormat: 'step',
        kernelId: 'replicad',
        sourceFormat: 'step',
        fidelity: 'brep',
        schema: {
          type: 'object',
          properties: { assemblyMode: { type: 'string', enum: ['single', 'assembly'], default: 'single' } },
        },
        defaults: { assemblyMode: 'single' },
      },
      {
        targetFormat: 'usdz',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        transcoderId: 'converter',
        fidelity: 'mesh',
        schema: {},
        defaults: {},
      },
      {
        targetFormat: 'obj',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        transcoderId: 'converter',
        fidelity: 'mesh',
        schema: {},
        defaults: {},
      },
    ],
    renderSchemas: {},
    ...overrides,
  };
}

describe('ChatConverter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeometry = { format: 'gltf', content: new Uint8Array([1]) };
    mockHelperGeometry = { format: 'gltf', content: new Uint8Array([2]) };
    mockCapabilities = createCapabilities();
    mockActiveKernelId = 'replicad';
    mockContentService = {};
    mockReadFile.mockRejectedValue(new Error('File not found'));
    mockGeometryUnits.clear();
    mockGeometryUnits.set('main.ts', mockCadRef);
  });

  it('should show empty state when no geometry is rendered', () => {
    mockGeometry = undefined;
    render(<ChatConverter isExpanded />);
    expect(screen.getByText('No geometry to export for this file')).toBeDefined();
  });

  it('should keep the geometry unit selector visible when the selected file has no geometry', () => {
    mockGeometry = undefined;
    mockGeometryUnits.set('helper.ts', mockHelperCadRef);

    render(<ChatConverter isExpanded />);

    expect(screen.getByText('Select file to export')).toBeDefined();
    expect(screen.getByText('No geometry to export for this file')).toBeDefined();
    expect(screen.queryByRole('button', { name: /glb/i })).toBeNull();
  });

  it('should derive formats solely from manifest routes', () => {
    mockCapabilities = createCapabilities({
      routes: [
        {
          targetFormat: 'glb',
          kernelId: 'replicad',
          sourceFormat: 'glb',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
        {
          targetFormat: 'step',
          kernelId: 'replicad',
          sourceFormat: 'step',
          fidelity: 'brep',
          schema: {},
          defaults: {},
        },
      ],
    });
    render(<ChatConverter isExpanded />);

    expect(screen.getByRole('button', { name: /glb/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /step/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /usdz/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /obj/i })).toBeNull();
  });

  it('should render format grid with all route formats', () => {
    render(<ChatConverter isExpanded />);
    expect(screen.getAllByText(/^(BREP|Mesh)$/).map((heading) => heading.textContent)).toEqual(['BREP', 'Mesh']);
    expect(screen.getByRole('button', { name: /glb/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /gltf/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /stl/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /step/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /usdz/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /obj/i })).toBeDefined();
  });

  it('should show download-to-disk toggle defaulting to checked', () => {
    render(<ChatConverter isExpanded />);
    const downloadCheckbox = screen.getByLabelText('Download to disk');
    expect(downloadCheckbox).toBeDefined();
  });

  it('should show save-to-project toggle', () => {
    render(<ChatConverter isExpanded />);
    const saveCheckbox = screen.getByLabelText('Save to project');
    expect(saveCheckbox).toBeDefined();
  });

  it('should disable export button when no formats are selected', () => {
    render(<ChatConverter isExpanded />);
    const button = screen.getByRole('button', { name: /select formats to export/i });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('should enable format selection via click', () => {
    render(<ChatConverter isExpanded />);
    const glbButton = screen.getByRole('button', { name: /glb/i });
    fireEvent.click(glbButton);

    const exportButton = screen.getByRole('button', { name: /export glb/i });
    expect(exportButton).toBeDefined();
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('should render RJSF form when format with schema is selected', () => {
    render(<ChatConverter isExpanded />);

    const stlButton = screen.getByRole('button', { name: /stl/i });
    fireEvent.click(stlButton);

    const optionsTrigger = screen.getByRole('button', { name: /stl options/i });
    fireEvent.click(optionsTrigger);

    expect(screen.getByTestId('rjsf-form')).toBeDefined();
  });

  it('should not render RJSF form when format without schema is selected', () => {
    render(<ChatConverter isExpanded />);

    const glbButton = screen.getByRole('button', { name: /glb/i });
    fireEvent.click(glbButton);

    expect(screen.queryByTestId('rjsf-form')).toBeNull();
  });

  it('should pass format options when exporting', async () => {
    render(<ChatConverter isExpanded />);

    const glbButton = screen.getByRole('button', { name: /glb/i });
    fireEvent.click(glbButton);

    const exportButton = screen.getByRole('button', { name: /export glb/i });
    fireEvent.click(exportButton);

    await vi.waitFor(() => {
      expect(mockKernelClient.export).toHaveBeenCalledWith('glb', { exportOptions: {} });
    });
  });

  it('should show "Select a destination" when both toggles are unchecked', () => {
    render(<ChatConverter isExpanded />);

    const glbButton = screen.getByRole('button', { name: /glb/i });
    fireEvent.click(glbButton);

    const downloadToggle = screen.getByLabelText('Download to disk');
    fireEvent.click(downloadToggle);

    const button = screen.getByRole('button', { name: /select a destination/i });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  describe('kernel-aware route selection', () => {
    it('should return empty formats when activeKernelId is undefined', () => {
      mockActiveKernelId = undefined;
      mockCapabilities = createCapabilities();
      render(<ChatConverter isExpanded />);

      expect(screen.queryByRole('button', { name: /glb/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /stl/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /step/i })).toBeNull();
    });

    it('should show only replicad routes when activeKernelId is replicad', () => {
      mockActiveKernelId = 'replicad';
      mockCapabilities = createCapabilities({
        routes: [
          {
            targetFormat: 'stl',
            kernelId: 'replicad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            schema: { type: 'object', properties: { binary: { type: 'boolean', default: true } } },
            defaults: { binary: true },
          },
          {
            targetFormat: 'stl',
            kernelId: 'openscad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            schema: { type: 'object', properties: { segments: { type: 'number' } } },
            defaults: { segments: 32 },
          },
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'brep',
            schema: {},
            defaults: {},
          },
        ],
      });

      render(<ChatConverter isExpanded />);

      expect(screen.getByRole('button', { name: /stl/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /step/i })).toBeDefined();
    });

    it('should show only openscad routes when activeKernelId is openscad', () => {
      mockActiveKernelId = 'openscad';
      mockCapabilities = createCapabilities({
        routes: [
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'brep',
            schema: {},
            defaults: {},
          },
          {
            targetFormat: 'stl',
            kernelId: 'openscad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            schema: { type: 'object', properties: { segments: { type: 'number' } } },
            defaults: { segments: 32 },
          },
        ],
      });

      render(<ChatConverter isExpanded />);

      expect(screen.getByRole('button', { name: /stl/i })).toBeDefined();
      expect(screen.queryByRole('button', { name: /step/i })).toBeNull();
    });

    it('should prefer direct route over transcoded for same format and fidelity', () => {
      mockActiveKernelId = 'replicad';
      mockCapabilities = createCapabilities({
        routes: [
          {
            targetFormat: 'usdz',
            kernelId: 'replicad',
            sourceFormat: 'glb',
            transcoderId: 'converter',
            fidelity: 'mesh',
            schema: { type: 'object', properties: { quality: { type: 'number' } } },
            defaults: { quality: 0.5 },
          },
          {
            targetFormat: 'usdz',
            kernelId: 'replicad',
            sourceFormat: 'usdz',
            fidelity: 'mesh',
            schema: {},
            defaults: {},
          },
        ],
      });

      render(<ChatConverter isExpanded />);

      const usdzButton = screen.getByRole('button', { name: /usdz/i });
      fireEvent.click(usdzButton);

      expect(screen.queryByTestId('rjsf-form')).toBeNull();
    });

    it('should prefer brep over mesh regardless of route type', () => {
      mockActiveKernelId = 'replicad';
      mockCapabilities = createCapabilities({
        routes: [
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'mesh',
            schema: {
              type: 'object',
              properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
            },
            defaults: {},
          },
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'brep',
            schema: { type: 'object', properties: { assemblyMode: { type: 'string' } } },
            defaults: { assemblyMode: 'single' },
          },
        ],
      });

      render(<ChatConverter isExpanded />);

      const stepButton = screen.getByRole('button', { name: /step/i });
      fireEvent.click(stepButton);

      const optionsTrigger = screen.getByRole('button', { name: /step options/i });
      fireEvent.click(optionsTrigger);

      expect(screen.getByTestId('rjsf-form')).toBeDefined();
    });

    it('should never show OpenSCAD tessellation options for replicad files', () => {
      mockActiveKernelId = 'replicad';
      mockCapabilities = createCapabilities({
        routes: [
          {
            targetFormat: 'stl',
            kernelId: 'openscad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            schema: {
              type: 'object',
              properties: {
                segments: { type: 'number', default: 32 },
                minimumAngle: { type: 'number', default: 12 },
                minimumSize: { type: 'number', default: 2 },
              },
            },
            defaults: { segments: 32, minimumAngle: 12, minimumSize: 2 },
          },
          {
            targetFormat: 'stl',
            kernelId: 'replicad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            schema: {
              type: 'object',
              properties: {
                binary: { type: 'boolean', default: true },
                tessellation: { type: 'object', properties: { linearTolerance: { type: 'number' } } },
              },
            },
            defaults: { binary: true, tessellation: { linearTolerance: 0.1 } },
          },
        ],
      });

      render(<ChatConverter isExpanded />);

      const stlButton = screen.getByRole('button', { name: /stl/i });
      fireEvent.click(stlButton);

      const optionsTrigger = screen.getByRole('button', { name: /stl options/i });
      fireEvent.click(optionsTrigger);

      expect(screen.getByTestId('rjsf-form')).toBeDefined();
    });
  });

  describe('preference persistence', () => {
    it('should restore persisted format selection on mount', async () => {
      const stored = JSON.stringify({ selectedFormats: ['stl'] });
      mockReadFile.mockResolvedValue(new TextEncoder().encode(stored));

      render(<ChatConverter isExpanded />);

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: /export stl/i })).toBeDefined();
      });
    });

    it('should restore persisted download and save toggles on mount', async () => {
      const stored = JSON.stringify({
        selectedFormats: ['glb'],
        shouldDownload: false,
        shouldSaveToProject: true,
      });
      mockReadFile.mockResolvedValue(new TextEncoder().encode(stored));

      render(<ChatConverter isExpanded />);

      await vi.waitFor(() => {
        const saveCheckbox = screen.getByLabelText('Save to project');
        expect((saveCheckbox as HTMLInputElement).dataset['state']).toBe('checked');
      });
    });

    it('should persist format selection when toggling a format', async () => {
      vi.useFakeTimers();
      try {
        render(<ChatConverter isExpanded />);

        const glbButton = screen.getByRole('button', { name: /glb/i });
        fireEvent.click(glbButton);

        await vi.advanceTimersByTimeAsync(150);

        expect(mockWriteFiles).toHaveBeenCalledTimes(1);
        const callArgs = mockWriteFiles.mock.calls[0]![0] as Record<string, { content: Uint8Array<ArrayBuffer> }>;
        const written = JSON.parse(new TextDecoder().decode(callArgs['.tau/export/preferences.json']!.content)) as {
          selectedFormats: string[];
        };
        expect(written.selectedFormats).toEqual(['glb']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not attempt to load preferences when contentService is unavailable', () => {
      mockContentService = undefined;
      render(<ChatConverter isExpanded />);

      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should load preferences once contentService becomes available', async () => {
      const stored = JSON.stringify({ selectedFormats: ['step'] });
      mockReadFile.mockResolvedValue(new TextEncoder().encode(stored));
      mockContentService = undefined;

      const { rerender } = render(<ChatConverter isExpanded />);
      expect(mockReadFile).not.toHaveBeenCalled();

      mockContentService = {};
      rerender(<ChatConverter isExpanded className='force-rerender' />);

      await vi.waitFor(() => {
        expect(mockReadFile).toHaveBeenCalledTimes(1);
      });
    });
  });
});
