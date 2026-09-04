import '@taucad/geospec-engine/register';
import { analyzeMesh, loadMesh } from 'geospec/mesh';
import { getGeoSpecEngineProtocol } from 'geospec/engine';
import { GeoSpecModelLoadError } from 'geospec/model';
import { runGeoSpecModule } from 'geospec/runner';
import type { GeometryDiagnostic } from 'geospec/mesh';
import { memoryFileSystem } from '#runner/testing/memory-filesystem.js';

/** Evidence returned across the actual browser worker boundary. */
export type WorkerEvidenceReport = {
  analysisDetached: boolean;
  diagnostics: GeometryDiagnostic[][];
  error?: string;
};

const run = async (): Promise<WorkerEvidenceReport> => {
  const loaded = await loadMesh({ source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] } });
  if (!loaded.success) {
    throw new Error('worker mesh load failed');
  }
  try {
    const first = await analyzeMesh({ subject: loaded.subject });
    if (!first.success) {
      throw new Error('worker analysis failed');
    }
    first.stats.meshQuality.triangles[0]!.a[0] = 999;
    const second = await analyzeMesh({ subject: loaded.subject });
    const entryPath = 'worker.geospec.ts';
    const result = await runGeoSpecModule({
      entryPath,
      modelLoader: async () => {
        throw new GeoSpecModelLoadError([
          {
            code: 'EXPORT_FAILED',
            severity: 'error',
            message: 'Gear export failed',
            spatial: { center: [1, 2, 3] },
            details: { file: 'gear.ts', part: 'tooth' },
          },
          {
            code: 'GEOMETRY_INVALID',
            severity: 'warning',
            message: 'Non-manifold tooth',
            suggestion: 'Close the tooth root',
          },
        ]);
      },
      filesystem: memoryFileSystem({
        [entryPath]: `
        import { it, expectGeo } from 'geospec';
        import { loadModel, GeoSpecModelLoadError } from 'geospec/model';
        import { analyzeMesh } from 'geospec/mesh';
        it('real loader error', async () => { await loadModel({ file: 'gear.ts' }); });
        it('VM error constructor', () => { throw new GeoSpecModelLoadError([
          {code: 'FIRST', severity: 'error', message: 'first', spatial: {center: [3,2,1]}},
          {code: 'SECOND', severity: 'error', message: 'second'}
        ]); });
        it('VM source analysis', async () => {
          const result = await analyzeMesh({ source: { format: 'mesh-buffer', positions: [0,0,0,1,0,0,0,1,0] } });
          if (!result.success || result.stats.meshQuality.surfaceArea !== 0.5) throw new Error('VM analysis failed');
          expectGeo(result.subject).toBeWatertight();
        });
      `,
      }),
    });
    if (!result.success) {
      throw new Error(result.issues.map((issue) => issue.message).join('\n'));
    }
    return {
      analysisDetached: second.success && second.stats.meshQuality.triangles[0]!.a[0] === 0,
      diagnostics: result.tests.map((test) => test.diagnostics),
    };
  } finally {
    getGeoSpecEngineProtocol()?.releaseSubject({ requestId: 'worker-cleanup', subjectId: loaded.subject.subjectId });
  }
};

try {
  globalThis.postMessage(await run());
} catch (error) {
  globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
