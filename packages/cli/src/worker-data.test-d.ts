import { describe, expectTypeOf, it } from 'vitest';
import type { HostRuntimeClient } from '@taucad/host/agent-tools';
import type { RuntimeClient } from '@taucad/runtime';
import type { ProjectRuntimeClient } from '#commands/mcp.js';
import type { ComputeStoreWorkerData } from '#compute-store.worker.js';
import type { RuntimeWorkerData } from '#runtime.worker.js';

describe('tau mcp project client', () => {
  it('should hand the host tools the dynamic CLI runtime client each worker serves', () => {
    /* The dynamic definition, `RuntimeClient`'s default: the thread composes `--plugin` and `--config` at run time. */
    expectTypeOf<ProjectRuntimeClient>().toEqualTypeOf<RuntimeClient>();
    expectTypeOf<ProjectRuntimeClient>().toExtend<HostRuntimeClient>();
  });
});

describe('worker entry data', () => {
  it('should type what a client hands the runtime worker', () => {
    expectTypeOf({
      projectRoot: '/project',
      plugin: ['./plugin.ts'],
      zooProxyUrl: 'ws://localhost',
    }).toExtend<RuntimeWorkerData>();
    expectTypeOf({ projectRoot: '/project', zooProxyUrl: 5 }).not.toExtend<RuntimeWorkerData>();
    expectTypeOf({ plugin: [] }).not.toExtend<RuntimeWorkerData>();
  });

  it('should type what serve hands the compute store worker', () => {
    expectTypeOf({ directory: '/compute' }).toExtend<ComputeStoreWorkerData>();
    expectTypeOf({ directory: 5 }).not.toExtend<ComputeStoreWorkerData>();
  });
});
