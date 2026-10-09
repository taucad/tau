import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import { createNativeGeoSpecRunner } from '#runner/native/native-serial-runner.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/index.js';

const owner = vi.hoisted(() => ({
  loader: vi.fn(),
  serial: vi.fn<(options: GeoSpecRunnerOptions) => GeoSpecRunner>(),
}));

vi.mock('#model/native-model-loader.js', () => ({ createGeoSpecNativeModelLoader: owner.loader }));
vi.mock('#runner/worker/serial-runner.js', () => ({ createSerialGeoSpecRunner: owner.serial }));

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const request = (subjects: ReadonlyArray<Record<string, unknown>>) =>
  new TextEncoder().encode(JSON.stringify({ method: 'submitClaims', plan: { subjects } }));

describe('native runner admission authority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should allow only this run’s admitted hashes across module calls and clear after release', async () => {
    const engine = mock<GeoSpecNativeModelEngine>();
    const result = {
      canonicalClaim: new Uint8Array(),
      canonicalPlan: new Uint8Array(),
      canonicalResult: new Uint8Array(),
    };
    engine.evaluateClaim.mockReturnValue(result);
    const load = vi.fn(async () => ({ subjectHash: hashA }));
    const releaseAll = vi.fn(async () => undefined);
    const loader = Object.assign(load, { releaseAll });
    owner.loader.mockReturnValue(loader);
    const close = vi.fn(async () => undefined);
    owner.serial.mockReturnValue(mock<GeoSpecRunner>({ close }));

    const runner = createNativeGeoSpecRunner({
      filesystem: mock<GeoSpecRunnerOptions['filesystem']>(),
      nativeAssertions: { engine },
    });
    const binding = owner.serial.mock.calls[0]?.[0];
    const scoped = binding?.nativeModelLoader;
    const assertions = binding?.nativeAssertions.engine;
    if (scoped === undefined || assertions === undefined) {
      throw new Error('Expected native runner bindings.');
    }
    expect(() => assertions.evaluateClaim(request([{ slot: 'a', subjectHash: hashA }]))).toThrow('not admitted');
    expect(() => assertions.evaluateClaim(request([{ slot: 'a', contentHash: hashB }]))).toThrow('not admitted');
    expect(engine.evaluateClaim).not.toHaveBeenCalled();

    await scoped({ source: new Uint8Array([1]), format: 'step' });
    expect(assertions.evaluateClaim(request([{ slot: 'a', subjectHash: hashA }]))).toBe(result);
    expect(assertions.evaluateClaim(request([{ slot: 'a', contentHash: hashA }]))).toBe(result);
    expect(() =>
      assertions.evaluateClaim(
        request([
          { slot: 'a', subjectHash: hashA },
          { slot: 'b', subjectHash: hashB },
        ]),
      ),
    ).toThrow('not admitted');
    expect(engine.evaluateClaim).toHaveBeenCalledTimes(2);
    await scoped.releaseAll();
    expect(releaseAll).toHaveBeenCalledOnce();
    expect(() => assertions.evaluateClaim(request([{ slot: 'a', subjectHash: hashA }]))).toThrow('not admitted');
    await runner.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('should fence direct submitClaims and clear a supplied loader on close', async () => {
    const engine = mock<GeoSpecNativeModelEngine>();
    const loader = Object.assign(
      vi.fn(async () => ({ subjectHash: hashA })),
      { releaseAll: vi.fn(async () => undefined) },
    );
    owner.serial.mockReturnValue(mock<GeoSpecRunner>({ close: vi.fn(async () => undefined) }));
    const runner = createNativeGeoSpecRunner({
      filesystem: mock<GeoSpecRunnerOptions['filesystem']>(),
      nativeAssertions: { engine },
      nativeModelLoader: loader,
    });
    const binding = owner.serial.mock.calls[0]?.[0];
    const scoped = binding?.nativeModelLoader;
    const assertions = binding?.nativeAssertions.engine;
    if (scoped === undefined || assertions === undefined) {
      throw new Error('Expected native runner bindings.');
    }
    expect(() => assertions.processRequest(request([{ slot: 'a', subjectHash: hashB }]))).toThrow('not admitted');
    expect(engine.processRequest).not.toHaveBeenCalled();
    await scoped({ source: new Uint8Array([1]), format: 'step' });
    assertions.processRequest(request([{ slot: 'a', subjectHash: hashA }]));
    expect(engine.processRequest).toHaveBeenCalledOnce();
    await runner.close();
    expect(() => assertions.evaluateClaim(request([{ slot: 'a', subjectHash: hashA }]))).toThrow('not admitted');
  });
});
