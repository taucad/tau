// @vitest-environment node
/*
 * HEIC in the composer (blueprint WP7). The attachment runtime registers `@taucad/heif`, so the picker offers HEIC
 * everywhere except iOS WebKit and the storage policy converts it. A host without the plugin derives no HEIC source:
 * its picker has no HEIC and the policy refuses a HEIC by name, telling the person to export it as JPEG.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { normalizeImageAttachment } from '@taucad/agent-host/wire';
import { deriveTranscodeSources } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { attachmentTranscodeSources } from '#runtime/attachment-transcode-sources.js';
import { attachmentAccept } from '#utils/attachment-accept.js';
import { attachmentRefusalCopy } from '#utils/attachment-refusal.js';

const heic = new Uint8Array(
  readFileSync(new URL('../../../../packages/plugins/heif/src/fixtures/small.heic', import.meta.url)),
);

describe('HEIC attachment sources', () => {
  it('should derive HEIC and HEIF from the attachment runtime, after every raster format', () => {
    expect(attachmentTranscodeSources).toEqual(['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff', 'heic', 'heif']);
  });

  it('should offer HEIC in the picker, except on iOS WebKit', () => {
    const accept = (isIos: boolean) =>
      attachmentAccept({ images: true, documents: true, transcodeSources: attachmentTranscodeSources, isIos });

    expect(accept(false)).toContain('image/heic,.heic,.heif');
    expect(accept(true)).not.toContain('heic');
    expect(accept(true)).not.toContain('heif');
  });

  it('should hand a HEIC to the conversion port as heic → jpeg', async () => {
    const transcode = vi.fn(async () => {
      throw new Error('not converted in this test');
    });

    await normalizeImageAttachment({ bytes: heic, transcode, transcodeSources: attachmentTranscodeSources });

    expect(transcode).toHaveBeenCalledWith(expect.objectContaining({ from: 'heic', to: 'jpeg' }));
  });

  describe('without @taucad/heif', async () => {
    // Imported dynamically: the page reaches `@taucad/image` only through lazy edges.
    const { rasterTranscoder } = await import('@taucad/image');
    const rasterOnly = deriveTranscodeSources(defineRuntime({ transcoders: [rasterTranscoder()] }), 'jpeg');

    it('should leave HEIC out of the picker', () => {
      expect(
        attachmentAccept({ images: true, documents: true, transcodeSources: rasterOnly, isIos: false }),
      ).not.toContain('heic');
    });

    it('should refuse a HEIC by name and tell the person to export it as JPEG', async () => {
      const transcode = vi.fn();
      const result = await normalizeImageAttachment({ bytes: heic, transcode, transcodeSources: rasterOnly });

      expect(transcode).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'refused', reason: 'unsupported-format', format: 'heic' });
      expect(result.status === 'refused' ? result.message : '').toContain('Export the image as JPEG');
      expect(attachmentRefusalCopy({ reason: 'unsupported-format', format: 'heic' }).description).toBe(
        "HEIC images can't be attached. Save it as JPEG or PNG and attach it again.",
      );
    });
  });
});
