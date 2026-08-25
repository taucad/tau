// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { initOcct } from '@taucad/occt-core';
import { loadReplicadMultiWasm } from '#replicad-wasm-multi-loader.js';
import { loadReplicadSingleWasm } from '#replicad-wasm-single-loader.js';

type RuntimeInfoMethod = 'IsMultiThreaded' | 'ThreadCount' | 'ConfigureThreadPool';

type ReplicadRuntimeInfoProbe = {
  ReplicadRuntimeInfo: Record<RuntimeInfoMethod, () => boolean | number>;
};

const bindRuntimeInfo = (runtimeInfo: ReplicadRuntimeInfoProbe['ReplicadRuntimeInfo']) => ({
  configureThreadPool: runtimeInfo.ConfigureThreadPool.bind(runtimeInfo) as () => number,
  isMultiThreaded: runtimeInfo.IsMultiThreaded.bind(runtimeInfo) as () => boolean,
  threadCount: runtimeInfo.ThreadCount.bind(runtimeInfo) as () => number,
});

const singleWasmUrl = new URL(import.meta.resolve('replicad-opencascadejs/wasm')).href;
const multiWasmUrl = new URL(import.meta.resolve('replicad-opencascadejs/multi/wasm')).href;

const initSingle = async (): Promise<ReplicadRuntimeInfoProbe> =>
  initOcct(singleWasmUrl, await loadReplicadSingleWasm()) as Promise<ReplicadRuntimeInfoProbe>;

const initMulti = async (): Promise<ReplicadRuntimeInfoProbe> =>
  initOcct(multiWasmUrl, await loadReplicadMultiWasm()) as Promise<ReplicadRuntimeInfoProbe>;

describe('ReplicadRuntimeInfo bindings', { timeout: 60_000 }, () => {
  it('report serial execution for the single-threaded Replicad build', async () => {
    const oc = await initSingle();
    const runtimeInfo = bindRuntimeInfo(oc.ReplicadRuntimeInfo);

    expect(runtimeInfo.isMultiThreaded()).toBe(false);
    expect(runtimeInfo.threadCount()).toBe(1);
    expect(runtimeInfo.configureThreadPool()).toBe(1);
  });

  it.skipIf(typeof SharedArrayBuffer === 'undefined')(
    'report pthread execution and configure the pool for the multi-threaded Replicad build',
    async () => {
      const oc = await initMulti();
      const runtimeInfo = bindRuntimeInfo(oc.ReplicadRuntimeInfo);

      expect(runtimeInfo.isMultiThreaded()).toBe(true);
      expect(runtimeInfo.threadCount()).toBeGreaterThan(1);
      expect(runtimeInfo.configureThreadPool()).toBeGreaterThan(1);
    },
  );
});
