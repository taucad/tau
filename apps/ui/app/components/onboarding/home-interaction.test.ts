// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { hasUsedPageSince, markPageUsed } from '#components/onboarding/home-interaction.js';

describe('hasUsedPageSince', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('does not count focus the page gives a text field by itself', () => {
    const composer = document.createElement('textarea');
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.append(composer, editor);
    const since = performance.now();
    composer.focus();
    editor.focus();
    expect(hasUsedPageSince(since)).toBe(false);
  });

  it.each([
    [
      'a key press',
      (): void => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      },
    ],
    [
      'a pointer press',
      (): void => {
        document.dispatchEvent(new Event('pointerdown'));
      },
    ],
    ['an edit made before the bundle ran', markPageUsed],
  ])('counts %s after the moment', (_name, use) => {
    const since = performance.now();
    use();
    expect(hasUsedPageSince(since)).toBe(true);
  });

  it('does not count use from before the moment', () => {
    markPageUsed();
    expect(hasUsedPageSince(performance.now())).toBe(false);
  });
});
