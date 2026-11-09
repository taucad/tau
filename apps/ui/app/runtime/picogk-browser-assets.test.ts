import { describe, expect, it } from 'vitest';
import { placePicogkBrowserAssets } from '#runtime/picogk-browser-assets.js';

describe('PicoGK browser asset placement', () => {
  const sha256 = 'a'.repeat(64);

  it('should place a same-origin bundle under the app base', () => {
    expect(
      placePicogkBrowserAssets({ url: `/picogk-browser/${sha256}/assets-manifest.json`, sha256 }, '/app/'),
    ).toEqual({ url: `/app/picogk-browser/${sha256}/assets-manifest.json`, sha256 });
  });

  it('should keep a digest mirror URL as the build named it', () => {
    const mirrored = { url: `https://dependencies.taucad.dev/blobs/sha256/${sha256}`, sha256 };
    expect(placePicogkBrowserAssets(mirrored, '/app/')).toEqual(mirrored);
  });

  it('should return nothing when the build prepared no bundle', () => {
    expect(placePicogkBrowserAssets(undefined, '/')).toBeUndefined();
  });
});
