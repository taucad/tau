import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  factory: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('geospec/native/opencascade/single', () => ({
  default: mocks.factory,
}));

// The singleton memo is module state: re-import a fresh copy per test so each
// case starts unmemoized.
type OpenCascadeModuleExports = {
  ensureOpenCascadeModule: () => Promise<unknown>;
};

const importModule = async (): Promise<OpenCascadeModuleExports> => import('#native/opencascade-module.js');

describe('shared OpenCascade module singleton', () => {
  const savedFlag = process.env['GEOSPEC_NATIVE_SINGLETON'];

  beforeEach(() => {
    vi.resetModules();
    mocks.factory.mockReset();
    mocks.factory.mockImplementation(async () => ({ marker: Math.random() }));
  });

  afterEach(() => {
    if (savedFlag === undefined) {
      delete process.env['GEOSPEC_NATIVE_SINGLETON'];
    } else {
      process.env['GEOSPEC_NATIVE_SINGLETON'] = savedFlag;
    }
  });

  it('should compile the native module once and return the same instance across calls', async () => {
    const { ensureOpenCascadeModule } = await importModule();

    const first = await ensureOpenCascadeModule();
    const second = await ensureOpenCascadeModule();

    expect(second).toBe(first);
    expect(mocks.factory).toHaveBeenCalledTimes(1);
  });

  it('should construct a fresh module per call when GEOSPEC_NATIVE_SINGLETON=0', async () => {
    process.env['GEOSPEC_NATIVE_SINGLETON'] = '0';
    const { ensureOpenCascadeModule } = await importModule();

    const first = await ensureOpenCascadeModule();
    const second = await ensureOpenCascadeModule();

    expect(second).not.toBe(first);
    expect(mocks.factory).toHaveBeenCalledTimes(2);
  });

  it('should keep disabled-mode constructions out of the singleton memo', async () => {
    const { ensureOpenCascadeModule } = await importModule();

    process.env['GEOSPEC_NATIVE_SINGLETON'] = '0';
    const disabled = await ensureOpenCascadeModule();
    delete process.env['GEOSPEC_NATIVE_SINGLETON'];
    const first = await ensureOpenCascadeModule();
    const second = await ensureOpenCascadeModule();

    expect(first).not.toBe(disabled);
    expect(second).toBe(first);
    expect(mocks.factory).toHaveBeenCalledTimes(2);
  });

  it('should memoize an unavailable native bundle as a stable rejection', async () => {
    const failure = new Error('native bundle unavailable');
    mocks.factory.mockImplementation(async () => {
      throw failure;
    });
    const { ensureOpenCascadeModule } = await importModule();

    await expect(ensureOpenCascadeModule()).rejects.toBe(failure);
    await expect(ensureOpenCascadeModule()).rejects.toBe(failure);

    expect(mocks.factory).toHaveBeenCalledTimes(1);
  });
});
