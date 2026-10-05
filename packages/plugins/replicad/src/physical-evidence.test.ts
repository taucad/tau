/* eslint-disable @typescript-eslint/naming-convention -- Physical wire units use the published valueGPerCm3 spelling. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { registerTauGltfExtensions } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import { esbuildBundler } from '@taucad/esbuild';
import type { RuntimeClient } from '@taucad/runtime/client';
import { defineRuntime } from '@taucad/runtime/worker';
import { assertRenderingSuccess, createTestRuntimeClient, extractGltfFromResult } from '@taucad/runtime-testing';
import { replicadKernel } from '#replicad.kernel.js';
import { measureReplicadPhysical } from '#utils/physical-evidence.js';

const clients = new Set<Pick<RuntimeClient, 'shutdown'>>();
afterEach(async () => {
  await Promise.all([...clients].map(async (client) => client.shutdown()));
  clients.clear();
});

const clientFor = (source: string) => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({
      kernels: [replicadKernel({ wasm: 'single', tessellationInstancing: true })],
      bundlers: [esbuildBundler()],
    }),
    files: { 'main.ts': source },
  });
  clients.add(client);
  return client.open({ source: { path: 'main.ts' } });
};

const topology = async (bytes: Uint8Array<ArrayBuffer>): Promise<TauCadTopologyPayload> => {
  const document = await registerTauGltfExtensions(new NodeIO()).readBinary(bytes);
  const root = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension);
  if (!root) {
    throw new Error('Missing requested topology payload');
  }
  return root.getPayload() as unknown as TauCadTopologyPayload;
};

describe('requested Replicad physical evidence', () => {
  it('keeps a native-restored solid measurement and geometry digest equal to a fresh solid', async () => {
    const client = clientFor(`import { makeBox } from 'replicad';
      export default () => makeBox([0,0,0], [10,8,6]);`);
    const bootOutcome = await client.view('model', { content: { includePhysical: true } }).rendering();
    expect(bootOutcome.superseded).toBe(false);
    if (bootOutcome.superseded) {
      throw new Error('Unexpected superseded rendering.');
    }
    const boot = bootOutcome.rendering;
    assertRenderingSuccess(boot);

    const replicad = await import('replicad');
    const { deserializeShape, getOC, makeBox } = replicad;
    const volumeWork = vi.fn(replicad.measureVolume);
    const fresh = makeBox([0, 0, 0], [11, 8, 6]);
    const restored = deserializeShape(fresh.serialize());
    const first = await measureReplicadPhysical({ shape: fresh }, getOC(), volumeWork);
    const second = await measureReplicadPhysical({ shape: restored, density: 7.85 }, getOC(), volumeWork);
    expect(first.volume).toMatchObject({ state: 'measured', valueMm3: 528 });
    expect(second.volume).toEqual(first.volume);
    expect(second.density?.valueGPerCm3).toBe(7.85);
    expect(volumeWork).toHaveBeenCalledTimes(1);
    const meshClient = clientFor(`import { importSTLAsMesh, makeBox } from 'replicad';
      export default async () => ({
        shape: await importSTLAsMesh(makeBox([0,0,0], [1,1,1]).blobSTL({ binary: true })),
        density: 1.55,
      });`);
    const meshRenderOutcome = await meshClient.view('model', { content: { includePhysical: true } }).rendering();
    expect(meshRenderOutcome.superseded).toBe(false);
    if (meshRenderOutcome.superseded) {
      throw new Error('Unexpected superseded rendering.');
    }
    const meshRender = meshRenderOutcome.rendering;
    assertRenderingSuccess(meshRender);
    const meshPayload = await topology(extractGltfFromResult(meshRender)!);
    expect(meshPayload.components[0]?.physical).toEqual({
      volume: { state: 'unavailable', reason: 'not-solid' },
      density: { valueGPerCm3: 1.55, provenance: 'authored-shape-config' },
    });
    const importedMesh = await replicad.importSTLAsMesh(fresh.blobSTL({ binary: true }));
    const meshPhysical = await measureReplicadPhysical({ shape: importedMesh, density: 1.55 }, getOC(), volumeWork);
    expect(meshPhysical).toEqual({
      volume: { state: 'unavailable', reason: 'not-solid' },
      density: { valueGPerCm3: 1.55, provenance: 'authored-shape-config' },
    });
    expect(volumeWork).toHaveBeenCalledTimes(1);
    importedMesh.delete();
    const changed = await measureReplicadPhysical({ shape: makeBox([0, 0, 0], [12, 8, 6]) }, getOC(), volumeWork);
    expect(changed.volume).toMatchObject({ state: 'measured', valueMm3: 576 });
    expect(changed.volume).not.toEqual(first.volume);
    expect(volumeWork).toHaveBeenCalledTimes(2);
    const degenerate = await measureReplicadPhysical(
      { shape: makeBox([0, 0, 0], [13, 8, 6]) },
      getOC(),
      vi.fn(() => 0),
    );
    expect(degenerate.volume).toEqual({ state: 'unavailable', reason: 'invalid-solid' });
  }, 60_000);

  it('keeps exact geometry identity across a density-only assignment and exports requested facts', async () => {
    const client = clientFor(`
      import { makeBox } from 'replicad';
      export const defaultParams = { density: 2.7 };
      export default function main(p = defaultParams) {
        return { shape: makeBox([0,0,0], [10,8,6]), name: 'body', density: p.density };
      }
    `);
    const renderAt = async (density: number) => {
      await client.update({ parameters: { density } });
      const resultOutcome = await client.view('model', { content: { includePhysical: true } }).rendering();
      expect(resultOutcome.superseded).toBe(false);
      if (resultOutcome.superseded) {
        throw new Error('Unexpected superseded rendering.');
      }
      const result = resultOutcome.rendering;
      assertRenderingSuccess(result);
      const payload = await topology(extractGltfFromResult(result)!);
      const component = payload.components[0]!;
      return component.physical!;
    };
    const first = await renderAt(2.7);
    const changedDensity = await renderAt(7.85);
    expect(first.volume).toMatchObject({ state: 'measured', valueMm3: 480 });
    expect(changedDensity.volume).toEqual(first.volume);
    expect(first.density?.valueGPerCm3).toBe(2.7);
    expect(changedDensity.density?.valueGPerCm3).toBe(7.85);
    const exported = await client.export('glb', {
      content: { includePhysical: true },
    });
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error(JSON.stringify(exported.issues));
    }
    const exportedPayload = await topology(new Uint8Array(exported.files[0]!.bytes));
    const exportedPhysical = exportedPayload.components[0]!.physical;
    expect(exportedPhysical).toEqual(changedDensity);
  }, 60_000);

  it('rejects an invalid authored density instead of inventing a mass', async () => {
    const client = clientFor(`import { makeBox } from 'replicad';
      export default () => ({ shape: makeBox([0,0,0], [10,8,6]), density: -1 });`);
    const resultOutcome = await client.view('model', { content: { includePhysical: true } }).rendering();
    expect(resultOutcome.superseded).toBe(false);
    if (resultOutcome.superseded) {
      throw new Error('Unexpected superseded rendering.');
    }
    const result = resultOutcome.rendering;
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.issues)).toContain('finite positive');
  }, 60_000);

  it('measures checked native solids in mm³, preserves density provenance and leaves open geometry unknown', async () => {
    const client = clientFor(`
      import { makeBox, drawRectangle } from 'replicad';
      export default function main() {
        const box = makeBox([0,0,0], [10,8,6]);
        return [
          { shape: box, name: 'box', density: 2.7 },
          { shape: box.clone().cut(makeBox([2,2,0], [8,6,2])), name: 'hollow' },
          { shape: box.clone().translate([20,30,40]), name: 'moved' },
          { shape: box.clone().mirror('YZ'), name: 'mirrored' },
          { shape: box.clone().scale(2), name: 'scaled' },
          { shape: drawRectangle(10,8).sketchOnPlane().face(), name: 'open' },
        ];
      }
    `);
    const unrequestedOutcome = await client.view('model').rendering();
    expect(unrequestedOutcome.superseded).toBe(false);
    if (unrequestedOutcome.superseded) {
      throw new Error('Unexpected superseded rendering.');
    }
    const unrequested = unrequestedOutcome.rendering;
    assertRenderingSuccess(unrequested);
    const plain = await topology(extractGltfFromResult(unrequested)!);
    expect(plain.components.every((component) => component.physical === undefined)).toBe(true);

    const requestedOutcome = await client.view('model', { content: { includePhysical: true } }).rendering();

    expect(requestedOutcome.superseded).toBe(false);

    if (requestedOutcome.superseded) {
      throw new Error('Unexpected superseded rendering.');
    }

    const requested = requestedOutcome.rendering;
    assertRenderingSuccess(requested);
    const requestedPayload = await topology(extractGltfFromResult(requested)!);
    const { components } = requestedPayload;
    const volume = (name: string) => components.find((component) => component.name === name)?.physical?.volume;
    expect(volume('box')).toMatchObject({
      state: 'measured',
      valueMm3: 480,
      method: 'occt-solid-volume',
      validity: 'closed-solid',
    });
    const hollow = volume('hollow');
    expect(hollow?.state).toBe('measured');
    if (hollow?.state === 'measured') {
      expect(hollow.valueMm3).toBeCloseTo(432, 9);
    }
    expect(volume('moved')).toMatchObject({ state: 'measured', valueMm3: 480 });
    expect(volume('mirrored')).toMatchObject({ state: 'measured', valueMm3: 480 });
    expect(volume('scaled')).toMatchObject({ state: 'measured', valueMm3: 3840 });
    expect(volume('open')).toEqual({ state: 'unavailable', reason: 'not-solid' });
    expect(components.find((component) => component.name === 'box')?.physical?.density).toEqual({
      valueGPerCm3: 2.7,
      provenance: 'authored-shape-config',
    });
    const boxDigest = volume('box');
    const movedDigest = volume('moved');
    expect(boxDigest?.state).toBe('measured');
    expect(movedDigest?.state).toBe('measured');
    if (boxDigest?.state === 'measured' && movedDigest?.state === 'measured') {
      expect(boxDigest.geometryDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(movedDigest.geometryDigest).not.toBe(boxDigest.geometryDigest);
    }
  }, 60_000);
});
