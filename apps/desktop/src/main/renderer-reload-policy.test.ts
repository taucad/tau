/**
 * T-B11.1 (B11): the renderer reload policy. A renderer that keeps dying is reloaded once, then sent Home, then left
 * for the recovery window, instead of reloading the same address for ever.
 */
import { describe, expect, it } from 'vitest';

import {
  closedPageName,
  createRendererReloadPolicy,
  rendererReloadStep,
  rendererReloadWindows,
} from '#main/renderer-reload-policy.js';

const second = 1000;
const minute = 60 * second;

describe('rendererReloadStep', () => {
  it('should reload after the first death', () => {
    expect(rendererReloadStep([], 10 * minute)).toStrictEqual({ step: 'reload', count: 1, deaths: [10 * minute] });
  });

  it('should load Home after a second death within 60 s', () => {
    expect(rendererReloadStep([0], 59 * second)).toMatchObject({ step: 'home', count: 2 });
  });

  it('should reload again after a second death more than 60 s later', () => {
    expect(rendererReloadStep([0], 61 * second)).toMatchObject({ step: 'reload', count: 2 });
  });

  it('should stop after a third death within 5 minutes', () => {
    expect(rendererReloadStep([0, 2 * minute], 4 * minute)).toMatchObject({ step: 'stop', count: 3 });
    expect(rendererReloadStep([0, 30 * second], 50 * second)).toMatchObject({ step: 'stop', count: 3 });
  });

  it('should forget deaths after five quiet minutes', () => {
    expect(rendererReloadStep([0, 30 * second], 30 * second + rendererReloadWindows.stop + 1)).toStrictEqual({
      step: 'reload',
      count: 1,
      deaths: [30 * second + rendererReloadWindows.stop + 1],
    });
  });
});

describe('createRendererReloadPolicy', () => {
  it('should walk reload, home, stop, and give nothing for a clean exit', () => {
    let now = 0;
    const policy = createRendererReloadPolicy({ now: () => now });

    expect(policy.gone('crashed')).toMatchObject({ step: 'reload', count: 1 });
    now = 10 * second;
    expect(policy.gone('clean-exit')).toBeUndefined();
    now = 20 * second;
    expect(policy.gone('oom')).toMatchObject({ step: 'home', count: 2 });
    now = 3 * minute;
    expect(policy.gone('killed')).toMatchObject({ step: 'stop', count: 3 });
  });

  it('should start over after five quiet minutes', () => {
    let now = 0;
    const policy = createRendererReloadPolicy({ now: () => now });
    policy.gone('crashed');
    now = 30 * second;
    policy.gone('crashed');

    now = 30 * second + 5 * minute + 1;
    expect(policy.gone('crashed')).toMatchObject({ step: 'reload', count: 1 });
  });
});

describe('closedPageName', () => {
  it('should name the page by its title without the app suffix, Home by its path, and otherwise the page', () => {
    expect(closedPageName('app://tau/w/home/bracket', 'Bracket · Tau')).toBe('“Bracket”');
    expect(closedPageName('app://tau/', 'Tau')).toBe('Home');
    expect(closedPageName('app://tau/w/home/bracket', 'Tau')).toBe('The page that was open');
    expect(closedPageName('not a url', undefined)).toBe('The page that was open');
  });
});
