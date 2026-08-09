import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import type { GeometrySubject } from '#mesh/types.js';
import { ensureOpenCascadeModule } from '#native/opencascade-module.js';
import { loadStep } from '#step/index.js';
import type { GeoSpecNativeStepBackend } from '#step/types.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

/**
 * Real backend wrapped so every AP242 read is counted. `Object.create` keeps
 * the module itself on the prototype chain, so live heap views (`HEAPF64`) and
 * the `GeoSpecXdeReadResult` class are read through to the genuine module —
 * only `GeoSpecXdeReader` is shadowed. Counting reads on the REAL reader is the
 * point: a fake backend cannot prove that the OCCT parse was skipped.
 */
type CountingBackend = { backend: GeoSpecNativeStepBackend; reads: () => number; resetReads: () => void };

const createCountingBackend = (module: GeoSpecNativeStepBackend): CountingBackend => {
  const reader = module.GeoSpecXdeReader;
  if (!reader) {
    throw new Error('the OpenCascade module must expose GeoSpecXdeReader.');
  }
  let reads = 0;
  const backend: GeoSpecNativeStepBackend = Object.create(module) as GeoSpecNativeStepBackend;
  backend.GeoSpecXdeReader = {
    readText: (data: string, optionsJson: string) => {
      reads += 1;
      return reader.readText(data, optionsJson);
    },
  };
  return {
    backend,
    reads: () => reads,
    resetReads: () => {
      reads = 0;
    },
  };
};

describe('lazy native subject (R8)', () => {
  let counting: CountingBackend;
  const subjects: GeometrySubject[] = [];

  const load = async (options: { mesh?: boolean } = {}): Promise<GeometrySubject> => {
    const subject = await loadStep({
      source: fixturePath,
      name: 'two-cube-assembly.step',
      mesh: options.mesh ?? false,
      nativeStepBackend: counting.backend,
    });
    subjects.push(subject);
    return subject;
  };

  /** Seed every family a warm load replays from, then hand back a warm subject. */
  const seedThenLoadWarm = async (): Promise<GeometrySubject> => {
    const cold = await load();
    // Force the facet the warm assertion replays — an unseeded family would
    // make "zero reads" vacuous by simply never being demanded.
    expect(cold.brep?.topologyCounts).toBeDefined();
    counting.resetReads();
    return load();
  };

  beforeAll(async () => {
    counting = createCountingBackend((await ensureOpenCascadeModule()) as GeoSpecNativeStepBackend);
  }, 120_000);

  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
    for (const subject of subjects.splice(0)) {
      subject.nativeXde?.delete?.();
    }
  });

  it('should parse exactly once on a cold load and never again on a warm one', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());

    await load();
    expect(counting.reads()).toBe(1);

    counting.resetReads();
    await load();

    // The R8 gate: a subject whose structure is already persisted never runs
    // the 13 MB OCCT reader.
    expect(counting.reads()).toBe(0);
  });

  it('should persist the XDE structure and replay it identically without parsing', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());

    const cold = await load();
    counting.resetReads();
    const warm = await load();

    expect(warm.step?.xde).toEqual(cold.step?.xde);
    expect(warm.step?.readStrategy).toEqual(cold.step?.readStrategy);
    expect(counting.reads()).toBe(0);
  });

  it('should replay a persisted BRep facet without a liveness probe forcing a parse', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const seeded = await load();
    const coldCounts = seeded.brep?.topologyCounts;
    counting.resetReads();

    const warm = await load();

    // The ledger probes `isDeleted()` before every facet read; answering that
    // by materializing would defeat R8 entirely.
    expect(warm.brep?.topologyCounts).toEqual(coldCounts);
    expect(counting.reads()).toBe(0);
  });

  it('should expose the same optional-facet capabilities warm as cold, without parsing', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = await load();
    const coldCapabilities = {
      occurrenceMesh: cold.occurrenceMesh !== undefined,
      occurrenceFaceMesh: cold.occurrenceFaceMesh !== undefined,
    };
    counting.resetReads();

    const warm = await load();

    expect({
      occurrenceMesh: warm.occurrenceMesh !== undefined,
      occurrenceFaceMesh: warm.occurrenceFaceMesh !== undefined,
    }).toEqual(coldCapabilities);
    expect(coldCapabilities).toEqual({ occurrenceMesh: true, occurrenceFaceMesh: true });
    expect(counting.reads()).toBe(0);
  });

  it('should materialize once on the first genuine native touch of a warm subject', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const warm = await seedThenLoadWarm();
    expect(counting.reads()).toBe(0);

    const first = warm.nativeXde?.extrema(0, -1, 1, -1);

    // Deferral, not omission: a proof that needs live geometry still gets it,
    // and the handle is memoized for every later crossing.
    expect(counting.reads()).toBe(1);
    const second = warm.nativeXde?.extrema(0, -1, 1, -1);
    expect(counting.reads()).toBe(1);
    expect(second).toEqual(first);
  });

  it('should never parse when a warm subject is disposed before any native touch', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const warm = await seedThenLoadWarm();

    warm.nativeXde?.delete?.();

    expect(counting.reads()).toBe(0);
    expect(warm.nativeXde?.isDeleted?.()).toBe(true);
  });

  it('should report the disposed handle instead of parsing when a facet is demanded after disposal', async () => {
    setGeoSpecEvidenceStore(undefined);
    const subject = await load();
    counting.resetReads();

    subject.nativeXde?.delete?.();

    // No evidence store here, so the facet has nowhere to replay from: the
    // disposed handle must surface as the standard facet diagnostic (blueprint
    // A12) rather than a silent re-parse of freed geometry.
    expect(subject.brep?.topologyCounts).toBeUndefined();
    expect(counting.reads()).toBe(0);
  });

  it('should force the parse at load time for a mesh:true subject', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    await load({ mesh: true });
    counting.resetReads();

    const warm = await load({ mesh: true });

    // The root triangle soup is not persisted evidence, so a meshed subject
    // genuinely needs the reader at load — R8's win is scoped to the
    // `mesh: false` BRep loads the corpus uses.
    expect(warm.mesh.stats.triangleCount).toBeGreaterThan(0);
    expect(counting.reads()).toBe(1);
  });
});
