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
  bestRouteFor(format: FileExtension, options?: { readonly kernelId?: string }): ExportRoute | undefined {
    if (!mockCapabilities) {
      return undefined;
    }
    const matches = mockCapabilities.routes.filter((route) => route.targetFormat === format);
    if (matches.length === 0) {
      return undefined;
    }
    const kernelMatches = options?.kernelId ? matches.filter((route) => route.kernelId === options.kernelId) : matches;
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
    data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
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
    mainEntryPath: 'main.ts',
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
  default: ({
    schema,
    formData,
    formContext,
    onChange,
  }: {
    schema: { properties?: Record<string, unknown> };
    formData: Record<string, unknown>;
    formContext: { displayDescriptors?: Record<string, unknown> };
    onChange: (event: { formData: Record<string, unknown> }) => void;
  }) => (
    <div
      data-testid='rjsf-form'
      data-fields={Object.keys(schema.properties ?? {}).join(',')}
      data-display-descriptors={JSON.stringify(formContext.displayDescriptors ?? {})}
    >
      RJSF Form
      {schema.properties?.['includeEdges'] ? (
        <button
          type='button'
          onClick={() => {
            onChange({ formData: { includeEdges: true } });
          }}
        >
          Enable edges
        </button>
      ) : null}
      {schema.properties?.['mode'] ? (
        <button
          type='button'
          onClick={() => {
            onChange({ formData: { ...formData, mode: formData['mode'] === 'batch' ? 'single' : 'batch' } });
          }}
        >
          Switch mode
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('@rjsf/validator-ajv8', () => ({
  default: {
    isValid: (schema: { type?: string }, value: unknown) => {
      if (schema.type === 'number' || schema.type === 'integer') {
        return typeof value === 'number' && Number.isFinite(value);
      }
      if (schema.type === 'boolean') {
        return typeof value === 'boolean';
      }
      if (schema.type === 'string') {
        return typeof value === 'string';
      }
      return true;
    },
  },
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
        exportOptions: { schema: {}, defaults: {} },
      },
      {
        targetFormat: 'gltf',
        kernelId: 'replicad',
        sourceFormat: 'gltf',
        fidelity: 'mesh',
        exportOptions: { schema: {}, defaults: {} },
      },
      {
        targetFormat: 'stl',
        kernelId: 'replicad',
        sourceFormat: 'stl',
        fidelity: 'mesh',
        exportOptions: {
          schema: { type: 'object', properties: { binary: { type: 'boolean', default: true } } },
          defaults: { binary: true },
        },
      },
      {
        targetFormat: 'step',
        kernelId: 'replicad',
        sourceFormat: 'step',
        fidelity: 'brep',
        exportOptions: {
          schema: {
            type: 'object',
            properties: { assemblyMode: { type: 'string', enum: ['single', 'assembly'], default: 'single' } },
          },
          defaults: { assemblyMode: 'single' },
        },
      },
      {
        targetFormat: 'usdz',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        transcoderId: 'converter',
        fidelity: 'mesh',
        exportOptions: { schema: {}, defaults: {} },
      },
      {
        targetFormat: 'obj',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        transcoderId: 'converter',
        fidelity: 'mesh',
        exportOptions: { schema: {}, defaults: {} },
      },
    ],
    renderCapabilities: {},
    ...overrides,
    registrations: overrides?.registrations ?? [],
  };
}

const imageRoute = (): ExportRoute => ({
  targetFormat: 'webp',
  kernelId: 'replicad',
  sourceFormat: 'glb',
  transcoderId: 'image',
  fidelity: 'mesh',
  exportOptions: {
    schema: {
      anyOf: [
        {
          type: 'object',
          title: 'Single',
          properties: {
            mode: { type: 'string', enum: ['single'], default: 'single' },
            width: { type: 'number', default: 768 },
            height: { type: 'number', default: 432 },
            quality: { type: 'number', default: 1 },
            margin: { type: 'number', default: 0.1 },
            projection: { type: 'string', enum: ['perspective', 'orthographic'], default: 'perspective' },
            label: { type: 'string' },
            axes: { type: 'boolean', default: false },
            scaleBar: { type: 'boolean', default: false },
            phi: { type: 'number', default: 60 },
            theta: { type: 'number', default: -45 },
          },
          required: ['mode'],
          additionalProperties: false,
        },
        {
          type: 'object',
          title: 'Batch',
          properties: {
            mode: { type: 'string', enum: ['batch'] },
            width: { type: 'number', default: 768 },
            height: { type: 'number', default: 432 },
            quality: { type: 'number', default: 1 },
            margin: { type: 'number', default: 0.1 },
            projection: { type: 'string', enum: ['perspective', 'orthographic'], default: 'perspective' },
            axes: { type: 'boolean', default: false },
            scaleBar: { type: 'boolean', default: false },
            views: { type: 'array', items: { type: 'object' } },
          },
          required: ['mode', 'views'],
          additionalProperties: false,
        },
      ],
    },
    defaults: { mode: 'single', width: 768, phi: 60, theta: -45 },
  },
});

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
          exportOptions: { schema: {}, defaults: {} },
        },
        {
          targetFormat: 'step',
          kernelId: 'replicad',
          sourceFormat: 'step',
          fidelity: 'brep',
          exportOptions: { schema: {}, defaults: {} },
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

  it('should render route-scoped content independently and submit it at the top level', async () => {
    mockCapabilities = createCapabilities({
      routes: [
        {
          targetFormat: 'webp',
          kernelId: 'replicad',
          sourceFormat: 'glb',
          transcoderId: 'image',
          fidelity: 'mesh',
          exportOptions: { schema: {}, defaults: {} },
          content: {
            schema: {
              type: 'object',
              properties: { includeEdges: { type: 'boolean' } },
              additionalProperties: false,
            },
            defaults: { includeEdges: false },
          },
        },
      ],
    });
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /webp/i }));
    fireEvent.click(screen.getByRole('button', { name: /webp options/i }));
    expect(screen.getByRole('region', { name: 'Content' })).toBeDefined();
    expect(screen.getByTestId('rjsf-form').dataset['fields']).toBe('includeEdges');

    fireEvent.click(screen.getByRole('button', { name: 'Enable edges' }));
    fireEvent.click(screen.getByRole('button', { name: /export webp/i }));

    await vi.waitFor(() => {
      expect(mockKernelClient.export).toHaveBeenCalledWith('webp', {
        content: { includeEdges: true },
        exportOptions: {},
      });
    });
  });

  it('should scope px/deg/unitless display descriptors to the export form', () => {
    mockCapabilities = createCapabilities({
      routes: [
        {
          targetFormat: 'webp',
          kernelId: 'replicad',
          sourceFormat: 'glb',
          transcoderId: 'image',
          fidelity: 'mesh',
          exportOptions: {
            schema: {
              type: 'object',
              properties: {
                width: { type: 'number' },
                height: { type: 'number' },
                phi: { type: 'number' },
                theta: { type: 'number' },
                quality: { type: 'number' },
                margin: { type: 'number' },
              },
            },
            defaults: {},
          },
        },
      ],
    });
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /webp/i }));
    fireEvent.click(screen.getByRole('button', { name: /webp options/i }));

    expect(JSON.parse(screen.getByTestId('rjsf-form').dataset['displayDescriptors'] ?? '{}')).toEqual({
      width: { descriptor: 'count', unit: 'px' },
      height: { descriptor: 'count', unit: 'px' },
      phi: { descriptor: 'angle', unit: 'deg' },
      theta: { descriptor: 'angle', unit: 'deg' },
      quality: { descriptor: 'count', unit: '' },
      margin: { descriptor: 'count', unit: '' },
    });
  });

  it('should expose one mode field and switch image branch fields without retaining single camera keys', async () => {
    mockCapabilities = createCapabilities({ routes: [imageRoute()] });
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /webp/i }));
    fireEvent.click(screen.getByRole('button', { name: /webp options/i }));
    expect(screen.getByTestId('rjsf-form').dataset['fields']).toBe(
      'mode,width,height,quality,margin,projection,label,axes,scaleBar,phi,theta',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch mode' }));
    expect(screen.getByTestId('rjsf-form').dataset['fields']).toBe(
      'mode,width,height,quality,margin,projection,axes,scaleBar,views',
    );

    fireEvent.click(screen.getByRole('button', { name: /export webp/i }));
    await vi.waitFor(() => {
      expect(mockKernelClient.export).toHaveBeenCalledWith('webp', {
        exportOptions: { mode: 'batch' },
      });
    });
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

  it('should persist every dependent artifact when saving one format to the project', async () => {
    mockKernelClient.export.mockResolvedValueOnce({
      success: true,
      data: [
        { bytes: new Uint8Array([1]), name: 'model.gltf', mimeType: 'model/gltf+json' },
        { bytes: new Uint8Array([2]), name: 'buffers/model.bin', mimeType: 'application/octet-stream' },
      ],
      issues: [],
    });
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /gltf/i }));
    fireEvent.click(screen.getByLabelText('Download to disk'));
    fireEvent.click(screen.getByLabelText('Save to project'));
    fireEvent.click(screen.getByRole('button', { name: /export gltf/i }));

    const primaryPath = 'exports/model.gltf';
    const companionPath = 'exports/buffers/model.bin';
    await vi.waitFor(() => {
      expect(mockWriteFiles).toHaveBeenCalledWith({
        [primaryPath]: { content: new Uint8Array([1]) },
        [companionPath]: { content: new Uint8Array([2]) },
      });
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
            exportOptions: {
              schema: { type: 'object', properties: { binary: { type: 'boolean', default: true } } },
              defaults: { binary: true },
            },
          },
          {
            targetFormat: 'stl',
            kernelId: 'openrscad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            exportOptions: {
              schema: { type: 'object', properties: { segments: { type: 'number' } } },
              defaults: { segments: 32 },
            },
          },
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'brep',
            exportOptions: { schema: {}, defaults: {} },
          },
        ],
      });

      render(<ChatConverter isExpanded />);

      expect(screen.getByRole('button', { name: /stl/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /step/i })).toBeDefined();
    });

    it('should show only OpenRSCAD routes when activeKernelId is openrscad', () => {
      mockActiveKernelId = 'openrscad';
      mockCapabilities = createCapabilities({
        routes: [
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'brep',
            exportOptions: { schema: {}, defaults: {} },
          },
          {
            targetFormat: 'stl',
            kernelId: 'openrscad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            exportOptions: {
              schema: { type: 'object', properties: { segments: { type: 'number' } } },
              defaults: { segments: 32 },
            },
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
            exportOptions: {
              schema: { type: 'object', properties: { quality: { type: 'number' } } },
              defaults: { quality: 0.5 },
            },
          },
          {
            targetFormat: 'usdz',
            kernelId: 'replicad',
            sourceFormat: 'usdz',
            fidelity: 'mesh',
            exportOptions: { schema: {}, defaults: {} },
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
            exportOptions: {
              schema: {
                type: 'object',
                properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
              },
              defaults: {},
            },
          },
          {
            targetFormat: 'step',
            kernelId: 'replicad',
            sourceFormat: 'step',
            fidelity: 'brep',
            exportOptions: {
              schema: { type: 'object', properties: { assemblyMode: { type: 'string' } } },
              defaults: { assemblyMode: 'single' },
            },
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
            kernelId: 'openrscad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            exportOptions: {
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
          },
          {
            targetFormat: 'stl',
            kernelId: 'replicad',
            sourceFormat: 'stl',
            fidelity: 'mesh',
            exportOptions: {
              schema: {
                type: 'object',
                properties: {
                  binary: { type: 'boolean', default: true },
                  tessellation: { type: 'object', properties: { linearTolerance: { type: 'number' } } },
                },
              },
              defaults: { binary: true, tessellation: { linearTolerance: 0.1 } },
            },
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

    it('should restore a persisted batch image branch without reviving single-view angles', async () => {
      mockCapabilities = createCapabilities({
        routes: [
          {
            ...imageRoute(),
            content: {
              schema: {
                type: 'object',
                properties: { includeEdges: { type: 'boolean' } },
                additionalProperties: false,
              },
              defaults: { includeEdges: false },
            },
          },
        ],
      });
      mockReadFile.mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({
            selectedFormats: ['webp'],
            formatOptions: {
              webp: {
                mode: 'batch',
                width: 768,
                height: 576,
                margin: 0.1,
                projection: 'orthographic',
                axes: true,
                scaleBar: true,
                views: [{ id: 'front', label: 'Front', phi: 90, theta: 0 }],
                phi: 12,
                theta: 34,
              },
            },
            formatContent: { webp: { includeEdges: true } },
          }),
        ),
      );

      render(<ChatConverter isExpanded />);
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: /export webp/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: /webp options/i }));

      const exportForm = screen.getAllByTestId('rjsf-form').find((form) => form.dataset['fields']?.startsWith('mode,'));
      expect(exportForm?.dataset['fields']).toBe('mode,width,height,quality,margin,projection,axes,scaleBar,views');
      fireEvent.click(screen.getByRole('button', { name: /export webp/i }));
      await vi.waitFor(() => {
        expect(mockKernelClient.export).toHaveBeenCalledWith('webp', {
          content: { includeEdges: true },
          exportOptions: {
            mode: 'batch',
            width: 768,
            height: 576,
            margin: 0.1,
            projection: 'orthographic',
            axes: true,
            scaleBar: true,
            views: [{ id: 'front', label: 'Front', phi: 90, theta: 0 }],
          },
        });
      });
    });

    it('should remove invalid and unknown persisted route options', async () => {
      mockReadFile.mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({
            selectedFormats: ['stl'],
            formatOptions: { stl: { binary: null, unknown: true } },
          }),
        ),
      );

      render(<ChatConverter isExpanded />);

      await vi.waitFor(() => {
        expect(mockWriteFiles).toHaveBeenCalled();
      });
      const latest = mockWriteFiles.mock.calls.at(-1)?.[0] as Record<string, { content: Uint8Array<ArrayBuffer> }>;
      const written = JSON.parse(new TextDecoder().decode(latest['.tau/export/preferences.json']!.content)) as {
        formatOptions: Record<string, Record<string, unknown>>;
      };
      expect(written.formatOptions['stl']).toEqual({});
    });

    it('should remove persisted options and content when the active kernel has no matching route', async () => {
      mockReadFile.mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({
            formatOptions: { webp: { width: 1920 } },
            formatContent: { webp: { includeEdges: true } },
          }),
        ),
      );

      render(<ChatConverter isExpanded />);

      await vi.waitFor(() => {
        expect(mockWriteFiles).toHaveBeenCalled();
      });
      const latest = mockWriteFiles.mock.calls.at(-1)?.[0] as Record<string, { content: Uint8Array<ArrayBuffer> }>;
      const written = JSON.parse(new TextDecoder().decode(latest['.tau/export/preferences.json']!.content)) as {
        formatOptions: Record<string, Record<string, unknown>>;
        formatContent: Record<string, Record<string, unknown>>;
      };
      expect(written.formatOptions).not.toHaveProperty('webp');
      expect(written.formatContent).not.toHaveProperty('webp');
    });

    it('should remove persisted content when the route does not advertise content support', async () => {
      mockReadFile.mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({
            formatContent: { glb: { includeEdges: true } },
          }),
        ),
      );

      render(<ChatConverter isExpanded />);

      await vi.waitFor(() => {
        expect(mockWriteFiles).toHaveBeenCalled();
      });
      const latest = mockWriteFiles.mock.calls.at(-1)?.[0] as Record<string, { content: Uint8Array<ArrayBuffer> }>;
      const written = JSON.parse(new TextDecoder().decode(latest['.tau/export/preferences.json']!.content)) as {
        formatContent: Record<string, Record<string, unknown>>;
      };
      expect(written.formatContent).not.toHaveProperty('glb');
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
