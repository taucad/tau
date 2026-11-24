/**
 * A sprite appended from code (W9 D3): its symbols reach the document once, beside a base sprite already loaded,
 * where the inline loader script returned at its guard. The markup is bundled, so nothing is fetched.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendSvgSprite, svgSpriteIdAttribute } from '#icons/svg-sprite-append.js';
import { svgSpriteElementId } from '#icons/svg-sprite-loader.js';

const markup = '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="visa" viewBox="0 0 10 10"></symbol></svg>';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('appendSvgSprite (W9 D3)', () => {
  it('should append the sprite beside the base sprite, once, however often it is asked, and fetch nothing', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const base = document.createElement('div');
    base.id = svgSpriteElementId;
    document.body.append(base);

    appendSvgSprite('payment', markup);
    appendSvgSprite('payment', markup);

    expect(document.querySelectorAll(`[${svgSpriteIdAttribute}="payment"]`)).toHaveLength(1);
    expect(document.querySelector('symbol#visa')).not.toBeNull();
    expect(document.querySelector(`#${svgSpriteElementId}`)).toBe(base);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
