/**
 * A sprite appended from code (W9 D3): its symbols reach the document once, beside a base sprite already loaded,
 * where the inline loader script returned at its guard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendSvgSprite, svgSpriteUrlAttribute } from '#icons/svg-sprite-append.js';
import { svgSpriteElementId } from '#icons/svg-sprite-loader.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('appendSvgSprite (W9 D3)', () => {
  it('should append the sprite beside the base sprite, once, however often it is asked', async () => {
    const base = document.createElement('div');
    base.id = svgSpriteElementId;
    document.body.append(base);
    const fetchSprite = vi.fn(async () => new Response('<svg><symbol id="visa"></symbol></svg>'));
    await Promise.all([
      appendSvgSprite('/assets/payment-sprite.svg', { fetch: fetchSprite }),
      appendSvgSprite('/assets/payment-sprite.svg', { fetch: fetchSprite }),
    ]);
    await appendSvgSprite('/assets/payment-sprite.svg', { fetch: fetchSprite });
    expect(fetchSprite).toHaveBeenCalledOnce();
    expect(document.querySelector('#visa')).not.toBeNull();
    expect(document.querySelectorAll(`[${svgSpriteUrlAttribute}]`)).toHaveLength(1);
  });

  it('should append nothing for a failed fetch, and try again on the next call', async () => {
    const failing = vi.fn(async () => new Response('', { status: 404 }));
    await appendSvgSprite('/assets/payment-sprite.svg', { fetch: failing });
    expect(document.querySelector('#visa')).toBeNull();
    const working = vi.fn(async () => new Response('<svg><symbol id="visa"></symbol></svg>'));
    await appendSvgSprite('/assets/payment-sprite.svg', { fetch: working });
    expect(document.querySelector('#visa')).not.toBeNull();
  });
});
