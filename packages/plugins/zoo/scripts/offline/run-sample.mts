/**
 * Runs one KCL sample through the offline engine and writes `result.json` and `model.glb` to an output directory.
 *
 * Usage: tsx run-sample.mts <sampleDir> <outDirectory> [snapshotDirectory]
 */
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import { OfflineEngineConnection } from '#offline/offline-engine-connection.js';
import { boundingBox, compound, massProperties } from '#offline/offline-occt.js';

const [sampleDirectory, outDirectory, snapshotDirectory] = process.argv.slice(2) as [
  string,
  string,
  string | undefined,
];
await mkdir(outDirectory, { recursive: true });
const fs = {
  readFile: async (p: string, enc?: string) => {
    const bytes = await readFile(path.join(sampleDirectory, p));
    return enc ? bytes.toString('utf8') : new Uint8Array(bytes);
  },
  exists: async (p: string) => {
    try {
      await access(path.join(sampleDirectory, p));
      return true;
    } catch {
      return false;
    }
  },
  readdir: async (p: string) => readdir(path.join(sampleDirectory, p)),
} as unknown as ConstructorParameters<typeof FileSystemManager>[0];

type Result = Record<string, unknown>;
const result: Result = { name: path.basename(sampleDirectory) };
const t0 = performance.now();
// OFFLINE_PROFILE=1 times every libcascade call; OFFLINE_LIBCASCADE names another build's glue JS (a fresh
// `libcascade/build.sh` output, say) to load instead of the checked-in `src/offline/wasm` build.
OfflineEngineConnection.profileOcct = process.env['OFFLINE_PROFILE'] === '1';
// OFFLINE_VALIDATE=1 topology-checks every solid each command changes and records the invalid ones.
OfflineEngineConnection.validateSolids = process.env['OFFLINE_VALIDATE'] === '1';
const libcascadeGlue = process.env['OFFLINE_LIBCASCADE'];
const utils = new KclUtilities({
  baseUrl: 'ws://offline',
  mode: 'offline',
  fileSystemManager: new FileSystemManager(fs),
  ...(libcascadeGlue && {
    async loadOcct() {
      const { default: factory } = (await import(path.resolve(libcascadeGlue))) as {
        default: () => Promise<Parameters<typeof massProperties>[0]>;
      };
      return factory();
    },
  }),
});
try {
  await utils.initializeEngine();
  if (process.env['OFFLINE_TRACE']) {
    const engine = utils.offlineConnection!.engine!;
    const original = engine.execute.bind(engine);
    const lines: string[] = [];
    engine.execute = (id, cmd) => {
      try {
        const response = original(id, cmd);
        lines.push(JSON.stringify({ id, cmd, response }));
        return response;
      } catch (error) {
        lines.push(JSON.stringify({ id, cmd, error: String((error as Error).stack ?? error) }));
        throw error;
      } finally {
        void writeFile(path.join(outDirectory, 'trace.jsonl'), lines.join('\n'));
      }
    };
  }
  const tInit = performance.now();
  result['initMs'] = tInit - t0;
  OfflineEngineConnection.profiler.takeSnapshot();
  const code = await readFile(path.join(sampleDirectory, 'main.kcl'), 'utf8');
  const parsed = await utils.parseKcl(code);
  if (parsed.errors.length > 0) {
    throw new Error(`parse: ${parsed.errors.map((item) => item.message).join(' | ')}`);
  }

  const tParse = performance.now();
  result['parseMs'] = tParse - tInit;
  const outcome = await utils.executeProgram(parsed.program, 'main.kcl');
  const tExec = performance.now();
  result['executeMs'] = tExec - tParse;
  result['errors'] = outcome.errors.map((item) => item.message);
  const engine = utils.offlineConnection!.engine!;
  if (process.env['OFFLINE_INSPECT']) {
    // Debug hook: a module whose default export receives the engine after execution.
    const inspect = (await import(process.env['OFFLINE_INSPECT'])) as {
      default: (engine: unknown, oc: unknown) => unknown;
    };
    await inspect.default(engine, (engine as unknown as { oc: unknown }).oc);
  }

  const solids = engine.scene.visibleSolids();
  result['solidCount'] = solids.length;
  result['unhandled'] = Object.fromEntries(engine.unhandled);
  if (OfflineEngineConnection.validateSolids) {
    result['validationIssues'] = engine.validationIssues;
  }
  const executeProfile = OfflineEngineConnection.profiler.takeSnapshot();
  const files = await utils.exportFromMemory({ type: 'gltf', storage: 'binary' });
  const tExport = performance.now();
  result['exportMs'] = tExport - tExec;
  const exportProfile = OfflineEngineConnection.profiler.takeSnapshot();
  if (files[0]) {
    await writeFile(path.join(outDirectory, 'model.glb'), files[0].contents);
    result['glbBytes'] = files[0].contents.byteLength;
  }

  const oc = await (OfflineEngineConnection as unknown as { occt: Promise<Parameters<typeof massProperties>[0]> }).occt;
  OfflineEngineConnection.profiler.setEnabled(false);
  if (solids.length > 0) {
    const all = compound(
      oc,
      solids.map((s) => s.shape),
    );
    const box = boundingBox(oc, all);
    const props = massProperties(oc, all);
    result['measured'] = {
      volume: props.volume,
      area: props.area,
      center: box
        ? { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 }
        : null,
      dimensions: box ? { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z } : null,
    };
  }

  result['profile'] = { execute: executeProfile, export: exportProfile };
  result['ok'] = solids.length > 0 && outcome.errors.length === 0;
  result['native'] = Boolean((oc as unknown as { TauOffline?: unknown }).TauOffline);
} catch (error) {
  result['ok'] = false;
  result['failure'] = String((error as { message?: string }).message ?? JSON.stringify(error)).slice(0, 2000);
  const details = (error as { wasmError?: unknown }).wasmError;
  if (details) {
    result['failureDetails'] = JSON.stringify(details).slice(0, 2000);
  }
}

result['wallMs'] = performance.now() - t0;
if (snapshotDirectory) {
  try {
    const snap = await readFile(path.join(snapshotDirectory, 'physical_properties.snap'), 'utf8');
    const json = JSON.parse(snap.slice(snap.indexOf('{'))) as {
      bounding_box: { center: Record<string, number>; dimensions: Record<string, number> };
      surface_area: { value: number };
      weight: { value: number };
    };
    result['expected'] = {
      volume: json.weight.value * 1000,
      area: json.surface_area.value,
      center: json.bounding_box.center,
      dimensions: json.bounding_box.dimensions,
    };
  } catch {
    // No oracle for this sample.
  }
}

await writeFile(path.join(outDirectory, 'result.json'), JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    name: result['name'],
    ok: result['ok'],
    // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- result.json field read by summarize.py
    wallMs: Math.round(result['wallMs'] as number),
    failure: result['failure'],
    errors: result['errors'],
    unhandled: result['unhandled'],
  }),
);
process.exit(0);
