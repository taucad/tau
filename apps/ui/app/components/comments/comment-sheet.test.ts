import { afterEach, describe, expect, it, vi } from 'vitest';
import { readKeyboardInset } from '#components/comments/comment-sheet.js';

const viewport = (height: number, offsetTop = 0, scale = 1): void => {
  vi.stubGlobal('visualViewport', { height, offsetTop, scale });
  vi.stubGlobal('innerHeight', 800);
};

describe('readKeyboardInset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should report the height a keyboard covers at the bottom of the layout viewport', () => {
    viewport(500, 0);
    expect(readKeyboardInset()).toBe(300);
    viewport(500, 100);
    expect(readKeyboardInset()).toBe(200);
  });

  it('should read browser chrome and a pinch zoom as no keyboard', () => {
    viewport(740);
    expect(readKeyboardInset()).toBe(0);
    viewport(400, 0, 2);
    expect(readKeyboardInset()).toBe(0);
  });
});
