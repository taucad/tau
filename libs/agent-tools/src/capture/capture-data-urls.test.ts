import { describe, expect, it } from 'vitest';
import { captureFilesToDataUrls } from '#capture/capture-data-urls.js';

const base64Prefix = 'data:image/webp;base64,';

describe('captureFilesToDataUrls', () => {
  it('encodes every file in view order', () => {
    expect(
      captureFilesToDataUrls([
        { mimeType: 'image/webp', bytes: new Uint8Array([0, 1, 2]) },
        { mimeType: 'image/png', bytes: new Uint8Array([255]) },
      ]),
    ).toStrictEqual(['data:image/webp;base64,AAEC', 'data:image/png;base64,/w==']);
  });

  it('round-trips a capture-sized image without spreading it onto the stack', () => {
    // One lossless 1600² webp view is megabytes; the encoder this replaced
    // spread 65 535 code points per chunk and overflowed anything but a shallow
    // main-thread stack. The chunk boundary must also not corrupt the output.
    const bytes = new Uint8Array(1_500_000);
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = index % 256;
    }
    const [dataUrl] = captureFilesToDataUrls([{ mimeType: 'image/webp', bytes }]);

    expect(dataUrl?.startsWith(base64Prefix)).toBe(true);
    expect(new Uint8Array(Buffer.from(dataUrl!.slice(base64Prefix.length), 'base64'))).toStrictEqual(bytes);
  });
});
