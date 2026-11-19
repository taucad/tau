import { describe, expect, it } from 'vitest';
import { placeCadmpegEngines } from '#runtime/cadmpeg-engines.js';

describe('cadmpeg engine placement', () => {
  it('should place the same-origin package layout under the app base', () => {
    expect(placeCadmpegEngines({ baseUrl: '/cadmpeg-ts/', layout: 'package' }, '/app/')).toEqual({
      baseUrl: '/app/cadmpeg-ts/',
      layout: 'package',
    });
  });

  it('should keep a dependency host as the build named it', () => {
    const digest = { baseUrl: 'https://dependencies.taucad.dev/', layout: 'digest' } as const;
    expect(placeCadmpegEngines(digest, '/app/')).toEqual(digest);
  });

  it('should return nothing when the build defined no engine source', () => {
    expect(placeCadmpegEngines(undefined, '/')).toBeUndefined();
  });
});
