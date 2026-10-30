import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mimeTypes } from '@taucad/types/constants';
import { transcodeGlbToUsdz, UsdzTranscodeError } from '#components/cad/ar-usdz-transcode.js';

const mocks = vi.hoisted(() => ({
  client: {
    connect: vi.fn(async () => undefined),
    transcode: vi.fn(),
    terminate: vi.fn(),
  },
  createRuntimeClient: vi.fn(),
  webWorkerTransport: vi.fn((options: unknown) => ({ options })),
  stopObserving: vi.fn(),
  observeRuntimeClient: vi.fn(),
}));

vi.mock('@taucad/runtime/client', () => ({ createRuntimeClient: mocks.createRuntimeClient }));
vi.mock('@taucad/runtime/transport/web', () => ({ webWorkerTransport: mocks.webWorkerTransport }));
vi.mock('#telemetry/runtime-telemetry.js', () => ({ observeRuntimeClient: mocks.observeRuntimeClient }));

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
const usdz = new Uint8Array([0x50, 0x4b, 3, 4]);

beforeEach(() => {
  mocks.client.connect.mockClear();
  mocks.client.terminate.mockClear();
  mocks.client.transcode.mockReset().mockResolvedValue({
    success: true,
    data: [{ name: 'model.usdz', mimeType: mimeTypes.usdz, bytes: usdz }],
    issues: [],
  });
  mocks.createRuntimeClient.mockReset().mockReturnValue(mocks.client);
  mocks.stopObserving.mockClear();
  mocks.observeRuntimeClient.mockReset().mockReturnValue(mocks.stopObserving);
});

describe('transcodeGlbToUsdz', () => {
  it('converts the given GLB bytes to USDZ in its own worker, then terminates it', async () => {
    await expect(transcodeGlbToUsdz(glb)).resolves.toBe(usdz);

    expect(mocks.observeRuntimeClient).toHaveBeenCalledWith(mocks.client, 'quicklook');
    expect(mocks.client.connect).toHaveBeenCalledOnce();
    expect(mocks.client.transcode).toHaveBeenCalledExactlyOnceWith({
      from: 'glb',
      to: 'usdz',
      files: [{ name: 'model.glb', bytes: glb, mimeType: 'model/gltf-binary' }],
      options: {},
    });
    expect(mocks.client.terminate).toHaveBeenCalledOnce();
    expect(mocks.stopObserving).toHaveBeenCalledOnce();
  });

  it('names a failed conversion with its first issue and still terminates the worker', async () => {
    mocks.client.transcode.mockResolvedValueOnce({ success: false, issues: [{ message: 'Assimp cannot write USDZ' }] });

    await expect(transcodeGlbToUsdz(glb)).rejects.toEqual(new UsdzTranscodeError('Assimp cannot write USDZ'));
    expect(mocks.client.terminate).toHaveBeenCalledOnce();
  });

  it('refuses a result that is not exactly one USDZ file', async () => {
    mocks.client.transcode.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: glb }],
      issues: [],
    });

    const conversion = transcodeGlbToUsdz(glb);
    await expect(conversion).rejects.toBeInstanceOf(UsdzTranscodeError);
    await expect(conversion).rejects.toThrow(/expected exactly one \.usdz file/);
    expect(mocks.client.terminate).toHaveBeenCalledOnce();
  });

  it('terminates the worker when it fails to start', async () => {
    mocks.client.connect.mockRejectedValueOnce(new Error('Worker failed to load'));

    await expect(transcodeGlbToUsdz(glb)).rejects.toThrow('Worker failed to load');
    expect(mocks.client.transcode).not.toHaveBeenCalled();
    expect(mocks.client.terminate).toHaveBeenCalledOnce();
    expect(mocks.stopObserving).toHaveBeenCalledOnce();
  });
});
