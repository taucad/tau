// @vitest-environment node
/* oxlint-disable new-cap -- OCCT exposes callable C++ PascalCase methods. */
/* eslint-disable @typescript-eslint/naming-convention -- The fakes mirror OCJS embind's C++ PascalCase members. */
import { Worker } from 'node:worker_threads';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OpenCascadeInstance, TopoDS_Shape, TopTools_ListOfShape } from 'replicad-opencascadejs';
import type * as RuntimeKernelModule from '@taucad/runtime/kernel';
import { initOcct, wrapOcForExceptions } from '@taucad/occt-core';
import * as replicad from 'replicad';
import { loadReplicadSingleWasm } from '#replicad-wasm-single-loader.js';
import { installNativeUserBreak } from '#utils/native-user-break.js';

// The runtime's cooperative-abort error is internal; this stand-in is what the mocked `checkAbort`
// throws once another thread moves the abort word, as the runtime's does for a superseding frame.
class RenderAbortedError extends Error {
  public constructor() {
    super('Render aborted by a superseding document operation');
    this.name = 'RenderAbortedError';
  }
}

const { abortWord } = vi.hoisted(() => ({ abortWord: new Int32Array(new SharedArrayBuffer(4)) }));

vi.mock('@taucad/runtime/kernel', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeKernelModule>()),
  checkAbort(): void {
    if (Atomics.load(abortWord, 0) !== 0) {
      throw new RenderAbortedError();
    }
  },
}));

const singleWasmUrl = new URL(import.meta.resolve('replicad-opencascadejs/wasm')).href;

/** A cut of twelve crossing cylinders from a fused body: about 3 s single-threaded on a cloud machine. */
const longCut = (): { run: () => replicad.Shape3D; tools: number } => {
  const tools = 12;
  const base = replicad.makeCylinder(40, 20).fuse(replicad.makeSphere(30).translateZ(10));
  const cutters = Array.from({ length: tools }, (_, index) =>
    replicad
      .makeCylinder(4, 80, [0, 0, -30], [Math.cos(index), Math.sin(index), 1.5])
      .rotate((index * 360) / tools, [0, 0, 0], [0, 0, 1])
      .translateX(15),
  );
  return { run: () => base.cutAll(cutters), tools };
};

/**
 * Move the abort word from another thread `abortDelay` after `start` is called, and report when.
 *
 * @param abortDelay - Milliseconds between `start` and the store.
 * @returns `start`, and `storedAt`, the store's absolute time in ms.
 */
const startAborter = async (abortDelay: number): Promise<{ start: () => void; storedAt: () => Promise<number> }> => {
  const gate = new Int32Array(new SharedArrayBuffer(4));
  const stamp = new Float64Array(new SharedArrayBuffer(8));
  const worker = new Worker(
    `const { workerData, parentPort } = require('node:worker_threads');
     const { gate, word, stamp, abortDelay } = workerData;
     parentPort.postMessage('ready');
     Atomics.wait(gate, 0, 0);
     Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, abortDelay);
     Atomics.store(word, 0, 1);
     stamp[0] = performance.timeOrigin + performance.now();
     parentPort.postMessage('stored');`,
    { eval: true, workerData: { gate, word: abortWord, stamp, abortDelay } },
  );
  const messages: string[] = [];
  const waiters: Array<() => void> = [];
  worker.on('message', (message: string) => {
    messages.push(message);
    for (const wake of waiters.splice(0)) {
      wake();
    }
  });
  const waitFor = async (message: string): Promise<void> => {
    while (!messages.includes(message)) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the next worker message
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    }
  };
  await waitFor('ready');
  return {
    start(): void {
      Atomics.store(gate, 0, 1);
      Atomics.notify(gate, 0);
    },
    async storedAt(): Promise<number> {
      await waitFor('stored');
      await worker.terminate();
      return stamp[0]!;
    },
  };
};

/**
 * Run `call` while another thread aborts after `abortDelay`; return the error and the stop latency.
 *
 * @param call - The superseded work.
 * @param abortDelay - Milliseconds until the abort word moves.
 * @returns What `call` threw and how many milliseconds after the abort it stopped.
 */
const measureStop = async (call: () => unknown, abortDelay: number): Promise<{ error: unknown; latency: number }> => {
  const aborter = await startAborter(abortDelay);
  let stopError: unknown;
  aborter.start();
  try {
    call();
  } catch (error) {
    stopError = error;
  }
  const stoppedAt = performance.timeOrigin + performance.now();
  return { error: stopError, latency: stoppedAt - (await aborter.storedAt()) };
};

/**
 * Time `call`.
 *
 * @param call - The work to time.
 * @returns What `call` returned and its duration in milliseconds.
 */
const timed = <T>(call: () => T): { value: T; elapsed: number } => {
  const started = performance.now();
  const value = call();
  return { value, elapsed: performance.now() - started };
};

/**
 * The share of the work left at the abort that a stop may take. A stop latency is a fraction of the remaining
 * unwired work measured in the same run, not a fixed wall time: on a loaded machine both slow down together, while a
 * break that never fires runs the remainder to the end (a ratio near 1).
 */
const stopShare = 0.5;

afterEach(() => {
  Atomics.store(abortWord, 0, 0);
});

describe('native user break (N1)', { timeout: 120_000 }, () => {
  let oc: OpenCascadeInstance;
  let plainCutHash: string;
  // The unwired baselines: the same work through the plain entry points, timed in this run.
  /** Milliseconds. */
  let plainCut: number;
  /** Milliseconds. */
  let plainMesh: number;
  const shapeHash = (shape: replicad.Shape3D): string => oc.ReplicadBinaryBrep.IdentityHash(shape.wrapped);
  // About 167k triangles and 6 s unstopped: bounded, unlike a finer tolerance.
  const sphereMesh = (sphere: replicad.Solid) => (): unknown =>
    sphere.mesh({ tolerance: 0.003, angularTolerance: 0.1 });

  beforeAll(async () => {
    oc = await initOcct(singleWasmUrl, await loadReplicadSingleWasm());
    // The kernel's shape: the library sees the exception proxy over the realm's raw instance.
    replicad.setOC(wrapOcForExceptions(oc));
    const cut = timed(longCut().run);
    plainCutHash = shapeHash(cut.value);
    plainCut = cut.elapsed;
    plainMesh = timed(sphereMesh(replicad.makeSphere(50))).elapsed;
    installNativeUserBreak(oc);
  }, 120_000);

  it('stops a superseded batch cut long before the unwired cut would finish', async () => {
    const cut = longCut();
    const abortDelay = 300;
    const { error, latency } = await measureStop(cut.run, abortDelay);

    console.info(
      `N1 stop latency, ${cut.tools}-tool cutAll, single: ${latency.toFixed(1)} ms; unwired ${plainCut.toFixed(0)} ms`,
    );
    expect(error).toBeInstanceOf(RenderAbortedError);
    expect(latency).toBeLessThan(stopShare * (plainCut - abortDelay));
  });

  it('gives the same shape as the plain entry point when the abort word never moves', () => {
    expect(shapeHash(longCut().run())).toBe(plainCutHash);
  });

  it('stops a superseded mesh long before the unwired mesh would finish and throws the abort error the hook saw', async () => {
    const abortDelay = 200;
    const { error, latency } = await measureStop(sphereMesh(replicad.makeSphere(50)), abortDelay);

    console.info(`N1 stop latency, sphere mesh, single: ${latency.toFixed(1)} ms; unwired ${plainMesh.toFixed(0)} ms`);
    expect(error).toBeInstanceOf(RenderAbortedError);
    expect(latency).toBeLessThan(stopShare * (plainMesh - abortDelay));
  });
});

describe('native user break without a running abort', () => {
  /** A stand-in instance whose native calls run `behaviour` with the hook installed. */
  const fakeOc = (behaviour: { boolean?: () => { IsUserBreak(): boolean; delete(): void }; mesh?: () => unknown }) => {
    const host: Record<string, unknown> = {};
    // Each stand-in native call polls the hook once, as OCCT's progress scopes do, then answers.
    const pollThen =
      <T>(answer: () => T) =>
      (): T => {
        (host['replicadUserBreak'] as () => boolean)();
        return answer();
      };
    const booleanAnswer = pollThen(() => behaviour.boolean!());
    const meshAnswer = pollThen(() => behaviour.mesh!());
    const batch = {
      FuseWithOptions: vi.fn(booleanAnswer),
      CutWithOptions: vi.fn(booleanAnswer),
      CommonWithOptions: vi.fn(booleanAnswer),
    };
    const extractor = { meshWithOptions: vi.fn(meshAnswer), extractWithOptions: vi.fn(meshAnswer) };
    Object.assign(host, {
      ReplicadUserBreak: vi.fn(),
      ReplicadBooleanBatch: batch,
      ReplicadMeshExtractor: extractor,
    });
    installNativeUserBreak(host as unknown as OpenCascadeInstance);
    return host as unknown as OpenCascadeInstance & { replicadUserBreak: () => boolean };
  };
  const list = undefined as unknown as TopTools_ListOfShape;
  const shape = undefined as unknown as TopoDS_Shape;

  it('passes every argument through with OBB off and the clean default', () => {
    const result = { IsUserBreak: vi.fn(() => false), delete: vi.fn() };
    const oc = fakeOc({ boolean: () => result, mesh: () => 'mesh' });

    expect(oc.ReplicadBooleanBatch.Fuse(list, false, 1, true, 0.001, 0)).toBe(result);
    expect(oc.ReplicadBooleanBatch.Cut(list, list, false, 2, true, 0.001, 0)).toBe(result);
    expect(oc.ReplicadBooleanBatch.Common(list, false, 0, true, 0.001, 0)).toBe(result);
    expect(oc.ReplicadMeshExtractor.extract(shape, 0.1, 0.2, true)).toBe('mesh');
    oc.ReplicadMeshExtractor.mesh(shape, 0.1, 0.2);

    const userBreak = vi.mocked(oc.ReplicadUserBreak).mock.instances[0];
    expect(oc.ReplicadUserBreak).toHaveBeenCalledWith(0, 0, true);
    expect(oc.ReplicadBooleanBatch.FuseWithOptions).toHaveBeenCalledWith(
      list,
      false,
      1,
      true,
      0.001,
      0,
      false,
      userBreak,
    );
    expect(oc.ReplicadBooleanBatch.CutWithOptions).toHaveBeenCalledWith(
      list,
      list,
      false,
      2,
      true,
      0.001,
      0,
      false,
      userBreak,
    );
    expect(oc.ReplicadBooleanBatch.CommonWithOptions).toHaveBeenCalledWith(
      list,
      false,
      0,
      true,
      0.001,
      0,
      false,
      userBreak,
    );
    expect(oc.ReplicadMeshExtractor.meshWithOptions).toHaveBeenCalledWith(shape, 0.1, 0.2, true, userBreak);
    expect(oc.ReplicadMeshExtractor.extractWithOptions).toHaveBeenCalledWith(shape, 0.1, 0.2, true, true, userBreak);
    expect(result.delete).not.toHaveBeenCalled();
  });

  it('rethrows a native failure unchanged when nothing aborted', () => {
    const failure = new Error('BOPAlgo_AlertPostTreatFF');
    const oc = fakeOc({
      mesh: () => {
        throw failure;
      },
    });

    expect(() => oc.ReplicadMeshExtractor.extract(shape, 0.1, 0.2, false)).toThrow(failure);
  });

  it('returns a finished boolean when the break came too late to stop it', () => {
    const result = { IsUserBreak: vi.fn(() => false), delete: vi.fn() };
    const oc = fakeOc({
      boolean() {
        Atomics.store(abortWord, 0, 1);
        oc.replicadUserBreak();
        return result;
      },
    });

    expect(oc.ReplicadBooleanBatch.Cut(list, list, false, 0, true, 0.001, 0)).toBe(result);
    expect(result.delete).not.toHaveBeenCalled();
  });

  it('returns a finished mesh when the break came too late to stop it', () => {
    const oc = fakeOc({
      mesh() {
        Atomics.store(abortWord, 0, 1);
        oc.replicadUserBreak();
        return 'mesh';
      },
    });

    expect(oc.ReplicadMeshExtractor.extract(shape, 0.1, 0.2, false)).toBe('mesh');
  });

  it('frees a stopped boolean and throws the abort error, answering every later poll with a break', () => {
    const result = { IsUserBreak: vi.fn(() => true), delete: vi.fn() };
    const oc = fakeOc({
      boolean() {
        Atomics.store(abortWord, 0, 1);
        expect(oc.replicadUserBreak()).toBe(true);
        Atomics.store(abortWord, 0, 0);
        expect(oc.replicadUserBreak()).toBe(true);
        return result;
      },
    });

    expect(() => oc.ReplicadBooleanBatch.Fuse(list, false, 0, true, 0.001, 0)).toThrow(RenderAbortedError);
    expect(result.delete).toHaveBeenCalledOnce();
  });

  it('leaves a build without the native user break untouched', () => {
    const cut = vi.fn();
    const extract = vi.fn();
    const oc = {
      ReplicadBooleanBatch: { Cut: cut },
      ReplicadMeshExtractor: { extract },
    } as unknown as OpenCascadeInstance;

    installNativeUserBreak(oc);
    expect(oc.ReplicadBooleanBatch.Cut).toBe(cut);
    expect(oc.ReplicadMeshExtractor.extract).toBe(extract);
    expect('replicadUserBreak' in oc).toBe(false);
  });
});
