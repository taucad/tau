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
      const subject = await loadModel({
        file: `kernels/${model.kernel}/${model.name}/${model.mainFile}`,
        format: 'glb',
      });

      expectGeo(subject).toHaveNoDiagnostics();
      expectGeo(subject).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { count: 0 },
        duplicateFaces: { count: 0 },
        triangleCount: model.geometry === '2d' ? 0 : { greaterThan: 0 },
      });
      if (model.geometry === '3d') {
        expectGeo(subject).toBeWatertight();
      }
    });
  }
});
