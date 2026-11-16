// @vitest-environment node
/*
 * The composer's convertible formats are written out, so the page never imports the transcoder (I3). This test keeps
 * the list equal to the formats the web worker's attachment runtime converts to `jpeg`, and inside what the desktop
 * utility converts: its `default` runtime registers the raster transcoder through `image()`. A format added to the
 * raster transcoder fails here until the list names it.
 */
import { describe, expect, it } from 'vitest';
import { deriveTranscodeSources } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { attachmentTranscodeSources } from '#runtime/attachment-transcode-sources.js';

describe('attachment transcode sources', () => {
  it('should admit exactly the formats the attachment runtime converts to jpeg', async () => {
    const { attachmentImageRuntime } = await import('#runtime/attachment-image-runtime.definition.js');
    expect(attachmentTranscodeSources).toEqual(deriveTranscodeSources(attachmentImageRuntime, 'jpeg'));
  });

  it('should admit only formats the desktop utility converts to jpeg', async () => {
    // Dynamic, as the page loads `@taucad/image` lazily (`@nx/enforce-module-boundaries`).
    const { image } = await import('@taucad/image');
    const utilitySources = deriveTranscodeSources(defineRuntime({ plugins: [image()] }), 'jpeg');
    expect(utilitySources).toEqual(expect.arrayContaining([...attachmentTranscodeSources]));
  });
});
