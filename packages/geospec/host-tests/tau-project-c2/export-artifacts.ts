import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';

import { NodeIO, getBounds } from '@gltf-transform/core';

import { parseProjectManifestBytes } from '@taucad/project-core';
import { exportTauProjectArtifact } from 'geospec/config';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';

const workspaceRoot = resolve(process.argv[2] ?? '.');
assert.ok(process.argv[3], 'Usage: export-artifacts.ts <workspace-root> <new-output-directory> [step|glb]');
const outputRoot = resolve(workspaceRoot, process.argv[3]);
const format = process.argv[4] ?? 'step';
assert.ok(format === 'step' || format === 'glb', 'Export format must be step or glb.');
const fixtureRoot = resolve(workspaceRoot, 'packages/geospec/host-tests/tau-project-c2/fixtures');
const workerPath = resolve(workspaceRoot, 'packages/geospec/host-tests/tau-project-c2/runtime.worker.ts');
const workerUrl = pathToFileURL(workerPath);

class TsxWorker extends NodeWorker {
  public constructor(url: string | URL) {
    super(url, { execArgv: ['--import', 'tsx'] });
  }
}

const sha256 = (bytes: string | Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const stepHeader = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const buffer = Buffer.from(bytes);
  const header = buffer.indexOf('HEADER;');
  const marker = buffer.indexOf('ENDSEC;', header);
  assert.notEqual(header, -1, 'STEP HEADER section must be present');
  assert.notEqual(marker, -1, 'STEP HEADER ENDSEC marker must be present');
  let end = marker + 'ENDSEC;'.length;
  if (buffer[end] === 0x0d) {
    end += 1;
  }
  if (buffer[end] === 0x0a) {
    end += 1;
  }
  return Uint8Array.from(buffer.subarray(0, end));
};

const states = [
  { id: 'baseline', dimensions: { x: 10, y: 20, z: 30 }, volume: 6000 },
  { id: 'comment', dimensions: { x: 10, y: 20, z: 30 }, volume: 6000 },
  { id: 'dimension', dimensions: { x: 14, y: 20, z: 30 }, volume: 8400 },
  { id: 'revert', dimensions: { x: 10, y: 20, z: 30 }, volume: 6000 },
] as const;

await mkdir(dirname(outputRoot), { recursive: true });
await mkdir(outputRoot);

const records = [];
/* oxlint-disable no-await-in-loop -- Run one OCCT worker lifecycle at a time to bound memory on the 12 GiB-free host. */
for (const state of states) {
  const projectRoot = resolve(fixtureRoot, state.id);
  const manifestBytes = Uint8Array.from(await readFile(resolve(projectRoot, 'tau.json')));
  const parsedManifest = parseProjectManifestBytes(manifestBytes);
  if (!parsedManifest.success) {
    throw new Error(`${state.id}: invalid Tau manifest: ${JSON.stringify(parsedManifest.issue)}`);
  }
  let runtimeCount = 0;
  const runtimeLogs: Array<{ runtimeIndex: number; entry: unknown }> = [];
  const result = await exportTauProjectArtifact({
    descriptor: {
      kind: 'tau-project',
      manifestPath: 'tau.json',
      manifest: parsedManifest.data,
      format,
    },
    createRuntime: () => {
      runtimeCount += 1;
      const runtimeIndex = runtimeCount;
      const client = createRuntimeClient({
        transport: nodeWorkerTransport({
          url: workerUrl,
          fileSystem: fromNodeFs(projectRoot),
          workerCtor: TsxWorker,
        }),
      });
      client.on('log', (entry) => runtimeLogs.push({ runtimeIndex, entry }));
      return client;
    },
  });
  const runtimeLogPath = resolve(outputRoot, `${state.id}.runtime.json`);
  await writeFile(runtimeLogPath, `${JSON.stringify(runtimeLogs, null, 2)}\n`);
  if (!result.success) {
    throw new Error(`${state.id}: ${JSON.stringify(result.issues)}`);
  }
  assert.equal(runtimeCount, 2, `${state.id}: adapter must use two fresh runtime lifetimes`);

  const artifactPath = resolve(outputRoot, `${state.id}.${format}`);
  const headerPath = resolve(outputRoot, `${state.id}.header.step`);
  const headerBytes = format === 'step' ? stepHeader(result.data.bytes) : undefined;
  await writeFile(artifactPath, result.data.bytes);
  if (headerBytes) {
    await writeFile(headerPath, headerBytes);
  }
  const persisted = Uint8Array.from(await readFile(artifactPath));
  assert.deepEqual(persisted, result.data.bytes, `${state.id}: persisted bytes changed`);
  let meshBounds;
  if (format === 'glb') {
    const document = await new NodeIO().readBinary(persisted);
    const scene = document.getRoot().getDefaultScene();
    assert.ok(scene, 'GLB must declare its scene');
    meshBounds = getBounds(scene);
    const expectedSize = [state.dimensions.x, state.dimensions.y, state.dimensions.z];
    for (const axis of [0, 1, 2] as const) {
      assert.ok(
        Math.abs(meshBounds.max[axis] - meshBounds.min[axis] - expectedSize[axis]!) <= 0.000001,
        `${state.id}: GLB axis ${axis} must match the declared Z-up/mm dimensions`,
      );
    }
  }

  records.push({
    id: state.id,
    expected: { boundingBoxSize: state.dimensions, volume: state.volume },
    artifact: {
      path: relative(workspaceRoot, artifactPath),
      byteLength: persisted.byteLength,
      sha256: sha256(persisted),
      name: result.data.name,
      mimeType: result.data.mimeType,
    },
    rawHeader: headerBytes
      ? {
          path: relative(workspaceRoot, headerPath),
          byteLength: headerBytes.byteLength,
          sha256: sha256(headerBytes),
          utf8: new TextDecoder().decode(headerBytes),
        }
      : undefined,
    meshBounds,
    frame: result.data.frame,
    source: {
      manifestPath: result.data.source.manifestPath,
      manifestSha256: sha256(result.data.source.manifestBytes),
      projectEntryPath: result.data.source.projectEntryPath,
      entryPath: result.data.source.entryPath,
      kernelId: result.data.source.kernelId,
      files: result.data.source.files.map((file) => ({
        path: file.path,
        role: file.role,
        byteLength: file.content.byteLength,
        sha256: file.sha256,
      })),
    },
    export: result.data.export,
    issues: result.issues,
    runtimeCount,
    runtimeLog: relative(workspaceRoot, runtimeLogPath),
  });
}
/* oxlint-enable no-await-in-loop */

const byId = new Map(records.map((record) => [record.id, record]));
const sourceIdentity = (id: (typeof states)[number]['id']): string =>
  sha256(JSON.stringify(byId.get(id)?.source.files));
assert.equal(sourceIdentity('baseline'), sourceIdentity('revert'));
assert.notEqual(sourceIdentity('baseline'), sourceIdentity('comment'));
assert.notEqual(sourceIdentity('baseline'), sourceIdentity('dimension'));

const adapterPath = resolve(workspaceRoot, 'packages/geospec/src/config/tau-project-artifact.ts');
const manifestPath = resolve(outputRoot, 'export-manifest.json');
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      format,
      taskId: 'M4-C2-SNAPSHOT-OPTIONAL-A3',
      runtime: {
        worker: relative(workspaceRoot, workerPath),
        transport: 'nodeWorkerTransport',
        plugins: ['esbuild', 'replicad'],
        middleware: ['parameterFileResolver', 'parameterCache', 'parameterUnits', 'geometryCache', 'gltfEdgeDetection'],
        computeBinding: 'memory (transport default)',
        limitation:
          'Bounded Node export profile uses relevant UI middleware defaults; no browser/UI E2E, observability, GLTF edge-output, or persistent cache-hit claim.',
        node: process.version,
      },
      adapter: {
        path: relative(workspaceRoot, adapterPath),
        sha256: sha256(Uint8Array.from(await readFile(adapterPath))),
      },
      records,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify({
    status: 'passed',
    manifest: relative(workspaceRoot, manifestPath),
    artifacts: records.map(({ id, artifact, rawHeader }) => ({
      id,
      artifact,
      rawHeader,
    })),
  }),
);
