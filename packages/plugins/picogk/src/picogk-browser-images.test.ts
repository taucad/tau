import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { validatePicogkBrowserImage } from '#picogk-browser-images.js';

const chunk = (name: string, bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(8 + bytes.length + (bytes.length % 2));
  output.set(new TextEncoder().encode(name));
  new DataView(output.buffer).setUint32(4, bytes.length, true);
  output.set(bytes, 8);
  return output;
};
const webp = (...chunks: Array<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const size = chunks.reduce((sum, bytes) => sum + bytes.length, 0);
  const output = new Uint8Array(12 + size);
  output.set(new TextEncoder().encode('RIFF'));
  new DataView(output.buffer).setUint32(4, size + 4, true);
  output.set(new TextEncoder().encode('WEBP'), 8);
  let offset = 12;
  for (const bytes of chunks) {
    output.set(bytes, offset);
    offset += bytes.length;
  }
  return output;
};
const raster = chunk('VP8L', new Uint8Array([47, 0, 0, 0, 0]));
const extended = chunk('VP8X', new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
const animationFrame = chunk('ANMF', new Uint8Array([...new Uint8Array(16), ...raster]));
const png = new Uint8Array(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64'),
);

const decoder = (count = 1) => {
  const image = mock<VideoFrame>({ displayWidth: 2, displayHeight: 2 });
  const instance = mock<ImageDecoder>({
    tracks: mock<ImageTrackList>({ selectedTrack: mock<ImageTrack>({ frameCount: count }) }),
  });
  Object.defineProperty(instance.tracks, 'ready', { value: Promise.resolve() });
  Object.defineProperty(instance, 'completed', { value: Promise.resolve() });
  instance.decode.mockResolvedValue({ image, complete: true });
  vi.stubGlobal(
    'ImageDecoder',
    vi.fn(function () {
      return instance;
    }),
  );
  return { instance, image };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PicoGK browser image admission', () => {
  it.each([
    ['image/png', png],
    ['image/jpeg', new Uint8Array([255, 216, 255, 217])],
    ['image/webp', webp(raster)],
  ] as const)('should decode and release %s', async (mimeType, bytes) => {
    const { instance, image } = decoder();
    await validatePicogkBrowserImage({ bytes, mimeType });
    expect(instance.decode).toHaveBeenCalledExactlyOnceWith({ frameIndex: 0, completeFramesOnly: true });
    expect(image.close).toHaveBeenCalledOnce();
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it('should validate and release every animation frame', async () => {
    const { instance, image } = decoder(2);
    await validatePicogkBrowserImage({ bytes: webp(extended, animationFrame, animationFrame), mimeType: 'image/webp' });
    expect(instance.decode).toHaveBeenNthCalledWith(2, { frameIndex: 1, completeFramesOnly: true });
    expect(image.close).toHaveBeenCalledTimes(2);
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it('should fail explicitly when the decoder API is unavailable', async () => {
    vi.stubGlobal('ImageDecoder', undefined);
    await expect(validatePicogkBrowserImage({ bytes: webp(raster), mimeType: 'image/webp' })).rejects.toThrow(
      'ImageDecoder API',
    );
  });

  it.each([0, 2])('should reject an invalid reported frame count %i', async (count) => {
    const { instance } = decoder(count);
    await expect(validatePicogkBrowserImage({ bytes: webp(raster), mimeType: 'image/webp' })).rejects.toThrow();
    expect(instance.close).toHaveBeenCalledOnce();
    expect(instance.decode).not.toHaveBeenCalled();
  });

  it('should release the decoder when metadata or raster decoding fails', async () => {
    const { instance } = decoder();
    instance.decode.mockRejectedValue(new Error('Bad raster'));
    await expect(validatePicogkBrowserImage({ bytes: webp(raster), mimeType: 'image/webp' })).rejects.toThrow(
      'Bad raster',
    );
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it.each([
    { displayWidth: 0, displayHeight: 2, complete: true },
    { displayWidth: 100_000, displayHeight: 100_000, complete: true },
    { displayWidth: 2, displayHeight: 2, complete: false },
  ])('should release a rejected decoded frame %j', async ({ displayWidth, displayHeight, complete }) => {
    const { instance } = decoder();
    const image = mock<VideoFrame>({ displayWidth, displayHeight });
    instance.decode.mockResolvedValue({ image, complete });
    await expect(validatePicogkBrowserImage({ bytes: webp(raster), mimeType: 'image/webp' })).rejects.toThrow();
    expect(image.close).toHaveBeenCalledOnce();
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['image/gif', new Uint8Array()],
    ['image/jpeg', new Uint8Array([255, 216])],
    ['image/webp', new Uint8Array()],
    ['image/webp', webp(extended)],
    ['image/webp', webp(raster, new Uint8Array(3))],
    ['image/webp', webp(chunk('VP8L', new Uint8Array(1)).slice(0, 9))],
    ['image/webp', webp(new Uint8Array([...raster.slice(0, -1), 1]))],
    ['image/webp', webp(animationFrame)],
    ['image/webp', webp(chunk('VP8X', new Uint8Array(1)))],
    ['image/webp', webp(chunk('VP8L', new Uint8Array()))],
    ['image/webp', webp(raster, raster)],
    ['image/webp', webp(extended, chunk('ANMF', new Uint8Array(24)))],
    [
      'image/webp',
      webp(extended, chunk('ANMF', new Uint8Array([...new Uint8Array(16), ...chunk('ALPH', new Uint8Array(1))]))),
    ],
  ] as const)('should reject malformed %s containers before decoding', async (mimeType, bytes) => {
    const { instance } = decoder();
    await expect(validatePicogkBrowserImage({ bytes, mimeType })).rejects.toThrow();
    expect(instance.decode).not.toHaveBeenCalled();
  });
});
