// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Share pane scrolls as one: the frame's `share-pane-scroll` is the only scroller, and nothing inside the pane is
 * pinned or bounded. The phone sheet leaves the pane under 300 px with the keyboard open, so every pinned row or inner
 * scroller takes height from the one region that scrolls. The app's sections have their own scan beside
 * `project-share-action.test.tsx`; overlays keep the scroll their `@taucad/ui` primitive defines.
 */
const shareModules = ['share-pane.tsx', 'share-link-body.tsx', 'share-method-picker.tsx', 'share-notice.tsx'];

/** Class tokens that scroll, bound a height, or pin. `scroll-shadows-*` sets `overflow: auto` on both axes. */
const scrollToken =
  /(?<![\w-])(?:[\w-]+:)*(?:overflow(?:-[xy])?-(?:auto|scroll)|max-h-[\w[\]./%-]+|sticky|fixed|scroll-shadows(?:-[xy])?)(?![\w-])/gu;

const tokensOf = (path: string): string[] =>
  [...readFileSync(new URL(path, import.meta.url), 'utf8').matchAll(scrollToken)].map((match) => match[0]);

describe('Share pane single scroller', () => {
  it('should scroll only in the frame', () => {
    expect(tokensOf('share-pane.tsx').sort()).toEqual(['overflow-y-auto', 'scroll-shadows-y']);
    expect(readFileSync(new URL('share-pane.tsx', import.meta.url), 'utf8')).toMatch(
      /data-slot='share-pane-scroll'\s+className='[^']*scroll-shadows-y overflow-y-auto/u,
    );
  });

  it('should pin and scroll nothing else', () => {
    const offenders = shareModules
      .filter((path) => path !== 'share-pane.tsx')
      .flatMap((path) => tokensOf(path).map((token) => `${path}: ${token}`));

    expect(offenders).toEqual([]);
  });
});
