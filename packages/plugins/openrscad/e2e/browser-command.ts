/* oxlint-disable no-await-in-loop -- The bundle walk is depth-first over a handful of files. */
import { readdir, readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { assimp } from '@taucad/assimp';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import type { BrowserCommand } from 'vitest/node';
import { openrscad } from '@taucad/openrscad';
import { trackEngineBackend } from '#e2e/backend-log.js';
import type { OpenrscadBrowserReport } from '#e2e/fixture/main.js';

export const openrscadBaseURL = 'http://127.0.0.1:4331';
export const openrscadServerLog = resolve(
  import.meta.dirname,
  '../../../../out/test-results/vitest-browser/packages/plugins/openrscad/server.log',
);

const kitchenSink = resolve(
  import.meta.dirname,
  '../../../../libs/tau-examples/src/kernels/openscad/kitchen-sink/main.scad',
);

/** Triangle count and world bounds of a GLB, the units both paths are compared in. */
export type MeshSummary = {
  readonly primitives: number;
  readonly triangles: number;
  readonly modes: readonly number[];
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] };
};

/** One path's USDZ artifact, described in terms both paths can be compared on. */
export type UsdzArtifact = {
  readonly backend?: string;
  readonly byteLength: number;
  readonly zipMagic: readonly number[];
  readonly firstEntryName: string;
  readonly roundtrip: MeshSummary;
};

/** Everything the spec needs to compare the two paths and explain a failure. */
export type OpenrscadUsdzParityResult = {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly browser: UsdzArtifact | undefined;
  readonly browserLogs: readonly string[];
  readonly browserError?: string;
  readonly native: UsdzArtifact;
  readonly nativeLogs: readonly string[];
  /** Chunk-relative names of built bundle files that reach a Node-only module. */
  readonly nodeOnlyBundleHits: readonly string[];
  readonly serverLog?: string;
};

/**
 * The commands this suite registers, named so the spec can bind them onto
 * Vitest's `server.commands`. `BrowserCommands` is declared inside the `vitest`
 * copy `@vitest/browser-playwright` resolves rather than the one this package
 * does, so a module augmentation never merges; the spec intersects instead.
 */
export type OpenrscadBrowserCommands = {
  runOpenrscadUsdzParity(): Promise<OpenrscadUsdzParityResult>;
};

/**
 * Node-only reachability in a browser bundle.
 *
 * `native/index` is the engine's N-API loader: reaching it at all means the
 * bundler resolved `@taulabs/openrscad-engine`'s `node` condition instead of
 * its `browser` one. A *static* `node:` import means some module in the graph
 * only runs under Node. Emscripten's guarded `await import("node:module")`
 * environment probe is deliberately not matched — it is a dead branch in a
 * browser and lives in vendored WebAssembly glue, not in Tau's own graph.
 */
const nodeOnlyPatterns = [/native\/index/u, /\bfrom\s*["']node:/u, /\bimport\s*["']node:/u];

const summarize = async (glb: Uint8Array<ArrayBuffer>): Promise<MeshSummary> => {
  const document = await new NodeIO().readBinary(glb);
  const scene = document.getRoot().getDefaultScene();
  if (!scene) {
    throw new Error('Round-tripped geometry has no scene.');
  }
  const primitives = document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  let triangles = 0;
  for (const primitive of primitives) {
    triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')!.getCount()) / 3;
  }
  const bounds = getBounds(scene);
  return {
    primitives: primitives.length,
    triangles,
    modes: primitives.map((primitive) => primitive.getMode()),
    bounds: { min: [...bounds.min], max: [...bounds.max] },
  };
};

const scanBundle = async (directory: string, prefix = ''): Promise<string[]> => {
  const hits: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      hits.push(...(await scanBundle(join(directory, entry.name), `${relativePath}/`)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const contents = await readFile(join(directory, entry.name), 'utf8');
      if (nodeOnlyPatterns.some((pattern) => pattern.test(contents))) {
        hits.push(relativePath);
      }
    }
  }
  return hits;
};

const readServerLog = async (): Promise<string | undefined> => {
  try {
    return await readFile(openrscadServerLog, 'utf8');
  } catch {
    return undefined;
  }
};

const describeUsdz = (
  bytes: Uint8Array<ArrayBuffer>,
  backend: string | undefined,
  roundtrip: MeshSummary,
): UsdzArtifact => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    ...(backend === undefined ? {} : { backend }),
    byteLength: bytes.byteLength,
    zipMagic: [...bytes.subarray(0, 4)],
    firstEntryName: new TextDecoder().decode(bytes.subarray(30, 30 + view.getUint16(26, true))),
    roundtrip,
  };
};

/**
 * Both USDZ paths for one OpenSCAD model, measured the same way.
 *
 * The browser half runs in Playwright's Chromium against the built fixture;
 * the native half runs here, in-process, over the same plugins and the same
 * `.scad` file. Both USDZ archives are then round-tripped back to GLB by *this*
 * process, so the triangle counts and bounds the spec compares differ only in
 * which engine backend produced the geometry.
 *
 * @param commandContext - Vitest's browser-command context, carrying the Playwright browser.
 * @returns Both artifacts, both round trips, the fixture's logs and the bundle scan.
 */
export const runOpenrscadUsdzParity: BrowserCommand<never[], OpenrscadUsdzParityResult> = async (commandContext) => {
  if (commandContext.provider.name !== 'playwright') {
    throw new TypeError(
      `The OpenRSCAD browser E2E requires the Playwright provider, received '${commandContext.provider.name}'.`,
    );
  }

  const source = await readFile(kitchenSink, 'utf8');
  const page = await commandContext.context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let report: OpenrscadBrowserReport;
  try {
    await page.addInitScript((text) => Reflect.set(globalThis, '__openrscadBrowserSource', text), source);
    const response = await page.goto(openrscadBaseURL, { waitUntil: 'domcontentloaded' });
    if (!response) {
      throw new Error('The OpenRSCAD preview navigation did not return a document response.');
    }
    await page.waitForFunction(() => Reflect.has(globalThis, '__openrscadBrowserReport'), undefined, {
      timeout: 300_000,
    });
    report = await page.evaluate(() => Reflect.get(globalThis, '__openrscadBrowserReport') as OpenrscadBrowserReport);
  } finally {
    await page.close();
  }

  const runtime = defineRuntime({ plugins: [openrscad(), assimp({ preset: 'all' })] });
  const client = await createNodeClient({ runtime });
  const nativeTracker = trackEngineBackend(client);
  const workspace = await mkdtemp(join(tmpdir(), 'openrscad-usdz-'));
  try {
    const exported = await client.export('usdz', { source: { files: { 'main.scad': source } } });
    if (!exported.success) {
      throw new Error(`Native usdz export failed: ${exported.issues.map((issue) => issue.message).join('; ')}`);
    }
    const nativeBytes = exported.data[0]!.bytes;
    await writeFile(join(workspace, 'native.usdz'), nativeBytes);
    const browserBytes = report.usdzBase64 === undefined ? undefined : Buffer.from(report.usdzBase64, 'base64');
    if (browserBytes) {
      await writeFile(join(workspace, 'browser.usdz'), browserBytes);
    }

    /*
     * One importer, one exporter, one process for both archives: any residual
     * difference the spec sees is the engine backend that produced the mesh,
     * not the round trip that measured it.
     */
    const roundtripClient = await createNodeClient({ runtime, projectPath: workspace });
    try {
      const roundtrip = async (name: string): Promise<MeshSummary> => {
        const glb = await roundtripClient.export('glb', { source: { path: name } });
        if (!glb.success) {
          throw new Error(`${name} → glb failed: ${glb.issues.map((issue) => issue.message).join('; ')}`);
        }
        return summarize(glb.data[0]!.bytes);
      };
      const nativeBackend = await nativeTracker.backend();

      return {
        consoleErrors,
        pageErrors,
        browser: browserBytes ? describeUsdz(browserBytes, report.backend, await roundtrip('browser.usdz')) : undefined,
        browserLogs: report.logs,
        ...(report.error === undefined ? {} : { browserError: report.error }),
        native: describeUsdz(nativeBytes, nativeBackend, await roundtrip('native.usdz')),
        nativeLogs: nativeTracker.logs,
        nodeOnlyBundleHits: await scanBundle(resolve(import.meta.dirname, 'dist-fixture')),
        serverLog: await readServerLog(),
      };
    } finally {
      roundtripClient.terminate();
    }
  } finally {
    client.terminate();
  }
};
