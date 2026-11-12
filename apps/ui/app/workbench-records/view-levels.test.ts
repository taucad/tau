import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personRecordStores } from '#preferences/person-record.store.js';
import { deviceViewLevels } from '#workbench-records/view-levels.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

/* The flag source, mocked: `viewerControls` and the listeners a flag change reaches. */
const flags = vi.hoisted(() => ({ viewerControls: false, listeners: new Set<() => void>() }));
vi.mock('#flags/feature-flags.js', () => ({
  isFeatureEnabled: (flag: string) => flag === 'viewerControls' && flags.viewerControls,
}));
vi.mock('#flags/use-feature.js', () => ({
  subscribeFeatureFlags: (listener: () => void) => {
    flags.listeners.add(listener);
    return () => flags.listeners.delete(listener);
  },
}));

const setViewerControls = (on: boolean): void => {
  flags.viewerControls = on;
  for (const listener of flags.listeners) {
    listener();
  }
};

beforeEach(() => {
  globalThis.localStorage.clear();
  flags.viewerControls = false;
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe('the device view levels the live sessions read (onboarding Finding 6)', () => {
  it("should give a view its exceptions in every flag state, and the person's defaults only while viewerControls is on", () => {
    const levels = deviceViewLevels('p1');
    personRecordStores.viewer.write({ viewDefaults: { 'display.grid': false } });
    viewExceptions.add('p1', 'v1', 'display.axes');
    expect(levels.read('v1')).toEqual({ exceptions: ['display.axes'] });
    expect(levels.read('v2')).toEqual({ exceptions: [] });
    setViewerControls(true);
    expect(levels.read('v1')).toEqual({ person: { 'display.grid': false }, exceptions: ['display.axes'] });
  });

  it("should tell a session of a change to the flag, the person's defaults or the exceptions, until it unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = deviceViewLevels('p1').subscribe(listener);
    setViewerControls(true);
    expect(listener).toHaveBeenCalledTimes(1);
    personRecordStores.viewer.write({ viewDefaults: { 'grid.unit': 'in' } });
    expect(listener).toHaveBeenCalledTimes(2);
    viewExceptions.add('p1', 'v1', 'display.grid');
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    setViewerControls(false);
    viewExceptions.remove('p1', 'v1', 'display.grid');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
