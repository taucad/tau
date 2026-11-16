// @vitest-environment node
/*
 * The desktop composer's convertible formats are written out, because its renderer carries no transcoder
 * (`ui:check-desktop-payload`). This test keeps the list equal to the web list, derived from the attachment runtime's
 * edges to `jpeg`, and inside what the desktop utility converts: its `default` runtime registers the raster transcoder
 * through `image()` and the HEIF transcoder through `heif()`. A format added to either transcoder fails here until the
 * desktop list names it.
 */
import { describe, expect, it } from 'vitest';
import { heif } from '@taucad/heif';
import { deriveTranscodeSources } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { attachmentTranscodeSources as desktopSources } from '#runtime/attachment-transcode-sources.desktop.js';
import { attachmentTranscodeSources as webSources } from '#runtime/attachment-transcode-sources.js';

describe('desktop attachment transcode sources', () => {
  it('should admit exactly the formats the web composer derives from its runtime', () => {
    expect(desktopSources).toEqual(webSources);
  });

  it('should admit only formats the desktop utility converts to jpeg', async () => {
    // Imported dynamically: the page reaches `@taucad/image` only through lazy edges.
    const { image } = await import('@taucad/image');
    const utilitySources = deriveTranscodeSources(defineRuntime({ plugins: [image(), heif()] }), 'jpeg');
    expect(utilitySources).toEqual(expect.arrayContaining([...desktopSources]));
  });
});
