/**
 * Browser fixture for the engine's e2e suite.
 *
 * Mirrors what `apps/ui`'s GeoSpec worker does: install the engine with a bare
 * `@taucad/geospec-engine/register` import, then execute real matchers through
 * the substrate's collector. Everything here runs in the browser — a Node-only
 * module reachable from the register entry fails this bundle at build time,
 * which is exactly the regression this fixture exists to catch.
 */

import { Accessor, Document, WebIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';
import { analyzeMesh } from 'geospec/mesh';
import { describeGeoSpecEngine } from 'geospec/engine';
import { createCollector, discoverGeoSpecFiles, installCollector } from 'geospec/runner';
// The UI's worker imports these too. Keeping the fixture's import surface equal
// to the worker's is what makes this suite a guard for `apps/ui` rather than a
// smoke test of a narrower graph.
import { createGeoSpecWebRunner } from 'geospec/runner/web';
import { loadModel } from 'geospec/model';
import '@taucad/geospec-engine/register';

/** A closed unit box: 8 corners, 12 triangles, every edge shared exactly twice. */
const boxCorners = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const boxIndices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

const accessorType = (name: 'VEC3' | 'SCALAR'): GLTF.AccessorType => {
  const type = Accessor.Type[name];
  if (type === undefined) {
    throw new TypeError(`Missing glTF accessor type '${name}'.`);
  }
  return type;
};

const buildBoxGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(accessorType('VEC3'))
    .setBuffer(buffer)
    .setArray(new Float32Array(boxCorners));
  const indices = document
    .createAccessor()
    .setType(accessorType('SCALAR'))
    .setBuffer(buffer)
    .setArray(new Uint32Array(boxIndices));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('box').addPrimitive(primitive);
  document.createScene('scene').addChild(document.createNode('box').setMesh(mesh));
  return new WebIO().writeBinary(document);
};

/**
 *
 */
export type BrowserEngineReport = {
  engine: string;
  capabilities: string[];
  triangles: number;
  watertight: boolean;
  tests: Array<{ name: string; status: string }>;
  error?: string;
};

const run = async (): Promise<BrowserEngineReport> => {
  const descriptor = describeGeoSpecEngine();
  if (!descriptor) {
    throw new Error('No engine registered after importing @taucad/geospec-engine/register.');
  }

  const analysis = await analyzeMesh({ source: await buildBoxGlb(), format: 'glb' });
  if (!analysis.success) {
    throw new Error(`analyzeMesh failed: ${analysis.diagnostics.map((issue) => issue.message).join('; ')}`);
  }

  const collector = createCollector();
  installCollector(collector);
  collector.describe('geospec engine in the browser', () => {
    collector.it('proves the box mesh is watertight', () => {
      collector.expectGeo(analysis.subject).toHaveMeshIntegrity({ watertight: true });
    });
  });
  await collector.waitForCompletion(60_000);

  // Touch the worker-facing entry points so the bundler cannot tree-shake the
  // graph this suite exists to keep browser-safe.
  const workerSurface = [createGeoSpecWebRunner, loadModel, discoverGeoSpecFiles].every(
    (entry) => typeof entry === 'function',
  );
  if (!workerSurface) {
    throw new Error('The UI worker surface is not callable in the browser build.');
  }

  return {
    engine: descriptor.engine,
    capabilities: [...descriptor.capabilities],
    triangles: analysis.stats.triangleCount,
    watertight: analysis.stats.watertight,
    tests: collector.tests.map((test) => ({ name: test.name, status: test.status })),
  };
};

const report = document.querySelector('#report');

/**
 * Handshake key the Vitest Browser spec reads back off the page.
 *
 * Named rather than inlined so the access stays bracketed: the property lives
 * on an index signature, which `noPropertyAccessFromIndexSignature` requires be
 * read with brackets. `e2e/` is in no tsconfig, so the lint pass types it
 * against the default project and cannot see that option.
 */
const browserReportKey = '__geospecBrowserReport';

try {
  const result = await run();
  Reflect.set(globalThis, browserReportKey, result);
  if (report) {
    report.textContent = JSON.stringify(result);
  }
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  Reflect.set(globalThis, browserReportKey, { error: message });
  if (report) {
    report.textContent = JSON.stringify({ error: message });
  }
}
