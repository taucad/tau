import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import { contentDigest } from '@taucad/cache-core';
import type { AdmittedAssembly, PublishedAssembly, PublishedPartAsset } from '@taucad/runtime/types';
import { publishedPartRecordSchema } from '@taucad/runtime/types';
import type { CadAssemblyDisplay, cadMachine } from '#machines/cad.machine.js';
import type { ActorRefFrom } from 'xstate';
import type { CapabilitiesManifest, ExportRoute, Rendering, KernelIssue } from '@taucad/runtime';
import { createMockRuntimeDocument } from '@taucad/runtime-testing';
import type { FileExtension, FileParameterEntry, JSONValue } from '@taucad/types';
import type { JSONSchema7 } from '@taucad/json-schema';
import { admitParameterManifest } from '@taucad/parameters';
import { imageEdgeSchemas } from '@taucad/image';
import { toJSONSchema } from 'zod';
import type * as RjsfCore from '@rjsf/core';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import type * as AwaitFreshRenderModule from '#machines/await-fresh-render.js';
import { toast } from '#components/ui/sonner.js';

vi.mock('#machines/await-fresh-render.js', () => ({ awaitFreshRender: vi.fn() }));

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) => {
    if (!actor) {
      return selector(undefined);
    }
    return selector(actor.getSnapshot());
  },
}));

const mockPublishedExport = vi.fn();

let mockCapabilities: CapabilitiesManifest | undefined;
let mockRendering: Rendering | undefined;
let mockHelperRendering: Rendering | undefined;
let mockDocumentFixture = createMockRuntimeDocument();
let mockEvaluation = mockDocumentFixture.evaluation;
let mockActiveKernelId: string | undefined = 'replicad';
let mockAssemblyDisplay: CadAssemblyDisplay | undefined;
let mockAssemblyRootOverride: PublishedPartAsset | undefined;
let mockRequestedRenderId = 1;
let mockSettledRenderId = 1;
let mockLatestRenderingOutcome: 'success' | 'failure' | undefined = 'success';
let mockKernelIssues = new Map<string, Array<{ message: string; code: string; type: string; severity: string }>>();

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
};

const mockCadSend = vi.fn<ActorRefFrom<typeof cadMachine>['send']>();

const mockCadRef = {
  send: mockCadSend,
  getSnapshot: vi.fn(() => ({
    status: 'active',
    matches: (value: string) => value === 'idle',
    context: {
      rendering: mockRendering,
      evaluation: mockAssemblyDisplay ? undefined : mockEvaluation,
      capabilities: mockCapabilities,
      activeKernelId: mockActiveKernelId,
      kernelClient: mockKernelClient,
      document: mockAssemblyDisplay ? undefined : mockDocumentFixture.document,
      entryPath: 'main.ts',
      committedAssemblyDisplay: mockAssemblyDisplay,
      admittedAssembly: mockAssemblyDisplay?.admitted,
      publishedAssembly: mockAssemblyDisplay?.admitted.publication,
      publishedAssemblyRoot: mockAssemblyRootOverride ?? mockAssemblyDisplay?.root,
      publishedAssemblyEntryPath: mockAssemblyDisplay ? 'main.ts' : undefined,
      lastRequestedRenderId: mockRequestedRenderId,
      lastSettledRenderId: mockSettledRenderId,
      latestRenderingOutcome: mockLatestRenderingOutcome,
      kernelIssues: mockKernelIssues,
    },
    hasTag: () => false,
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockHelperCadRef = {
  getSnapshot: vi.fn(() => ({
    context: {
      rendering: mockHelperRendering,
      evaluation: mockEvaluation,
      capabilities: mockCapabilities,
      activeKernelId: mockActiveKernelId,
      kernelClient: mockKernelClient,
      document: mockDocumentFixture.document,
      entryPath: 'helper.ts',
      latestRenderingOutcome: mockLatestRenderingOutcome,
      kernelIssues: mockKernelIssues,
    },
    hasTag: () => false,
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
mockGeometryUnits.set('main.ts', mockCadRef);
const mockProjectSend = vi.fn();
let mockViewSettings: Record<string, { entryPath: string }> = {};
const mockParameterEntries = new Map<string, FileParameterEntry>();
const mockParameterSnapshots = new Map<string, Record<string, unknown>>();
const parameterIdentity = {
  manifestRevision: 'manifest',
};
const mockParameterService = {
  entries: () => mockParameterEntries,
  target: (entry: string, authority = 'browser-filesystem') => ({ authority, root: '/project', entry }),
  snapshot: (entry: string) => mockParameterSnapshots.get(entry),
  // Readers select from the authority actor; this fake replays the stored snapshot to them.
  actor: (entry: string) =>
    mockParameterSnapshots.has(entry)
      ? {
          getSnapshot: () => ({ context: { current: mockParameterSnapshots.get(entry) } }),
          subscribe: () => ({ unsubscribe: () => undefined }),
        }
      : undefined,
  readSettled: vi.fn(async (entry: string) => mockParameterSnapshots.get(entry)),
  resolveTarget: vi.fn(async (target: { entry: string }) => {
    const { entry } = target;
    const existing = mockParameterSnapshots.get(entry);
    if (existing) {
      return existing;
    }
    const record: FileParameterEntry = {
      activeGroup: 'default',
      groups: { default: { values: {} } },
    };
    const snapshot = { entry: record, identity: parameterIdentity };
    mockParameterEntries.set(entry, record);
    mockParameterSnapshots.set(entry, snapshot);
    return snapshot;
  }),
  replaceTargetValues: vi.fn(
    async (target: { entry: string }, _manifest: unknown, { values }: { values: Record<string, JSONValue> }) => {
      const record: FileParameterEntry = {
        activeGroup: 'default',
        groups: { default: { values } },
      };
      mockParameterEntries.set(target.entry, record);
      mockParameterSnapshots.set(target.entry, {
        entry: record,
        identity: parameterIdentity,
      });
    },
  ),
};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      getSnapshot: vi.fn(() => ({ context: { project: { name: 'test-model' }, geometryUnits: mockGeometryUnits } })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockProjectSend,
    },
    editorRef: {
      getSnapshot: () => ({ context: { viewSettings: mockViewSettings, unitSettings: {} } }),
    },
    geometryUnits: mockGeometryUnits,
    viewRecords: new Map(Object.entries(mockViewSettings)),
    mainEntryPath: 'main.ts',
    parameterService: mockParameterService,
  }),
  useMainGraphics: () => undefined,
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+D' }),
}));

const mockWriteFiles = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
const mockExists = vi.fn(async (_path: string) => false);
/** A content service whose preference watch is ready at once and never fires. */
const contentServiceStub = (): unknown => ({
  watchReady: () => ({
    ready: Promise.resolve(),
    closed: new Promise<never>(() => {
      // Never closes.
    }),
    dispose: () => undefined,
  }),
});
/** Store preference bytes on disk: the reader checks existence before it reads. */
const storePreferences = (bytes: Uint8Array<ArrayBuffer>): void => {
  mockExists.mockResolvedValue(true);
  mockReadFile.mockResolvedValue(bytes);
};
let mockContentService: unknown = contentServiceStub();
const mockFileManager = {
  writeFiles: mockWriteFiles,
  readFile: mockReadFile,
  exists: mockExists,
  get contentService(): unknown {
    return mockContentService;
  },
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => mockFileManager,
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

vi.mock('@rjsf/core', async (importOriginal) => ({
  ...(await importOriginal<typeof RjsfCore>()),
  default: ({
    schema,
    formData,
    formContext,
    idPrefix,
    onChange,
  }: {
    schema: { properties?: Record<string, unknown> };
    formData: Record<string, unknown>;
    formContext: {
      parameterEdit?: { kind: string; commit?: { target: { authority: string } } };
      parameterManifest?: unknown;
      rootPresentation?: string;
    };
    idPrefix: string;
    onChange: (event: { formData: Record<string, unknown> }) => void;
  }) => (
    <div
      data-testid='rjsf-form'
      data-fields={Object.keys(schema.properties ?? {}).join(',')}
      data-id-prefix={idPrefix}
      data-parameter-authority={formContext.parameterEdit?.commit?.target.authority}
      data-parameter-manifest={formContext.parameterManifest ? 'ready' : 'pending'}
      data-root-presentation={formContext.rootPresentation}
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
      {schema.properties?.['includePhysical'] ? (
        <button
          type='button'
          onClick={() => {
            onChange({ formData: { ...formData, includeEdges: true, includePhysical: true } });
          }}
        >
          Enable physical evidence
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

vi.mock('#components/geometry/parameters/rjsf-theme.js', () => ({
  widgets: {},
  templates: {},
}));

const { ChatConverter, ExportSchemaForm, compileExportConfigurationManifest, resolveActiveSchema } =
  await import('./chat-converter.js');

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
            lineWidth: { type: 'number', default: 3 },
            background: { type: 'string' },
            label: { type: 'string' },
            axes: { type: 'boolean', default: false },
            scaleBar: { type: 'boolean', default: false },
            camera: { type: 'object' },
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
            lineWidth: { type: 'number', default: 3 },
            background: { type: 'string' },
            axes: { type: 'boolean', default: false },
            scaleBar: { type: 'boolean', default: false },
            views: { type: 'array', items: { type: 'object' } },
          },
          required: ['mode', 'views'],
          additionalProperties: false,
        },
      ],
    },
    defaults: { mode: 'single', width: 768, lineWidth: 3 },
  },
});

describe('ChatConverter', () => {
  it('should preserve non-mode root unions instead of treating them as image modes', () => {
    const schema = {
      type: 'object',
      anyOf: [{ properties: { value: { type: 'string' } } }, { properties: { value: { type: 'number' } } }],
    } satisfies JSONSchema7;

    expect(resolveActiveSchema(schema, {}, {})).toEqual({ schema, defaults: {} });
  });

  it('should resolve a required non-mode discriminator without coercing an unknown value', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { shared: { type: 'number' } },
      oneOf: [
        {
          properties: { algorithm: { const: 'steady' }, iterations: { type: 'number', default: 10 } },
          required: ['algorithm'],
        },
        {
          properties: { algorithm: { const: 'transient' }, duration: { type: 'number', default: 5 } },
          required: ['algorithm'],
        },
      ],
    };

    expect(resolveActiveSchema(schema, { algorithm: 'transient' }, { algorithm: 'steady', shared: 1 })).toMatchObject({
      defaults: { algorithm: 'transient', duration: 5, shared: 1 },
      schema: {
        properties: { algorithm: { default: 'transient' }, duration: { default: 5 }, shared: { type: 'number' } },
      },
    });
    expect(resolveActiveSchema(schema, { algorithm: 'future' }, { algorithm: 'steady' })).toEqual({
      schema,
      defaults: { algorithm: 'steady' },
    });
  });

  it('should resolve a discriminator supplied by a branch default', () => {
    const schema: JSONSchema7 = {
      anyOf: [
        { properties: { mode: { enum: ['single'], default: 'single' }, camera: { type: 'object' } } },
        { properties: { mode: { enum: ['batch'] }, views: { type: 'array' } }, required: ['mode'] },
      ],
    };

    expect(resolveActiveSchema(schema, {}, { mode: 'single' }).schema).toMatchObject({
      properties: { mode: { default: 'single' }, camera: { type: 'object' } },
    });
  });

  it('should keep configuration paths collision-safe and stable across schema revisions', async () => {
    const resolved: Parameters<typeof compileExportConfigurationManifest>[2] = {
      schema: { type: 'object', properties: { tolerance: { type: 'number' } } },
      defaults: {},
    };
    const [slash, underscore, revised] = await Promise.all([
      compileExportConfigurationManifest('a/b', 'export/stl', resolved),
      compileExportConfigurationManifest('a_b', 'export/stl', resolved),
      compileExportConfigurationManifest('a/b', 'export/stl', {
        ...resolved,
        defaults: { tolerance: 0.1 },
      }),
    ]);

    expect(slash.entryPath).not.toBe(underscore.entryPath);
    expect(revised.entryPath).toBe(slash.entryPath);
    expect(revised.manifest.identity.dependency).not.toBe(slash.manifest.identity.dependency);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentFixture = createMockRuntimeDocument();
    vi.mocked(mockDocumentFixture.document.export).mockResolvedValue({
      success: true,
      exportId: 'glb',
      evaluationId: mockDocumentFixture.evaluation.id,
      files: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
      issues: [],
    });
    vi.mocked(awaitFreshRender)
      .mockReset()
      .mockImplementation(async (actor) => actor.getSnapshot());
    mockRendering = mockDocumentFixture.rendering;
    mockEvaluation = mockDocumentFixture.evaluation;
    if (!mockRendering.success) {
      throw new Error('The document fixture must render successfully');
    }
    mockHelperRendering = {
      ...mockRendering,
      artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array([2]) },
    };
    mockCapabilities = createCapabilities();
    mockActiveKernelId = 'replicad';
    mockLatestRenderingOutcome = 'success';
    mockAssemblyDisplay = undefined;
    mockAssemblyRootOverride = undefined;
    mockRequestedRenderId = 1;
    mockSettledRenderId = 1;
    mockPublishedExport.mockReset().mockResolvedValue({
      success: true,
      files: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
      issues: [],
    });
    mockKernelIssues = new Map();
    mockContentService = contentServiceStub();
    mockReadFile.mockRejectedValue(new Error('File not found'));
    mockExists.mockResolvedValue(false);
    mockGeometryUnits.clear();
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockViewSettings = {};
    mockParameterEntries.clear();
    mockParameterSnapshots.clear();
  });

  it('binds provider configuration RJSF forms to the checked parameter owner without a CAD actor', async () => {
    render(
      <ExportSchemaForm
        idPrefix='provider-test'
        provider='replicad'
        configuration='export/stl/options'
        parameterOwner={{
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- bounded fake covers the form's target methods.
          parameterService: mockParameterService as unknown as ParameterSetService,
        }}
        label='Format'
        shouldShowLabel
        resolved={{
          schema: {
            type: 'object',
            properties: { tolerance: { type: 'number', default: 0.1 } },
          },
          defaults: { tolerance: 0.1 },
        }}
        value={{}}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('rjsf-form')).toHaveAttribute('data-parameter-authority', 'provider-configuration');
      expect(screen.getByTestId('rjsf-form')).toHaveAttribute('data-parameter-manifest', 'ready');
    });
    expect(mockParameterService.resolveTarget).toHaveBeenCalledOnce();
  });

  it('should show empty state when no geometry is rendered', () => {
    mockRendering = undefined;
    render(<ChatConverter isExpanded />);
    expect(screen.getByText('No geometry to export for this file')).toBeDefined();
  });

  const committedAssemblyFixture = (): CadAssemblyDisplay => {
    const root: PublishedPartAsset = {
      path: '.tau/artifacts/reusable-parts/fixture/scene.json',
      digest: contentDigest({ value: `sha256:${'a'.repeat(64)}`, name: 'converter committed root' }),
      byteLength: 123,
    };
    const publication: PublishedAssembly = {
      schemaVersion: 1,
      parts: {
        housing: {
          schemaVersion: 1,
          variants: {
            default: {
              source: { entry: 'part.ts', files: { 'part.ts': root.digest } },
              glb: { ...root, path: '.tau/artifacts/reusable-parts/fixture/display.glb' },
              exact: {
                asset: { ...root, path: '.tau/artifacts/reusable-parts/fixture/native.msgpack' },
                kernelId: 'replicad',
                provider: '@taucad/replicad',
                providerVersion: '1.4.2',
                codec: 'replicad.native-handle-msgpack',
                codecVersion: '2',
                unit: 'millimeter',
                linearToleranceMm: 0.001,
                angularToleranceRad: 0.001,
              },
            },
          },
        },
      },
      occurrences: [
        {
          id: 'housing',
          part: 'housing',
          variant: 'default',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
    };
    // UI boundary control only; actual source-free admission/STEP is qualified by the runtime/product gates.
    const admitted: AdmittedAssembly = {
      ...mock<AdmittedAssembly>(),
      publication,
      readAsset: vi.fn(),
    };
    const parsedRecord = publishedPartRecordSchema.parse({
      schemaVersion: 1,
      variants: { default: { source: { entry: 'part.ts', files: { 'part.ts': root.digest } }, glb: root } },
    });
    const parsedVariant = parsedRecord.variants['default'];
    if (!parsedVariant) {
      throw new Error('Missing parsed converter fixture variant');
    }
    const document = Object.assign(mock<CadAssemblyDisplay['document']>(), {
      projection: 'assembly',
      root: parsedVariant.glb,
      admitted,
      exportPublished: mockPublishedExport,
    } satisfies Partial<CadAssemblyDisplay['document']>);
    return { root, admitted, document };
  };

  it('should offer and export the coherent admitted source-free assembly arm without source geometry', async () => {
    const actualFreshness = await vi.importActual<typeof AwaitFreshRenderModule>('#machines/await-fresh-render.js');
    vi.mocked(awaitFreshRender).mockImplementationOnce(actualFreshness.awaitFreshRender);
    mockCapabilities = createCapabilities({
      routes: [
        {
          targetFormat: 'step',
          kernelId: 'replicad',
          sourceFormat: 'step',
          exportId: 'step',
          fidelity: 'brep',
          exportOptions: { schema: {}, defaults: {} },
        },
      ],
    });
    mockRendering = undefined;
    mockActiveKernelId = undefined;
    mockAssemblyDisplay = committedAssemblyFixture();
    expect(mockAssemblyDisplay.document.root).not.toBe(mockAssemblyDisplay.root);
    expect(mockAssemblyDisplay.document.root).toEqual(mockAssemblyDisplay.root);
    mockPublishedExport.mockResolvedValueOnce({
      success: true,
      files: [{ bytes: new TextEncoder().encode('ISO-10303-21;'), name: 'model.step', mimeType: 'model/step' }],
      issues: [],
    });
    render(<ChatConverter isExpanded />);
    expect(screen.queryByText('No geometry to export for this file')).toBeNull();
    expect(screen.getByRole('region', { name: 'Formats' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^step step$/iu }));
    fireEvent.click(screen.getByRole('button', { name: /^export step$/iu }));
    await waitFor(() => {
      expect(mockPublishedExport).toHaveBeenCalledWith({
        format: 'step',
        exportOptions: {},
        publishedAssembly: { root: mockAssemblyDisplay?.root },
      });
      expect(toast.success).toHaveBeenCalledWith('Exported STEP');
    });
    expect(mockDocumentFixture.document.evaluation).not.toHaveBeenCalled();
    expect(mockDocumentFixture.view.rendering).not.toHaveBeenCalled();
    expect(mockDocumentFixture.document.export).not.toHaveBeenCalled();
  });

  it('should deny Formats when retained assembly metadata does not identify the selected committed pin', () => {
    mockRendering = undefined;
    mockAssemblyDisplay = committedAssemblyFixture();
    mockAssemblyRootOverride = { ...mockAssemblyDisplay.root };
    render(<ChatConverter isExpanded />);
    expect(screen.getByText('No geometry to export for this file')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Formats' })).toBeNull();
    expect(mockPublishedExport).not.toHaveBeenCalled();
  });

  it('should deny a pin that becomes incoherent while waiting for the fresh CAD result', async () => {
    mockRendering = undefined;
    mockAssemblyDisplay = committedAssemblyFixture();
    vi.mocked(awaitFreshRender).mockImplementationOnce(async (actor) => {
      mockAssemblyRootOverride = mockAssemblyDisplay && { ...mockAssemblyDisplay.root };
      return actor.getSnapshot();
    });
    render(<ChatConverter isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /^glb$/iu }));
    fireEvent.click(screen.getByRole('button', { name: /^export glb$/iu }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No current successful geometry is available for main.ts');
    });
    expect(mockPublishedExport).not.toHaveBeenCalled();
  });

  it('should discard exported bytes when the selected admitted pin changes during the runtime await', async () => {
    mockRendering = undefined;
    mockAssemblyDisplay = committedAssemblyFixture();
    mockPublishedExport.mockImplementationOnce(async () => {
      mockAssemblyDisplay = committedAssemblyFixture();
      mockRequestedRenderId += 1;
      mockSettledRenderId += 1;
      return {
        success: true,
        files: [{ bytes: new Uint8Array([7]), name: 'stale.glb', mimeType: 'model/gltf-binary' }],
        issues: [],
      };
    });
    const view = render(<ChatConverter isExpanded />);
    try {
      fireEvent.click(screen.getByRole('button', { name: /^glb$/iu }));
      const beforeExport = mockProjectSend.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: /^export glb$/iu }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('The selected CAD display changed during export');
      });
      expect(mockPublishedExport).toHaveBeenCalledOnce();
      expect(mockWriteFiles).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      const expectedDiagnosticData: unknown = expect.objectContaining({
        entryPath: 'main.ts',
        activeKernelId: undefined,
        requestedRenderId: 1,
        settledRenderId: 1,
        format: 'glb',
        stage: 'current-display-after-export',
        kernelId: 'replicad',
        transcoderId: undefined,
        reason: 'exception',
        errorType: 'object',
        errorName: 'Error',
        errorMessage: 'The selected CAD display changed during export',
        reachedWrite: false,
        completedWrite: false,
      });
      expect(mockCadSend).toHaveBeenCalledWith({
        type: 'kernelLog',
        level: 'error',
        message: 'CAD export failed',
        origin: { component: 'export', file: 'main.ts' },
        data: expectedDiagnosticData,
      });
      const operationClaim = mockProjectSend.mock.calls
        .slice(beforeExport)
        .map(([event]) => event as { type: string; claimId: string })
        .find((event) => event.type === 'claimGeometryUnit');
      expect(operationClaim).toBeDefined();
      expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
    } finally {
      view.unmount();
    }
  });

  it('should discard exported bytes when the project replaces the actor map during export without rerender', async () => {
    mockRendering = undefined;
    mockAssemblyDisplay = committedAssemblyFixture();
    const replacementActor = mock<ActorRefFrom<typeof cadMachine>>({
      getSnapshot: () => mockCadRef.getSnapshot(),
    });
    mockPublishedExport.mockImplementationOnce(async () => {
      mockGeometryUnits = new Map(mockGeometryUnits);
      mockGeometryUnits.set('main.ts', replacementActor);
      return {
        success: true,
        files: [{ bytes: new Uint8Array([7]), name: 'replaced.glb', mimeType: 'model/gltf-binary' }],
        issues: [],
      };
    });
    render(<ChatConverter isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /^glb$/iu }));
    fireEvent.click(screen.getByRole('button', { name: /^export glb$/iu }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The selected CAD display changed during export');
    });
    expect(mockPublishedExport).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('should discard exported bytes when the selected entry switches during export', async () => {
    const { scrollIntoView } = Element.prototype;
    Element.prototype.scrollIntoView = vi.fn();
    let finishExport = (): void => undefined;
    const exportPending = new Promise<void>((resolve) => {
      finishExport = resolve;
    });
    mockRendering = undefined;
    mockAssemblyDisplay = committedAssemblyFixture();
    mockGeometryUnits.set('helper.ts', mockHelperCadRef);
    mockPublishedExport.mockImplementationOnce(async () => {
      await exportPending;
      return {
        success: true,
        files: [{ bytes: new Uint8Array([7]), name: 'previous.glb', mimeType: 'model/gltf-binary' }],
        issues: [],
      };
    });
    try {
      render(<ChatConverter isExpanded />);
      fireEvent.click(screen.getByRole('button', { name: /^glb$/iu }));
      fireEvent.click(screen.getByRole('button', { name: /^export glb$/iu }));
      await waitFor(() => {
        expect(mockPublishedExport).toHaveBeenCalledOnce();
      });
      fireEvent.click(screen.getByRole('button', { name: /main\.ts/iu }));
      fireEvent.click(await screen.findByText('helper.ts'));
      expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('helper.ts');
      finishExport();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('The selected CAD display changed during export');
      });
      expect(toast.success).not.toHaveBeenCalled();
    } finally {
      finishExport();
      Element.prototype.scrollIntoView = scrollIntoView;
    }
  });

  it('should identify the export source when only one geometry unit exists', () => {
    render(<ChatConverter isExpanded />);

    expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('main.ts');
    expect(screen.getByText('File to export')).toBeDefined();
  });

  it('should keep the geometry unit selector visible when the selected file has no geometry', () => {
    mockRendering = undefined;
    mockGeometryUnits.set('helper.ts', mockHelperCadRef);

    render(<ChatConverter isExpanded />);

    expect(screen.getByText('File to export')).toBeDefined();
    expect(screen.getByText('No geometry to export for this file')).toBeDefined();
    expect(screen.queryByRole('button', { name: /glb/i })).toBeNull();
  });

  it('offers a hidden restored viewer file and admits its unit when selected for export', async () => {
    const { scrollIntoView } = Element.prototype;
    Element.prototype.scrollIntoView = vi.fn();
    mockViewSettings = { hiddenView: { entryPath: 'helper.ts' } };
    try {
      render(<ChatConverter isExpanded />);

      fireEvent.click(screen.getByRole('button', { name: /main\.ts/i }));
      fireEvent.click(await screen.findByText('helper.ts'));

      expect(mockProjectSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'claimGeometryUnit', entryPath: 'helper.ts', operationTimeout: undefined }),
      );
    } finally {
      Element.prototype.scrollIntoView = scrollIntoView;
    }
  });

  it('claims the selected unit only while the exporter is shown', async () => {
    const view = render(<ChatConverter isExpanded={false} />);
    expect(mockProjectSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'claimGeometryUnit' }));

    view.rerender(<ChatConverter isExpanded />);
    const claim = mockProjectSend.mock.calls.find(([event]) => event.type === 'claimGeometryUnit')?.[0] as unknown as {
      claimId: string;
      entryPath: string;
    };
    expect(claim.entryPath).toBe('main.ts');
    expect(typeof claim.claimId).toBe('string');

    view.rerender(<ChatConverter isExpanded={false} />);
    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claim.claimId });
  });

  it('holds a separate export claim after hide and waits for the resumed render', async () => {
    let resolveFresh: (snapshot: Awaited<ReturnType<typeof awaitFreshRender>>) => void = () => undefined;
    vi.mocked(awaitFreshRender).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFresh = resolve;
      }),
    );
    const view = render(<ChatConverter isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /glb/i }));
    const beforeExport = mockProjectSend.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /export glb/i }));
    const operationClaim = mockProjectSend.mock.calls
      .slice(beforeExport)
      .map(([event]) => event as { type: string; claimId: string; entryPath?: string })
      .find((event) => event.type === 'claimGeometryUnit');
    expect(operationClaim?.entryPath).toBe('main.ts');

    view.rerender(<ChatConverter isExpanded={false} />);
    expect(mockProjectSend).not.toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
    expect(mockDocumentFixture.document.export).not.toHaveBeenCalled();

    resolveFresh(mockCadRef.getSnapshot());
    await waitFor(() => {
      expect(mockDocumentFixture.document.export).toHaveBeenCalledWith('glb', { options: {} });
      expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
    });
  });

  it('refuses retained geometry and client after the latest CAD render fails', async () => {
    mockLatestRenderingOutcome = 'failure';
    mockKernelIssues = new Map([
      ['main.ts', [{ message: 'radius must be positive', code: 'RUNTIME', type: 'runtime', severity: 'error' }]],
    ]);
    render(<ChatConverter isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /glb/i }));
    const beforeExport = mockProjectSend.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /export glb/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('radius must be positive');
    });
    expect(mockDocumentFixture.document.export).not.toHaveBeenCalled();
    const operationClaim = mockProjectSend.mock.calls
      .slice(beforeExport)
      .map(([event]) => event as { type: string; claimId: string })
      .find((event) => event.type === 'claimGeometryUnit');
    expect(operationClaim).toBeDefined();
    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
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
    const { container } = render(<ChatConverter isExpanded />);
    const button = screen.getByRole('button', { name: /select formats to export/i });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);

    const scrollBody = container.querySelector('[data-slot="export-scroll-body"]');
    const actionFooter = container.querySelector('[data-slot="export-action-footer"]');
    const destination = container.querySelector('section[aria-label="Destination"]');
    expect(scrollBody).not.toBeNull();
    expect(actionFooter).not.toBeNull();
    expect(scrollBody?.contains(actionFooter)).toBe(true);
    expect(destination?.contains(actionFooter)).toBe(true);
    expect(actionFooter?.querySelectorAll('button')).toHaveLength(1);
  });

  it('should enable format selection via click', () => {
    render(<ChatConverter isExpanded />);
    const glbButton = screen.getByRole('button', { name: /glb/i });
    expect(glbButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(glbButton);

    expect(glbButton).toHaveAttribute('aria-pressed', 'true');
    expect(glbButton).toHaveClass('bg-accent', 'text-accent-foreground');
    expect(glbButton).not.toHaveClass('bg-primary/10', 'text-primary');

    const exportButton = screen.getByRole('button', { name: /export glb/i });
    expect(exportButton).toBeDefined();
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('should show format options by default and allow collapsing them', async () => {
    render(<ChatConverter isExpanded />);

    const stlButton = screen.getByRole('button', { name: /stl/i });
    fireEvent.click(stlButton);

    const optionsTrigger = screen.getByRole('button', { name: /stl options/i });
    expect(optionsTrigger).toHaveAttribute('aria-expanded', 'true');
    const form = await screen.findByTestId('rjsf-form');
    expect(form.dataset['idPrefix']).toBe('///root-stl-options');
    expect(form.dataset['rootPresentation']).toBe('embedded');

    fireEvent.click(optionsTrigger);
    expect(screen.queryByTestId('rjsf-form')).toBeNull();
  });

  it('should not render RJSF form when format without schema is selected', () => {
    render(<ChatConverter isExpanded />);

    const glbButton = screen.getByRole('button', { name: /glb/i });
    fireEvent.click(glbButton);

    expect(screen.queryByTestId('rjsf-form')).toBeNull();
  });

  it('should keep selected format disclosures independently open', async () => {
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /stl/i }));
    fireEvent.click(screen.getByRole('button', { name: /step/i }));
    await waitFor(() => {
      expect(screen.getAllByTestId('rjsf-form')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /stl options/i }));
    expect(screen.getAllByTestId('rjsf-form')).toHaveLength(1);
    expect(screen.getByTestId('rjsf-form').dataset['idPrefix']).toBe('///root-step-options');
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
              properties: { includeEdges: { type: 'boolean' }, includePhysical: { type: 'boolean' } },
              additionalProperties: false,
            },
            defaults: { includeEdges: false, includePhysical: false },
          },
        },
      ],
    });
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /webp/i }));
    const contentForm = await screen.findByTestId('rjsf-form');
    expect(screen.getByRole('region', { name: 'Content' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Content' })).toBeNull();
    expect(contentForm.dataset['fields']).toBe('includeEdges,includePhysical');
    expect(screen.getByRole('button', { name: /webp options defaults/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Enable edges' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /webp options modified/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enable physical evidence' }));
    await vi.waitFor(() => {
      expect(
        mockParameterService.replaceTargetValues.mock.calls.some((call) => call[2].values['includePhysical'] === true),
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: /export webp/i }));

    await vi.waitFor(() => {
      expect(mockDocumentFixture.document.export).toHaveBeenCalledWith('webp', {
        content: { includeEdges: true, includePhysical: true },
        options: {},
      });
    });
  });

  it('should label Content and Format only when both schemas are present', async () => {
    mockCapabilities = createCapabilities({
      routes: [
        {
          targetFormat: 'webp',
          kernelId: 'replicad',
          sourceFormat: 'glb',
          transcoderId: 'image',
          fidelity: 'mesh',
          exportOptions: {
            schema: { type: 'object', properties: { quality: { type: 'number' } } },
            defaults: { quality: 1 },
          },
          content: {
            schema: { type: 'object', properties: { includeEdges: { type: 'boolean' } } },
            defaults: { includeEdges: false },
          },
        },
      ],
    });

    render(<ChatConverter isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /webp/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId('rjsf-form')).toHaveLength(2);
    });
    expect(screen.getByRole('heading', { name: 'Content' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Format' })).toBeDefined();
  });

  it('compiles the units the image exporter declares into the checked manifest', async () => {
    const { manifest } = await compileExportConfigurationManifest('image', 'webp', {
      schema: toJSONSchema(imageEdgeSchemas.webp, { target: 'draft-7', io: 'input' }) as JSONSchema7,
      defaults: imageEdgeSchemas.webp.parse({}),
    });

    for (const pointer of ['/width', '/height', '/lineWidth']) {
      expect(manifest.bindings[pointer]).toMatchObject({ unit: '1', symbol: 'px', space: 'linear' });
    }
    expect(manifest.bindings['/camera/projection/verticalFieldOfView']).toMatchObject({
      unit: 'deg',
      quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
      space: 'linear',
    });
    for (const pointer of ['/camera/projection/zoom', '/quality', '/camera/margin']) {
      expect(manifest.bindings[pointer]).toMatchObject({
        unit: '1',
        quantityKind: 'http://qudt.org/vocab/quantitykind/DimensionlessRatio',
        space: 'linear',
      });
    }
  });

  it('adds no unit the producer did not declare, whatever the field is called', async () => {
    const { manifest } = await compileExportConfigurationManifest('mock', 'export/mock/options', {
      schema: { type: 'object', properties: { width: { type: 'number' }, quality: { type: 'number' } } },
      defaults: {},
    });

    expect(manifest.bindings['/width']?.unit).toBeUndefined();
    expect(manifest.bindings['/quality']?.unit).toBeUndefined();
  });

  it('produces a re-admissible manifest from the real image exporter schema', async () => {
    const schema = toJSONSchema(imageEdgeSchemas.png, { target: 'draft-7', io: 'input' }) as JSONSchema7;
    const compiled = await compileExportConfigurationManifest('replicad+image', 'export/png/options', {
      schema,
      defaults: imageEdgeSchemas.png.parse({}),
    });

    await expect(admitParameterManifest(compiled.manifest)).resolves.toEqual(compiled.manifest);
  });

  it('should expose one mode field and switch image branch fields without retaining single camera keys', async () => {
    mockCapabilities = createCapabilities({ routes: [imageRoute()] });
    render(<ChatConverter isExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /webp/i }));
    const form = await screen.findByTestId('rjsf-form');
    expect(form.dataset['fields']).toBe('mode,width,height,quality,lineWidth,background,label,axes,scaleBar,camera');

    fireEvent.click(screen.getByRole('button', { name: 'Switch mode' }));
    await waitFor(() => {
      expect(screen.getByTestId('rjsf-form').dataset['fields']).toBe(
        'mode,width,height,quality,lineWidth,background,axes,scaleBar,views',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /export webp/i }));
    await vi.waitFor(() => {
      expect(mockDocumentFixture.document.export).toHaveBeenCalledWith('webp', {
        options: { mode: 'batch' },
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
      expect(mockDocumentFixture.document.export).toHaveBeenCalledWith('glb', { options: {} });
    });
  });

  it('exports the checked configuration record, not the stale preference mirror', async () => {
    const resolveTarget = mockParameterService.resolveTarget.getMockImplementation()!;
    mockParameterService.resolveTarget.mockImplementation(async (target: { entry: string }) => {
      const snapshot = await resolveTarget(target);
      if (!target.entry.includes('export_stl_options')) {
        return snapshot;
      }
      // Another client changed the record while this converter was closed.
      const record: FileParameterEntry = {
        activeGroup: 'default',
        groups: { default: { values: { binary: false } } },
      };
      const changed = { entry: record, identity: parameterIdentity };
      mockParameterEntries.set(target.entry, record);
      mockParameterSnapshots.set(target.entry, changed);
      return changed;
    });
    try {
      render(<ChatConverter isExpanded />);
      fireEvent.click(screen.getByRole('button', { name: /stl/i }));
      fireEvent.click(screen.getByRole('button', { name: /export stl/i }));
      await vi.waitFor(() => {
        expect(mockDocumentFixture.document.export).toHaveBeenCalledWith('stl', { options: { binary: false } });
      });
    } finally {
      mockParameterService.resolveTarget.mockImplementation(resolveTarget);
    }
  });

  it('should persist every dependent artifact when saving one format to the project', async () => {
    vi.mocked(mockDocumentFixture.document.export).mockResolvedValueOnce({
      success: true,
      exportId: 'gltf',
      evaluationId: mockDocumentFixture.evaluation.id,
      files: [
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

  it('should retain runtime export issues without writing failed artifacts', async () => {
    const issues: KernelIssue[] = [
      {
        message: 'The export codec failed',
        code: 'RUNTIME',
        type: 'kernel',
        severity: 'error',
        details: { stage: 'codec' },
      },
    ];
    vi.mocked(mockDocumentFixture.document.export).mockResolvedValueOnce({ success: false, issues });
    const view = render(<ChatConverter isExpanded />);
    try {
      fireEvent.click(screen.getByRole('button', { name: /^glb$/iu }));
      fireEvent.click(screen.getByLabelText('Download to disk'));
      fireEvent.click(screen.getByLabelText('Save to project'));
      const beforeExport = mockProjectSend.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: /^export glb$/iu }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to export GLB');
      });
      expect(mockDocumentFixture.document.export).toHaveBeenCalledOnce();
      const expectedDiagnosticData: unknown = expect.objectContaining({
        entryPath: 'main.ts',
        activeKernelId: 'replicad',
        requestedRenderId: 1,
        settledRenderId: 1,
        format: 'glb',
        stage: 'runtime-result',
        kernelId: 'replicad',
        transcoderId: undefined,
        reason: 'runtime-result',
        issues,
        reachedWrite: false,
        completedWrite: false,
      });
      expect(mockCadSend).toHaveBeenCalledWith({
        type: 'kernelLog',
        level: 'error',
        message: 'CAD export failed',
        origin: { component: 'export', file: 'main.ts' },
        data: expectedDiagnosticData,
      });
      expect(mockWriteFiles).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      const operationClaim = mockProjectSend.mock.calls
        .slice(beforeExport)
        .map(([event]) => event as { type: string; claimId: string })
        .find((event) => event.type === 'claimGeometryUnit');
      expect(operationClaim).toBeDefined();
      expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
    } finally {
      view.unmount();
    }
  });

  it('should release the export claim when project writing and diagnostic delivery fail', async () => {
    mockWriteFiles.mockRejectedValueOnce(new Error('Project write denied'));
    mockCadSend.mockImplementationOnce(() => {
      throw new TypeError('Diagnostic delivery denied');
    });
    const view = render(<ChatConverter isExpanded />);
    try {
      fireEvent.click(screen.getByRole('button', { name: /^glb$/iu }));
      fireEvent.click(screen.getByLabelText('Download to disk'));
      fireEvent.click(screen.getByLabelText('Save to project'));
      const beforeExport = mockProjectSend.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: /^export glb$/iu }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to export GLB');
      });
      expect(mockDocumentFixture.document.export).toHaveBeenCalledOnce();
      expect(mockWriteFiles).toHaveBeenCalledWith({
        'exports/model.glb': { content: new Uint8Array([1, 2, 3]) },
      });
      expect(mockCadSend).toHaveBeenCalledOnce();
      const expectedDiagnosticData: unknown = expect.objectContaining({
        entryPath: 'main.ts',
        activeKernelId: 'replicad',
        requestedRenderId: 1,
        settledRenderId: 1,
        format: 'glb',
        stage: 'project-write',
        kernelId: 'replicad',
        transcoderId: undefined,
        reason: 'exception',
        errorType: 'object',
        errorName: 'Error',
        errorMessage: 'Project write denied',
        reachedWrite: true,
        completedWrite: false,
      });
      expect(mockCadSend).toHaveBeenCalledWith({
        type: 'kernelLog',
        level: 'error',
        message: 'CAD export failed',
        origin: { component: 'export', file: 'main.ts' },
        data: expectedDiagnosticData,
      });
      expect(toast.success).not.toHaveBeenCalled();
      const operationClaim = mockProjectSend.mock.calls
        .slice(beforeExport)
        .map(([event]) => event as { type: string; claimId: string })
        .find((event) => event.type === 'claimGeometryUnit');
      expect(operationClaim).toBeDefined();
      expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
      expect(screen.getByRole('button', { name: /^export glb$/iu })).not.toBeDisabled();
    } finally {
      view.unmount();
      mockWriteFiles.mockReset().mockResolvedValue(undefined);
      mockCadSend.mockReset();
    }
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
    it('should show settled unsupported formats when activeKernelId is undefined', () => {
      mockActiveKernelId = undefined;
      mockCapabilities = createCapabilities();
      render(<ChatConverter isExpanded />);

      expect(screen.queryByRole('button', { name: /glb/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /stl/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /step/i })).toBeNull();
      expect(screen.getByRole('status', { name: 'No supported export formats' })).toHaveAttribute('aria-busy', 'false');
      expect(screen.queryByRole('status', { name: 'Export formats are still loading' })).toBeNull();
      expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('main.ts');
      expect(mockPublishedExport).not.toHaveBeenCalled();
    });

    it('should keep the export status busy only while capabilities are undefined', () => {
      mockCapabilities = undefined;
      render(<ChatConverter isExpanded />);

      expect(screen.getByRole('status', { name: 'Export formats are still loading' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      expect(screen.queryByRole('status', { name: 'No supported export formats' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Formats' })).toBeNull();
      expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('main.ts');
      expect(mockPublishedExport).not.toHaveBeenCalled();
    });

    it.each([
      { reason: 'empty settled routes', routes: [] },
      {
        reason: 'missing matching exact provider',
        routes: [
          {
            targetFormat: 'step',
            kernelId: 'jscad',
            sourceFormat: 'step',
            fidelity: 'brep',
            exportOptions: { schema: {}, defaults: {} },
          },
        ],
      },
    ] satisfies Array<{ reason: string; routes: ExportRoute[] }>)(
      'should show settled unsupported formats for a coherent pin with $reason',
      ({ routes }) => {
        mockRendering = undefined;
        mockActiveKernelId = undefined;
        mockAssemblyDisplay = committedAssemblyFixture();
        mockCapabilities = createCapabilities({ routes });
        render(<ChatConverter isExpanded />);

        expect(screen.getByRole('status', { name: 'No supported export formats' })).toHaveAttribute(
          'aria-busy',
          'false',
        );
        expect(screen.queryByText('No geometry to export for this file')).toBeNull();
        expect(screen.queryByRole('status', { name: 'Export formats are still loading' })).toBeNull();
        expect(screen.queryByRole('region', { name: 'Formats' })).toBeNull();
        expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('main.ts');
        expect(mockPublishedExport).not.toHaveBeenCalled();
      },
    );

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

    it('should prefer brep over mesh regardless of route type', async () => {
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

      expect(await screen.findByTestId('rjsf-form')).toBeDefined();
    });

    it('should never show OpenSCAD tessellation options for replicad files', async () => {
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

      expect(await screen.findByTestId('rjsf-form')).toBeDefined();
    });
  });

  describe('preference persistence', () => {
    it('should restore persisted format selection on mount', async () => {
      const stored = JSON.stringify({ selectedFormats: ['stl'] });
      storePreferences(new TextEncoder().encode(stored));

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
      storePreferences(new TextEncoder().encode(stored));

      render(<ChatConverter isExpanded />);

      await vi.waitFor(() => {
        const saveCheckbox = screen.getByLabelText('Save to project');
        expect((saveCheckbox as HTMLInputElement).dataset['state']).toBe('checked');
      });
    });

    it('should restore a persisted batch image branch without reviving a single-view camera', async () => {
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
      storePreferences(
        new TextEncoder().encode(
          JSON.stringify({
            selectedFormats: ['webp'],
            formatOptions: {
              webp: {
                mode: 'batch',
                width: 768,
                height: 576,
                lineWidth: 1,
                axes: true,
                scaleBar: true,
                views: [
                  {
                    id: 'front',
                    label: 'Front',
                    camera: {
                      framing: 'fit',
                      direction: [0, -1, 0],
                      up: [0, 0, 1],
                      projection: { kind: 'orthographic' },
                    },
                  },
                ],
                camera: { framing: 'fit' },
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

      await waitFor(() => {
        expect(screen.getAllByTestId('rjsf-form')).toHaveLength(2);
      });
      const exportForm = screen.getAllByTestId('rjsf-form').find((form) => form.dataset['fields']?.startsWith('mode,'));
      expect(exportForm?.dataset['fields']).toBe('mode,width,height,quality,lineWidth,background,axes,scaleBar,views');
      fireEvent.click(screen.getByRole('button', { name: /export webp/i }));
      await vi.waitFor(() => {
        expect(mockDocumentFixture.document.export).toHaveBeenCalledWith('webp', {
          content: { includeEdges: true },
          options: {
            mode: 'batch',
            width: 768,
            height: 576,
            lineWidth: 1,
            axes: true,
            scaleBar: true,
            views: [
              {
                id: 'front',
                label: 'Front',
                camera: {
                  framing: 'fit',
                  direction: [0, -1, 0],
                  up: [0, 0, 1],
                  projection: { kind: 'orthographic' },
                },
              },
            ],
          },
        });
      });
    });

    it('should remove invalid and unknown persisted route options', async () => {
      storePreferences(
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
      storePreferences(
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
      storePreferences(
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
      storePreferences(new TextEncoder().encode(stored));
      mockContentService = undefined;

      const { rerender } = render(<ChatConverter isExpanded />);
      expect(mockReadFile).not.toHaveBeenCalled();

      mockContentService = contentServiceStub();
      rerender(<ChatConverter isExpanded className='force-rerender' />);

      await vi.waitFor(() => {
        expect(mockReadFile).toHaveBeenCalledTimes(1);
      });
    });
  });
});
