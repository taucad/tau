import { describe, expect, it } from 'vitest';
import { placeBesideBar } from '#cad/viewer-settings-placement.js';
import type { ViewerSettingsPlacement } from '#cad/viewer-settings-placement.js';

const above: ViewerSettingsPlacement = { side: 'top', align: 'end' };

/** A centred bar whose gear ends 5 px inside its right edge and 5 px above its bottom edge. */
const bar = { right: 540, bottom: 790 };
const trigger = { right: 535, bottom: 785 };

describe('placeBesideBar', () => {
  it('opens to the right of the bar, 8 px from its right edge, with the bottom edges aligned', () => {
    expect(placeBesideBar({ bar, trigger, paneRight: 1000 }, above)).toEqual({
      side: 'right',
      align: 'end',
      sideOffset: 13,
      alignOffset: -5,
    });
  });

  it('opens beside the bar when the menu and both gaps fit the pane exactly', () => {
    // 540 + 8 + 288 + 8 = 844.
    expect(placeBesideBar({ bar, trigger, paneRight: 844 }, above).side).toBe('right');
  });

  it('keeps the fallback above the gear when the menu would pass the pane’s right edge', () => {
    expect(placeBesideBar({ bar, trigger, paneRight: 843.9 }, above)).toBe(above);
    expect(placeBesideBar({ bar: { right: 540.6, bottom: 790 }, trigger, paneRight: 800 }, above)).toBe(above);
  });

  it('measures from the bar, so host actions after the gear widen the side offset', () => {
    const placement = placeBesideBar({ bar: { right: 600, bottom: 790 }, trigger, paneRight: 1200 }, above);
    expect(placement.sideOffset).toBe(73);
  });
});
