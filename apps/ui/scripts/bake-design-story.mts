/**
 * Bake the shared hero from real JSCAD geometry and GeoSpec results.
 * Usage: pnpm nx run ui:bake-design-story
 * Benchmark: add --benchmark=/absolute/path/to/replicad-reference
 * No environment variables required. Exit 1 on invalid geometry or evidence.
 */
/* oxlint-disable no-await-in-loop -- Qualify and release each variant before evaluating the next one. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { jscad } from '@taucad/jscad';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import '@taucad/geospec-engine/register/node';
import { createModelLoader } from 'geospec/model';
import { runGeoSpecModule } from 'geospec/runner';
import { createNodeVmFileSystem } from 'geospec/runner/node';
import { Mesh, Vector3 } from 'three';
import { GLTFLoader, MeshSurfaceSampler } from 'three/addons';

const sourcePath = resolve(import.meta.dirname, '../app/components/geometry/splash/planetary');
const assetPath = resolve(sourcePath, '../assets');
const reportPath = resolve(import.meta.dirname, '../../../out/research/marketing-hero/implementation');
const digest = (bytes: string | Uint8Array<ArrayBuffer>) => createHash('sha256').update(bytes).digest('hex');

const main = async () => {
  const sourceDigest = digest(await readFile(resolve(sourcePath, 'main.js'), 'utf8'));
  const specDigest = digest(await readFile(resolve(sourcePath, 'main.geospec.js'), 'utf8'));
  const runtime: AnyRuntimeDefinition = defineRuntime({ plugins: [esbuild(), middleware(), jscad()] });
  const client = await createNodeClient({ runtime, projectPath: sourcePath });
  const variants = [];
  await mkdir(assetPath, { recursive: true });
  await mkdir(reportPath, { recursive: true });
  try {
    await client.connect();
    for (const parameters of [{ module: 0 }, { backlash: 0 }, { gearWidth: 0 }, { part: 'unknown' }]) {
      const invalid = await client.export('glb', { source: { path: 'main.js' }, parameters });
      if (invalid.success) {
        throw new Error(`Invalid parameters were accepted: ${JSON.stringify(parameters)}`);
      }
    }
    const loader = createModelLoader({ runtime: client, projectPath: sourcePath });
    for (const module of [3.5, 3]) {
      console.log(`Validating module ${module}`);
      const result = await runGeoSpecModule({
        entryPath: 'main.geospec.js',
        filesystem: createNodeVmFileSystem(sourcePath),
        modelLoader: async (options) => loader({ ...options, parameters: { ...options.parameters, module } }),
        testTimeout: 120_000,
      });
      if (!result.success) {
        throw new Error(JSON.stringify(result));
      }
      await writeFile(resolve(reportPath, `geospec-${module}.json`), JSON.stringify(result, null, 2));
      console.log(
        JSON.stringify(
          result.tests.map((test) => ({
            name: test.name,
            status: test.status,
            codes: test.diagnostics.map((diagnostic) => diagnostic.code),
          })),
        ),
      );
      const fit = result.tests.find((test) => test.name.includes('fits the declared'));
      const expectedFit = module === 3;
      if (
        !fit ||
        (fit.status === 'passed') !== expectedFit ||
        result.tests.some((test) => test !== fit && test.status !== 'passed')
      ) {
        throw new Error(`Geometry qualification failed; see ${reportPath}/geospec-${module}.json`);
      }
      const start = performance.now();
      const exported = await client.export('glb', {
        source: { path: 'main.js' },
        parameters: { module },
        exportOptions: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      });
      if (!exported.success || !exported.data[0]) {
        throw new Error(`Export failed: ${JSON.stringify(exported)}`);
      }
      const geometry = exported.data[0].bytes;
      const filename = module === 3 ? 'planetary.glb' : 'planetary-oversized.glb';
      await writeFile(resolve(assetPath, filename), geometry);
      const gltf = await new GLTFLoader().parseAsync(new Uint8Array(geometry).buffer, '');
      gltf.scene.updateMatrixWorld(true);
      const sampled: Record<string, number[]> = {};
      let seed = 42;
      const random = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return seed / 4_294_967_296;
      };
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        const original = object as Mesh;
        // Empty scene names must fall back to the named mesh.
        // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- Empty string is not a part identity.
        const name = (object.parent?.name || object.name).replaceAll('_', ' ');
        const mesh = new Mesh(original.geometry.clone().applyMatrix4(object.matrixWorld));
        // Installed Three.js supports seeded sampling; its declaration lags this method.
        const sampler = new MeshSurfaceSampler(mesh) as MeshSurfaceSampler & {
          setRandomGenerator: (random: () => number) => MeshSurfaceSampler;
        };
        sampler.setRandomGenerator(random).build();
        for (const [key, count] of [
          [name, name === 'Housing' ? 660 : 180],
          ...(name === 'Housing' ? [['printHousing', 3000] as const] : []),
        ] as const) {
          const points: number[] = [];
          const point = new Vector3();
          for (let index = 0; index < count; index++) {
            sampler.sample(point);
            points.push(...point.toArray().map((value) => Math.round(value * 10_000) / 10_000));
          }
          sampled[key] = points;
        }
        mesh.geometry.dispose();
        original.geometry.dispose();
        for (const material of Array.isArray(original.material) ? original.material : [original.material]) {
          material.dispose();
        }
      });
      const pointsFilename = filename.replace('.glb', '.points.json');
      if (Object.keys(sampled).length !== 15 || !sampled['printHousing']) {
        throw new Error('Expected 14 named parts plus the print-housing sample.');
      }
      const pointsBytes = JSON.stringify(sampled);
      await writeFile(resolve(assetPath, pointsFilename), pointsBytes);
      variants.push({
        module,
        filename,
        geometryDigest: digest(geometry),
        bytes: geometry.length,
        pointsFilename,
        pointsDigest: digest(pointsBytes),
        exportDuration: performance.now() - start,
        fits: expectedFit,
        diameter: 64 * module + 28,
        tests: result.tests.map((test) => ({
          name: test.name,
          status: test.status,
          codes: test.diagnostics.map((diagnostic) => diagnostic.code),
        })),
      });
    }
    await writeFile(
      resolve(assetPath, 'design-story-evidence.json'),
      JSON.stringify({ version: 1, sourceDigest, specDigest, unit: 'mm', usableBed: 236, variants }, null, 2) + '\n',
    );
    console.log('Hero geometry and evidence baked successfully');
  } finally {
    client.terminate();
  }
};

/** Measure uncached parameter regeneration, not repeated cache hits. All durations are milliseconds. */
const benchmark = async (referencePath: string) => {
  const results = [];
  for (const { kernel, trial } of ['jscad', 'replicad'].flatMap((kernel) =>
    [1, 2, 3].map((trial) => ({ kernel, trial })),
  )) {
    const projectPath = kernel === 'jscad' ? sourcePath : resolve(referencePath);
    const runtime: AnyRuntimeDefinition = defineRuntime({
      plugins: [esbuild(), middleware(), kernel === 'jscad' ? jscad() : replicad()],
    });
    const initializationStart = performance.now();
    const client = await createNodeClient({ runtime, projectPath });
    try {
      await client.connect();
      const initializationDuration = performance.now() - initializationStart;
      for (const backlash of [0.15, 0.16, 0.17, 0.18]) {
        const input = {
          source: { path: kernel === 'jscad' ? 'main.js' : 'main.ts' },
          parameters: {
            module: 3,
            backlash,
            gearWidth: 12,
            sunTeeth: 18,
            planetTeeth: 18,
            planetCount: 3,
            pressureAngleDeg: 20,
          },
        };
        const start = performance.now();
        const evaluated = await client.evaluate({
          ...input,
          renderOptions: kernel === 'replicad' ? { tessellation: { linearTolerance: 0.05, angularTolerance: 10 } } : {},
        });
        if (!evaluated.success) {
          throw new Error(JSON.stringify(evaluated));
        }
        const evaluationDuration = performance.now() - start;
        const exportStart = performance.now();
        const result = await client.export('glb', {
          ...input,
          exportOptions: {
            coordinateSystem: 'z-up',
            unit: { length: 'millimeter' },
            ...(kernel === 'replicad' ? { tessellation: { linearTolerance: 0.05, angularTolerance: 10 } } : {}),
          },
        });
        if (!result.success) {
          throw new Error(JSON.stringify(result));
        }
        const entry = {
          kernel,
          trial,
          backlash,
          initializationDuration,
          evaluationDuration,
          exportDuration: performance.now() - exportStart,
          bytes: result.data[0]?.bytes.length,
        };
        results.push(entry);
        console.log(JSON.stringify(entry));
      }
    } finally {
      client.terminate();
    }
  }
  await writeFile(
    resolve(reportPath, 'benchmark.json'),
    JSON.stringify(
      {
        referencePath,
        sourceDigest: digest(await readFile(resolve(sourcePath, 'main.js'), 'utf8')),
        method:
          'Three fresh clients per kernel. First evaluation is cold; remaining samples change backlash. Evaluation includes preview meshing; subsequent GLB export is measured separately. 0.05 mm chord/tessellation target, 14 occurrences, module 3.',
        results,
      },
      null,
      2,
    ),
  );
};

try {
  const reference = process.argv.find((argument) => argument.startsWith('--benchmark='))?.slice('--benchmark='.length);
  // oxlint-disable-next-line unicorn/prefer-ternary -- Keep both asynchronous entry points explicitly awaited.
  if (reference) {
    await benchmark(reference);
  } else {
    await main();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
