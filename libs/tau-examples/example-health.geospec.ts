import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
// oxlint-disable-next-line no-restricted-imports -- GeoSpec's project VM resolves corpus-relative files, not package import maps.
import inventory from './src/manifest.json';

const modelRows = inventory.filter((entry) => entry.kind === 'model');
const unroutable = modelRows.filter((entry) => !entry.mainFile);
if (unroutable.length > 0) {
  throw new Error(
    `Tau example models without an entry route: ${unroutable.map(({ kernel, name }) => `${kernel}.${name}`).join(', ')}`,
  );
}
const models = modelRows.filter((entry): entry is typeof entry & { mainFile: string } => Boolean(entry.mainFile));

describe('Tau example model health', () => {
  for (const model of models) {
    it(`${model.kernel}.${model.name}`, async () => {
      const file = `kernels/${model.kernel}/${model.name}/${model.mainFile}`;
      if (model.geometry === '2d') {
        // A 2D drawing has no mesh to export. Its STEP export writes the drawing's region faces on the XY
        // plane at Z = 0, so the engine decides the drawing on exact geometry: valid closed profiles bounding
        // planar faces with area, no thickness and no solid.
        const drawing = await loadModel({ file, format: 'step', mesh: false });
        expectGeo(drawing).toHaveNoDiagnostics();
        expectGeo(drawing).toBeValidBrep({ closedWires: true });
        expectGeo(drawing).toHaveTopologyCounts({ faces: { greaterThan: 0 }, solids: 0 });
        expectGeo(drawing).toHaveBoundingBox({
          min: { z: 0 },
          size: { x: { greaterThan: 0 }, y: { greaterThan: 0 }, z: 0 },
        });
        expectGeo(drawing).toHaveSurfaceArea({ value: { greaterThan: 0 } });
        return;
      }
      const subject = await loadModel({ file, format: 'glb' });

      // Tscircuit boards are component assemblies from an upstream mesh library
      // (bodies are not closed shells) and carry upstream DRC/style warnings by
      // design, so they are held to error-free diagnostics and mesh integrity.
      const assembly = model.kernel === 'tscircuit';
      expectGeo(subject).toHaveNoDiagnostics(assembly ? { severities: ['error'] } : undefined);
      expectGeo(subject).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { count: 0 },
        duplicateFaces: { count: 0 },
        triangleCount: { greaterThan: 0 },
      });
      if (model.geometry === '3d' && !assembly) {
        expectGeo(subject).toBeWatertight();
      }
    });
  }
});
