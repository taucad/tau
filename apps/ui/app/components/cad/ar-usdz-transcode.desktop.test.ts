import { describe, expect, it } from 'vitest';
import { transcodeGlbToUsdz, UsdzTranscodeError } from '#components/cad/ar-usdz-transcode.desktop.js';

describe('desktop AR conversion', () => {
  it('should reject an unsupported conversion with the AR error contract', async () => {
    const conversion = transcodeGlbToUsdz(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

    await expect(conversion).rejects.toBeInstanceOf(UsdzTranscodeError);
    await expect(conversion).rejects.toThrow('AR Quick Look conversion is unavailable in the desktop app.');
  });
});
