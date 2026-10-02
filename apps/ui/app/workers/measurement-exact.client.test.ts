// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
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
