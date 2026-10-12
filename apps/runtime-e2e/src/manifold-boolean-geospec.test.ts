import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '@taucad/geospec-engine/register/node';
import { Engine } from '@taucad/geospec-engine-native/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { createModelLoader } from 'geospec/model';
import { createGeoSpecNodeRunner, createNodeVmFileSystem } from 'geospec/runner/node';
import { describe, expect, it } from 'vitest';

describe('Manifold boolean GeoSpec evidence', () => {
  // Each boolean input stays a separate EXT_mesh_manifold run (glTF primitive) in the kernel's GLB.
  it('proves a boolean of several inputs is one closed solid without asOriginal()', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-boolean-geospec-'));
    const runs = join(root, 'runs.glb');
    await mkdir(join(root, 'src'));
    await writeFile(
      join(root, 'src/main.ts'),
      `
      import { Manifold } from 'manifold-3d/manifoldCAD';
      export default function main() {
        const hole = Manifold.cylinder(12, 2.5, -1, 64);
        const plate = Manifold.cube([50, 30, 10], true)
          .translate([0, 0, 5])
          .subtract(Manifold.union([hole.translate([-17, 0, -1]), hole.translate([17, 0, -1])]));
        return Manifold.union([plate, Manifold.cylinder(8, 6, -1, 128).translate([0, 0, 10])]);
      }
    `,
    );
    await writeFile(
      join(root, 'boolean.geospec.ts'),
      `
      import { it, expectGeo } from 'geospec';
      import { loadModel } from 'geospec/model';
      it('one closed solid', async () => {
        const model = await loadModel({ file: 'main.ts' });
        expectGeo(model).toBeWatertight();
        expectGeo(model).toHaveConnectedComponents({ count: 1 });
      });
      it('runs without the manifold declaration', async () => {
        const model = await loadModel({ source: ${JSON.stringify(runs)}, format: 'glb' });
        expectGeo(model).toBeWatertight();
        expectGeo(model).toHaveConnectedComponents({ count: 1 });
      });
    `,
    );
    const engine = new Engine();
    const runner = createGeoSpecNodeRunner({
      projectPath: root,
      filesystem: createNodeVmFileSystem(root),
      nativeAssertions: { engine },
      modelLoader: createModelLoader({
        engine,
        projectPath: root,
        runtime: async () => createExampleGeoSpecRuntimeClient(root),
        readSource: async (source) => {
          if (typeof source !== 'string') {
            throw new TypeError('Only path sources are read from disk.');
          }
          return new Uint8Array(await readFile(source));
        },
      }),
      cache: false,
    });
    const client = await createExampleGeoSpecRuntimeClient(root);
    try {
      // Red control: the same GLB with the extension renamed reads as the pre-fix engine did.
      const document = client.open({ source: { path: 'main.ts' } });
      const exported = await document.export('glb', {
        options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      });
      document.close();
      const [glb] = exported.success ? exported.files : [];
      if (!glb) {
        throw new Error('Manifold kernel exported no GLB');
      }
      // ponytail: same-length rename keeps every GLB chunk length valid; latin1 round-trips the bytes.
      const renamed = Buffer.from(glb.bytes).toString('latin1').replaceAll('EXT_mesh_manifold', 'EXT_mesh_manifolX');
      await writeFile(runs, renamed, 'latin1');

      const result = await runner.run({ files: ['boolean.geospec.ts'] });
      const tests = result.files.flatMap(({ result: file }) => (file.success ? file.tests : []));
      expect(
        tests.map(({ name, status, diagnostics }) => ({ name, status, codes: diagnostics.map(({ code }) => code) })),
      ).toStrictEqual([
        { name: 'one closed solid', status: 'passed', codes: [] },
        { name: 'runs without the manifold declaration', status: 'inconclusive', codes: ['GEOSPEC_INVALID_EVIDENCE'] },
      ]);
      expect(result).toMatchObject({
        passed: 1,
        selectedTests: 2,
        accounting: { passed: 1, failed: 0, inconclusive: 1 },
      });
    } finally {
      client.terminate();
      await runner.close();
      engine.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
