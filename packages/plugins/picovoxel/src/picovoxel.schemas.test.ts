import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as IsolationModule from '@taucad/runtime/cross-origin-isolation';
import type { IsolationStatus } from '@taucad/runtime/cross-origin-isolation';

import {
  multiUnavailableReason,
  picovoxelExportSchemas,
  picovoxelOptionsSchema,
  picovoxelRenderSchema,
} from '#picovoxel.schemas.js';

const isolation = vi.hoisted(() => ({ status: undefined as IsolationStatus | undefined }));

vi.mock('@taucad/runtime/cross-origin-isolation', async (importOriginal) => {
  const actual = await importOriginal<typeof IsolationModule>();
  return { ...actual, getIsolationStatus: () => isolation.status ?? actual.getIsolationStatus() };
});

beforeEach(() => {
  isolation.status = undefined;
});

describe('picovoxelOptionsSchema', () => {
  it('should resolve auto to the multi-threaded build in an isolated realm', () => {
    isolation.status = { crossOriginIsolated: true, sharedArrayBuffer: true };

    expect(picovoxelOptionsSchema.parse({})).toEqual({ wasm: 'multi' });
    expect(picovoxelOptionsSchema.parse({ wasm: 'auto' })).toEqual({ wasm: 'multi' });
  });

  it('should resolve auto to the serial build in a realm that is not isolated', () => {
    isolation.status = { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-coep' };

    expect(picovoxelOptionsSchema.parse({})).toEqual({ wasm: 'serial' });
  });

  it('should keep a pinned artifact whatever the realm, so validated options never hold auto', () => {
    isolation.status = { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-coep' };

    expect(picovoxelOptionsSchema.parse({ wasm: 'multi' })).toEqual({ wasm: 'multi' });
    expect(picovoxelOptionsSchema.parse({ wasm: 'serial' })).toEqual({ wasm: 'serial' });
  });

  it('should serve serial with the reason when the multi build cannot reserve its shared memory', async () => {
    isolation.status = { crossOriginIsolated: true, sharedArrayBuffer: true };
    vi.resetModules();
    const memory = vi.spyOn(WebAssembly, 'Memory').mockImplementation(function () {
      throw new RangeError('could not allocate memory');
    });
    try {
      const schemas = await import('#picovoxel.schemas.js');

      expect(schemas.picovoxelOptionsSchema.parse({})).toEqual({ wasm: 'serial' });
      expect(schemas.multiUnavailableReason()).toBe('shared-memory-reservation-failed: could not allocate memory');
      // Probed once per realm.
      expect(memory).toHaveBeenCalledTimes(1);
      expect(memory).toHaveBeenCalledWith({ initial: 4096, maximum: 65_536, shared: true });
    } finally {
      memory.mockRestore();
    }
  });

  it('should report a non-Error reservation failure', async () => {
    isolation.status = { crossOriginIsolated: true, sharedArrayBuffer: true };
    vi.resetModules();
    const memory = vi.spyOn(WebAssembly, 'Memory').mockImplementation(function () {
      // oxlint-disable-next-line typescript/only-throw-error -- engines have thrown non-Errors here.
      throw 'out of address space';
    });
    try {
      const schemas = await import('#picovoxel.schemas.js');

      expect(schemas.multiUnavailableReason()).toBe('shared-memory-reservation-failed: out of address space');
    } finally {
      memory.mockRestore();
    }
  });

  it('should report no reason where the multi build can run', () => {
    isolation.status = { crossOriginIsolated: true, sharedArrayBuffer: true };

    expect(multiUnavailableReason()).toBeUndefined();
  });

  it('should refuse an unknown artifact', () => {
    expect(picovoxelOptionsSchema.safeParse({ wasm: 'gpu' }).success).toBe(false);
  });
});

describe('lane schemas', () => {
  it('should render in the fast lane by default', () => {
    expect(picovoxelRenderSchema.parse({})).toEqual({ lane: 'fast' });
  });

  it('should export exact by default in every native format', () => {
    expect(picovoxelExportSchemas.glb.parse({})).toMatchObject({ lane: 'exact' });
    expect(picovoxelExportSchemas.stl.parse({})).toEqual({ lane: 'exact', unit: 'mm', scale: 1, offset: [0, 0, 0] });
  });

  it('should accept no lane Tau does not expose', () => {
    for (const lane of ['open', 'auto']) {
      expect(picovoxelRenderSchema.safeParse({ lane }).success).toBe(false);
      expect(picovoxelExportSchemas.stl.safeParse({ lane }).success).toBe(false);
    }
  });

  it('should carry no fastRenorm, serialLattice or acceptLane knob', () => {
    const keys = [
      ...Object.keys(picovoxelRenderSchema.shape),
      ...Object.keys(picovoxelExportSchemas.glb.shape),
      ...Object.keys(picovoxelExportSchemas.stl.shape),
    ];

    expect(keys.filter((key) => ['fastRenorm', 'serialLattice', 'acceptLane'].includes(key))).toEqual([]);
  });
});
