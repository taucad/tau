// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentDigest } from '@taucad/cache-core';
import type {
  AdmittedAssembly,
  PublishedAssembly,
  PublishedPartRecord,
  PublishedPartExact,
} from '@taucad/runtime/types';
import type { GeometryComponentNode } from '@taucad/types';
import type { PublishedAssemblyDocument } from '@taucad/runtime/client';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import type { ExactOccurrenceDistanceInput } from '#workers/measurement-exact.client.js';
import { mock } from 'vitest-mock-extended';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { ExportResult, Rendering, SourceRevision } from '@taucad/runtime';
import type { GeometryComponentManifest } from '@taucad/types';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import type { CadContext, cadMachine } from '#machines/cad.machine.js';
import { bestRouteForActiveKernel } from '#utils/export-formats.utils.js';
import type { AppRuntimeExportRoute } from '#utils/export-formats.utils.js';
import type * as ExportFormats from '#utils/export-formats.utils.js';
import { runExactRequest } from '#workers/measurement-exact.transport.js';
import { measureExactOccurrenceDistance } from '#workers/measurement-exact.client.js';

vi.mock('#workers/measurement-exact.transport.js', () => ({ runExactRequest: vi.fn() }));
vi.mock('#utils/export-formats.utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ExportFormats>()),
  bestRouteForActiveKernel: vi.fn(),
}));

const revision: SourceRevision = { entry: 'main.ts', files: { 'main.ts': 'missing', 'shape.ts': 'missing' } };
const stepBytes = new Uint8Array([83, 84, 69, 80]);
function fixture() {
  const runtime = createMockRuntimeDocument();
  const rendering: Rendering = { ...runtime.rendering, sourceRevision: revision };
  const context = mock<CadContext>({
    activeKernelId: 'replicad',
    latestRenderingOutcome: 'success',
    rendering,
    entryPath: 'main.ts',
    document: runtime.document,
    kernelClient: createMockRuntimeClient(),
  });
  const snapshot = mock<SnapshotFrom<typeof cadMachine>>({ context });
  const cadRef = mock<ActorRefFrom<typeof cadMachine>>({ getSnapshot: () => snapshot });
  const manifest = mock<GeometryComponentManifest>({
    geometryHash: 'mock-rendering',
    sourceFile: 'main.ts',
    nodeOrder: ['left', 'right'],
    nodesById: { left: mock({ name: 'left' }), right: mock({ name: 'right' }) },
  });
  const exported: ExportResult = {
    success: true,
    exportId: 'step',
    evaluationId: rendering.evaluationId,
    sourceRevision: revision,
    files: [{ name: 'main.step', mimeType: 'model/step', bytes: stepBytes }],
    issues: [],
  };
  vi.mocked(runtime.document.export).mockResolvedValue(exported);
  vi.mocked(bestRouteForActiveKernel).mockReturnValue(
    mock<AppRuntimeExportRoute>({
      kernelId: 'replicad',
      targetFormat: 'step',
      transcoderId: undefined,
    }),
  );
  vi.mocked(runExactRequest).mockImplementation(async (request) => ({
    id: request.id,
    status: 'cad-geometry',
    distanceMeters: 0.01,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact native response preserves endpoint A/B spelling.
    pointAMeters: [0, 0, 0],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact native response preserves endpoint A/B spelling.
    pointBMeters: [0.01, 0, 0],
    source: 'ap242',
  }));
  const input = {
    cadRef,
    manifest,
    presentedGeometryHash: 'mock-rendering',
    occurrenceA: 'left',
    occurrenceB: 'right',
  };
  return { runtime, context, rendering, exported, input };
}

describe('exact measurement document pin', () => {
  afterEach(() => vi.clearAllMocks());

  it('should query the committed export bytes from the displayed evaluation', async () => {
    const f = fixture();
    const { signal } = new AbortController();
    expect(await measureExactOccurrenceDistance({ ...f.input, signal })).toMatchObject({
      status: 'cad-geometry',
      distanceMeters: 0.01,
    });
    expect(f.runtime.document.export).toHaveBeenCalledWith('step', {
      options: { coordinateSystem: 'y-up' },
      signal,
    });
    expect(runExactRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { format: 'ap242', bytes: stepBytes, coordinateSystem: 'y-up' },
        occurrences: [{ name: 'left' }, { name: 'right' }],
      }),
      signal,
    );
  });

  it('should refuse a newer parameter evaluation with identical source bytes', async () => {
    const f = fixture();
    vi.mocked(f.runtime.document.export).mockResolvedValue({ ...f.exported, evaluationId: 'new-parameters' });
    expect(await measureExactOccurrenceDistance(f.input)).toMatchObject({ status: 'unavailable' });
    expect(runExactRequest).not.toHaveBeenCalled();
  });

  it('should refuse an export with a changed dependency closure', async () => {
    const f = fixture();
    vi.mocked(f.runtime.document.export).mockResolvedValue({
      ...f.exported,
      sourceRevision: { ...revision, files: { 'main.ts': 'missing' } },
    });
    expect(await measureExactOccurrenceDistance(f.input)).toMatchObject({ status: 'unavailable' });
    expect(runExactRequest).not.toHaveBeenCalled();
  });

  it('should refuse a displayed rendering superseded during export', async () => {
    const f = fixture();
    vi.mocked(f.runtime.document.export).mockImplementation(async () => {
      f.context.rendering = { ...f.rendering, requestId: 'new-view' };
      return f.exported;
    });
    expect(await measureExactOccurrenceDistance(f.input)).toMatchObject({ status: 'unavailable' });
    expect(runExactRequest).not.toHaveBeenCalled();
  });

  it('should discard an exact answer when the displayed document changes', async () => {
    const f = fixture();
    vi.mocked(runExactRequest).mockImplementation(async (request) => {
      f.context.document = createMockRuntimeDocument().document;
      return { id: request.id, status: 'unavailable', reason: 'native answer' };
    });
    expect(await measureExactOccurrenceDistance(f.input)).toEqual({
      status: 'unavailable',
      reason: 'The displayed model changed during the exact query.',
    });
  });

  it('should stop before export when cancelled', async () => {
    const f = fixture();
    const abort = new AbortController();
    abort.abort();
    expect(await measureExactOccurrenceDistance({ ...f.input, signal: abort.signal })).toMatchObject({
      status: 'unavailable',
      reason: 'The exact query was cancelled.',
    });
    expect(f.runtime.document.export).not.toHaveBeenCalled();
    expect(runExactRequest).not.toHaveBeenCalled();
  });
});

const root = {
  path: 'scene.json',
  digest: contentDigest({ value: `sha256:${'0'.repeat(64)}`, name: 'measurement fixture root' }),
  byteLength: 42,
} as const;
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

// Adapter controls use the actual selector and route resolver. Native admission/placement is qualified separately.
function pinnedFixture() {
  const client = mock<AppRuntimeClient>();
  Object.defineProperty(client, 'capabilities', {
    value: {
      routes: [
        {
          targetFormat: 'step',
          sourceFormat: 'step',
          kernelId: 'replicad',
          fidelity: 'brep',
          exportOptions: { schema: {}, defaults: {} },
        },
      ],
      renderCapabilities: {},
      registrations: [],
    },
  });
  const document = mock<PublishedAssemblyDocument>();
  vi.mocked(bestRouteForActiveKernel).mockReturnValue(
    mock<AppRuntimeExportRoute>({
      kernelId: 'replicad',
      targetFormat: 'step',
      transcoderId: undefined,
    }),
  );
  const publication = mock<PublishedAssembly>({
    parts: {
      part: mock<PublishedPartRecord>({
        variants: {
          default: {
            source: mock(),
            glb: mock(),
            exact: mock<PublishedPartExact>({ kernelId: 'replicad', codecVersion: '2' }),
          },
        },
      }),
    },
    occurrences: [{ id: 'part', part: 'part', variant: 'default', transform: identity }],
  });
  const admitted = mock<AdmittedAssembly>({ publication });
  Object.assign(document, { root, admitted });
  const display = { root, admitted, document };
  const actor = mock<ActorRefFrom<typeof cadMachine>>();
  vi.mocked(actor.getSnapshot).mockReturnValue(
    mock<SnapshotFrom<typeof cadMachine>>({
      context: {
        kernelClient: client,
        document: undefined,
        rendering: undefined,
        committedRendering: undefined,
        publishedAssemblyRoot: root,
        publishedAssembly: publication,
        admittedAssembly: admitted,
        committedAssemblyDisplay: display,
        entryPath: 'scene.json',
        publishedAssemblyEntryPath: 'scene.json',
        latestRenderingOutcome: 'success',
        lastRequestedRenderId: 3,
        lastSettledRenderId: 3,
      },
    }),
  );
  const isCurrent = vi.fn(() => true);
  const manifest = mock<GeometryComponentManifest>();
  manifest.sourceFile = 'scene.json';
  manifest.geometryHash = root.digest;
  manifest.nodeOrder = ['canonical:a', 'canonical:b'];
  manifest.nodesById = {
    'canonical:a': mock<GeometryComponentNode>({ name: 'Same authored name' }),
    'canonical:b': mock<GeometryComponentNode>({ name: 'Same authored name' }),
  };
  const input: ExactOccurrenceDistanceInput = {
    cadRef: actor,
    presentedGeometryHash: root.digest,
    occurrenceA: 'canonical:a',
    occurrenceB: 'canonical:b',
    manifest,
    assemblyPose: {
      root,
      placements: [
        { componentId: 'canonical:a', worldTransform: identity },
        { componentId: 'canonical:b', worldTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.032, 0, 0, 1] },
      ],
      isCurrent,
    },
  };
  vi.mocked(document.exportPublished).mockResolvedValue({
    success: true,
    exportId: 'exact-export',
    issues: [],
    files: [{ name: 'scene.step', mimeType: 'application/step', bytes: new Uint8Array([1]) }],
  });
  vi.mocked(runExactRequest).mockImplementation(async ({ id }) => ({
    id,
    status: 'cad-geometry',
    source: 'ap242',
    distanceMeters: 0.02,
    pointAMeters: [0, 0, 0],
    pointBMeters: [0.02, 0, 0],
  }));
  return { input, document, actor, isCurrent };
}

describe('pinned exact occurrence adapter', () => {
  it('should export the captured root and placement-only pose and query canonical IDs despite duplicate authored names', async () => {
    const { input, document } = pinnedFixture();
    expect(await measureExactOccurrenceDistance(input)).toMatchObject({ status: 'cad-geometry', distanceMeters: 0.02 });
    expect(document.exportPublished).toHaveBeenCalledWith({
      format: 'step',
      publishedAssembly: { root, placements: input.assemblyPose!.placements },
      exportOptions: { coordinateSystem: 'y-up' },
      signal: undefined,
    });
    expect(runExactRequest).toHaveBeenCalledWith(
      expect.objectContaining({ occurrences: [{ name: 'canonical:a' }, { name: 'canonical:b' }] }),
      undefined,
    );
  });
  it('should deny an absent or mismatched committed root before export', async () => {
    const { input, document } = pinnedFixture();
    expect(await measureExactOccurrenceDistance({ ...input, assemblyPose: undefined })).toMatchObject({
      status: 'unavailable',
    });
    expect(
      await measureExactOccurrenceDistance({ ...input, assemblyPose: { ...input.assemblyPose!, root: { ...root } } }),
    ).toMatchObject({ status: 'unavailable' });
    expect(document.exportPublished).not.toHaveBeenCalled();
    expect(runExactRequest).not.toHaveBeenCalled();
  });
  it('should deny a stale presented pose before export', async () => {
    const { input, document, isCurrent } = pinnedFixture();
    isCurrent.mockReturnValue(false);
    expect(await measureExactOccurrenceDistance(input)).toMatchObject({ status: 'unavailable' });
    expect(document.exportPublished).not.toHaveBeenCalled();
  });
  it('should preserve runtime codec denial without querying or falling back to source', async () => {
    const { input, document } = pinnedFixture();
    vi.mocked(document.exportPublished).mockResolvedValue({
      success: false,
      issues: [mock({ message: 'Codec-v1 pose is unavailable' })],
    });
    expect(await measureExactOccurrenceDistance(input)).toEqual({
      status: 'unavailable',
      reason: 'Codec-v1 pose is unavailable',
    });
    expect(document.exportPublished).toHaveBeenCalledOnce();
    expect(runExactRequest).not.toHaveBeenCalled();
  });
  it('should deny pose changes during export before dispatching the exact query', async () => {
    const { input, document, isCurrent } = pinnedFixture();
    vi.mocked(document.exportPublished).mockImplementationOnce(async () => {
      isCurrent.mockReturnValue(false);
      return {
        success: true,
        issues: [],
        files: [{ name: 'scene.step', mimeType: 'application/step', bytes: new Uint8Array([1]) }],
      };
    });
    expect(await measureExactOccurrenceDistance(input)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('during exact export'),
    });
    expect(runExactRequest).not.toHaveBeenCalled();
  });
  it('should deny a root revision change during the exact query', async () => {
    const { input, actor } = pinnedFixture();
    vi.mocked(runExactRequest).mockImplementationOnce(async ({ id }) => {
      const snapshot = actor.getSnapshot();
      vi.mocked(actor.getSnapshot).mockReturnValue({
        ...snapshot,
        context: { ...snapshot.context, lastRequestedRenderId: 4 },
      });
      return { id, status: 'unavailable', reason: 'Native result no longer current' };
    });
    expect(await measureExactOccurrenceDistance(input)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('during the exact query'),
    });
  });
});
