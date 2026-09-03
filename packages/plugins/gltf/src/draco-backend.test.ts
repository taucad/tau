import { beforeEach, describe, expect, it, vi } from 'vitest';

const codec = vi.hoisted(() => ({
  decoder: { kind: 'decoder' },
  encoder: { kind: 'encoder' },
  createDecoderModule: vi.fn(),
  createEncoderModule: vi.fn(),
  loadWasmBinary: vi.fn(),
}));

vi.mock('@taucad/runtime/transcoder', () => ({ loadWasmBinary: codec.loadWasmBinary }));
vi.mock('draco3dgltf', () => ({
  default: {
    createDecoderModule: codec.createDecoderModule,
    createEncoderModule: codec.createEncoderModule,
  },
}));

describe('Draco backend', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    codec.loadWasmBinary.mockImplementation(
      async (url: string) => Uint8Array.from(url.includes('decoder') ? [1] : [2]).buffer,
    );
    codec.createDecoderModule.mockResolvedValue(codec.decoder);
    codec.createEncoderModule.mockResolvedValue(codec.encoder);
  });

  it('detects the standard extension in used or required declarations', async () => {
    const { dracoExtensionName, usesDracoCompression } = await import('#draco-backend.js');

    expect(usesDracoCompression({ asset: { version: '2.0' } })).toBe(false);
    expect(usesDracoCompression({ asset: { version: '2.0' }, extensionsUsed: [dracoExtensionName] })).toBe(true);
    expect(usesDracoCompression({ asset: { version: '2.0' }, extensionsRequired: [dracoExtensionName] })).toBe(true);
  });

  it('loads decoder and encoder independently and caches each module', async () => {
    const { loadDracoDecoder, loadDracoEncoder } = await import('#draco-backend.js');

    await expect(loadDracoDecoder()).resolves.toBe(codec.decoder);
    await expect(loadDracoDecoder()).resolves.toBe(codec.decoder);
    expect(codec.createDecoderModule).toHaveBeenCalledOnce();
    expect(codec.createEncoderModule).not.toHaveBeenCalled();

    await expect(loadDracoEncoder()).resolves.toBe(codec.encoder);
    await expect(loadDracoEncoder()).resolves.toBe(codec.encoder);
    expect(codec.createEncoderModule).toHaveBeenCalledOnce();
    expect(codec.loadWasmBinary).toHaveBeenCalledTimes(2);
    expect(codec.createDecoderModule).toHaveBeenCalledWith({ wasmBinary: Uint8Array.from([1]).buffer });
    expect(codec.createEncoderModule).toHaveBeenCalledWith({ wasmBinary: Uint8Array.from([2]).buffer });
  });

  it.each([
    ['decoder', 'loadDracoDecoder', 'createDecoderModule'],
    ['encoder', 'loadDracoEncoder', 'createEncoderModule'],
  ] as const)('retries the %s after a failed initialization', async (name, loaderName, factoryName) => {
    codec[factoryName].mockRejectedValueOnce(new Error('initialization failed'));
    const backend = await import('#draco-backend.js');

    await expect(backend[loaderName]()).rejects.toThrow('initialization failed');
    await expect(backend[loaderName]()).resolves.toBe(codec[name]);
    expect(codec[factoryName]).toHaveBeenCalledTimes(2);
  });
});
