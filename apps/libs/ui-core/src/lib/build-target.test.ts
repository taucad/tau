import { describe, expect, it } from 'vitest';
import * as resolved from '@taucad/ui-core/lib/build-target';
import * as desktop from '#lib/build-target.desktop.js';
import * as web from '#lib/build-target.web.js';

describe('build target variants', () => {
  it('answers false on the web variant and true on the desktop variant', () => {
    expect(web.isDesktopTarget).toBe(false);
    expect(desktop.isDesktopTarget).toBe(true);
  });

  it('exports the same names from both variants', () => {
    expect(Object.keys(desktop).toSorted()).toStrictEqual(Object.keys(web).toSorted());
  });

  it('resolves the web variant without the tau-desktop condition', () => {
    expect(resolved.isDesktopTarget).toBe(false);
  });
});
