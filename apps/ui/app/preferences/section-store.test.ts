import * as Cookies from 'es-cookie';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingSection, viewerPreferencesSection } from '@taucad/preferences';
import { cookieName, serverVisiblePreferences } from '@taucad/ui-core/constants/cookie.constants';
import { readServerPreferences } from '#hooks/use-cookie.js';
import { createSectionStore } from '#preferences/section-store.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useDeviceRecord } from '#preferences/use-device-record.js';

const personKeys = [
  cookieName.personProfile,
  cookieName.viewerPreferences,
  cookieName.onboarding,
  cookieName.device,
  cookieName.viewExceptions,
] as const;
const onboardingKey = `tau-${cookieName.onboarding}`;
const viewerKey = `tau-${cookieName.viewerPreferences}`;

/** Another tab's write: it lands in local storage and, in these tests, no `storage` event follows. */
const writeBehindTheHook = (key: string, value: unknown): void => {
  globalThis.localStorage.setItem(key, JSON.stringify({ value }));
};

const storedValue = (key: string): unknown => {
  const raw = globalThis.localStorage.getItem(key);
  return raw === null ? undefined : (JSON.parse(raw) as { value: unknown }).value;
};

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.localStorage.clear();
});

describe('two tabs (RC2)', () => {
  it("merges a stale tab's write into what another tab stored, so no progress is lost", () => {
    const staleTab = createSectionStore(cookieName.onboarding, onboardingSection);
    // The stale tab has read the section once, while it was empty.
    expect(staleTab.read().tour.seen).toEqual([]);

    writeBehindTheHook(onboardingKey, {
      version: 1,
      setup: { status: 'completed' },
      tour: { wanted: false, seen: ['look', 'adjust'], ended: 'dismissed' },
    });

    expect(staleTab.write({ seenAdd: ['ask'] })).toBe('saved');
    expect(storedValue(onboardingKey)).toEqual({
      version: 1,
      setup: { status: 'completed' },
      tour: { wanted: false, seen: ['ask', 'look', 'adjust'], ended: 'dismissed' },
    });
  });

  it('never lowers the setup status, clears the ending or changes wanted from a stale copy', () => {
    const staleTab = createSectionStore(cookieName.onboarding, onboardingSection);
    staleTab.write({ setupStatus: 'offered', wanted: true });
    writeBehindTheHook(onboardingKey, {
      version: 1,
      setup: { status: 'completed' },
      tour: { wanted: false, seen: [], ended: 'completed' },
    });

    staleTab.write({ setupStatus: 'skipped', ended: 'dismissed' });
    expect(storedValue(onboardingKey)).toEqual({
      version: 1,
      setup: { status: 'completed' },
      tour: { wanted: false, seen: [], ended: 'completed' },
    });
  });

  it('writes viewer preferences leaf by leaf over what another tab stored', () => {
    const staleTab = createSectionStore(cookieName.viewerPreferences, viewerPreferencesSection);
    expect(staleTab.read().controls).toEqual({});
    writeBehindTheHook(viewerKey, {
      version: 1,
      controls: { preset: 'alt' },
      gizmo: {},
      viewDefaults: { 'display.grid': false },
    });

    staleTab.write({ viewDefaults: { 'grid.unit': 'in' } });
    expect(storedValue(viewerKey)).toEqual({
      version: 1,
      controls: { preset: 'alt' },
      gizmo: {},
      viewDefaults: { 'display.grid': false, 'grid.unit': 'in' },
    });
  });

  it('shows a change made in another tab without a reload', () => {
    const { result } = renderHook(() => usePersonRecord());
    expect(result.current.onboarding.tour.seen).toEqual([]);

    act(() => {
      writeBehindTheHook(onboardingKey, { version: 1, tour: { seen: ['ask'] } });
      globalThis.dispatchEvent(new StorageEvent('storage', { key: onboardingKey }));
    });
    expect(result.current.onboarding.tour.seen).toEqual(['ask']);
  });
});

describe('storage refused (RC3)', () => {
  it('returns failure, keeps the value in memory and leaves what is stored alone', () => {
    const tab = createSectionStore(cookieName.viewerPreferences, viewerPreferencesSection);
    writeBehindTheHook(viewerKey, { version: 1, controls: { preset: 'alt' }, gizmo: {}, viewDefaults: {} });
    const stored = globalThis.localStorage.getItem(viewerKey);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(tab.write({ gizmo: { style: 'axes' } })).toBe('refused');
    expect(globalThis.localStorage.getItem(viewerKey)).toBe(stored);
    expect(tab.read()).toEqual({ version: 1, controls: { preset: 'alt' }, gizmo: { style: 'axes' }, viewDefaults: {} });

    // Once storage accepts writes again, the next write stores what was held in memory too.
    setItem.mockRestore();
    expect(tab.write({ controls: { invertZoom: true } })).toBe('saved');
    expect(storedValue(viewerKey)).toEqual({
      version: 1,
      controls: { preset: 'alt', invertZoom: true },
      gizmo: { style: 'axes' },
      viewDefaults: {},
    });
  });

  it('returns failure to the hook caller', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const { result } = renderHook(() => useDeviceRecord());
    let outcome: string | undefined;
    act(() => {
      outcome = result.current.writeDevice({ inputDevice: 'trackpad' });
    });
    expect(outcome).toBe('refused');
    expect(result.current.device).toEqual({ version: 1, inputDevice: 'trackpad' });

    vi.mocked(Storage.prototype.setItem).mockRestore();
    act(() => {
      outcome = result.current.writeDevice({ tourPaused: true });
    });
    expect(outcome).toBe('saved');
    expect(storedValue(`tau-${cookieName.device}`)).toEqual({ version: 1, inputDevice: 'trackpad', tourPaused: true });
  });
});

describe('unknown version (RC4)', () => {
  it('neither parses nor overwrites a section a later build wrote', () => {
    const newer = JSON.stringify({ value: { version: 2, tour: 'a shape this build cannot read' } });
    globalThis.localStorage.setItem(onboardingKey, newer);
    const tab = createSectionStore(cookieName.onboarding, onboardingSection);

    expect(tab.read()).toEqual(onboardingSection.empty);
    expect(tab.write({ seenAdd: ['ask'] })).toBe('newer');
    expect(globalThis.localStorage.getItem(onboardingKey)).toBe(newer);
  });
});

describe('device only (RC1)', () => {
  it('keeps every person and device key out of the server-visible preferences', () => {
    for (const key of personKeys) {
      expect(serverVisiblePreferences).not.toContain(key);
    }
  });

  it('writes no cookie, so no request carries a section', () => {
    const { result } = renderHook(() => usePersonRecord());
    act(() => {
      result.current.writeProfile({ goals: ['printing'], tool: 'slicer' });
      result.current.writeViewer({ controls: { preset: 'middle-ctrl' } });
      result.current.writeOnboarding({ setupStatus: 'completed' });
    });
    expect(Object.keys(Cookies.getAll()).filter((name) => name.startsWith('tau-'))).toEqual([]);
    // A forged request cookie is not read on the server either.
    const header = personKeys.map((key) => `tau-${key}=${encodeURIComponent('{"value":{}}')}`).join('; ');
    expect(readServerPreferences(header)).toEqual({});
  });

  it('stores each section under its own fixed key as `{ value }`, keyed by no account', () => {
    const { result } = renderHook(() => usePersonRecord());
    act(() => {
      result.current.writeProfile({ languages: ['python'] });
    });
    expect(JSON.parse(globalThis.localStorage.getItem(`tau-${cookieName.personProfile}`) ?? 'null')).toEqual({
      value: { version: 1, goals: [], languages: ['python'] },
    });
  });
});
