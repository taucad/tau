// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import * as Cookies from 'es-cookie';
import { renderToString } from 'react-dom/server';
import {
  applyClientFacts,
  clientFactsScript,
  clientFactsStorageKey,
  forgetClientFacts,
  readClientFacts,
  retireLegacyFactCookies,
  useClientFact,
  useDocumentFact,
  writeClientFacts,
} from '#lib/client-facts.js';
import type { ClientFacts } from '#lib/client-facts.js';

const root = document.documentElement;

const resetRoot = (): void => {
  for (const name of root.getAttributeNames()) {
    root.removeAttribute(name);
  }
};

const runHeadScript = (): void => {
  // oxlint-disable-next-line no-new-func -- the subject under test is the inline script's source.
  const run = new Function(clientFactsScript) as () => void;
  run();
};

/** What `<html>` carries once the facts are applied: the part the CSS and the first client render read. */
const rootState = (): Record<string, string | undefined> => ({
  class: [...root.classList].sort().join(' '),
  sidebarClosed: root.dataset['sidebarClosed'],
  pointerCursors: root.dataset['pointerCursors'],
});

const setPrefersLight = (matches: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
};

beforeEach(() => {
  localStorage.clear();
  forgetClientFacts();
  resetRoot();
  setPrefersLight(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The P2 facts matrix: each row is a device the document must paint correctly before hydration. */
const matrix: ReadonlyArray<readonly [string, ClientFacts, boolean]> = [
  ['nothing stored, light OS', {}, true],
  ['nothing stored, dark OS', {}, false],
  ['System on a dark OS', { theme: 'system' }, false],
  ['Dark on a light OS', { theme: 'dark' }, true],
  ['Light on a dark OS', { theme: 'light' }, false],
  ['Black', { theme: 'black' }, true],
  ['High Contrast', { theme: 'high-contrast' }, true],
  ['sidebar closed', { sidebarOpen: false }, true],
  ['sidebar open', { sidebarOpen: true }, true],
  ['pointer cursors', { pointerCursors: true }, true],
];

describe('client facts head script', () => {
  it.each(matrix)('applies the same <html> state as the runtime writer: %s', (_label, facts, prefersLight) => {
    setPrefersLight(prefersLight);
    localStorage.setItem(clientFactsStorageKey, JSON.stringify({ v: 1, ...facts }));

    runHeadScript();
    const fromScript = rootState();
    resetRoot();
    applyClientFacts(facts, root, prefersLight);

    expect(fromScript).toStrictEqual(rootState());
  });

  it('applies Black and High Contrast over the dark base, before first paint', () => {
    localStorage.setItem(clientFactsStorageKey, JSON.stringify({ v: 1, theme: 'black' }));

    runHeadScript();

    expect([...root.classList]).toStrictEqual(['dark', 'black']);
  });

  it('ignores a record of another version and leaves the system default', () => {
    setPrefersLight(false);
    localStorage.setItem(clientFactsStorageKey, JSON.stringify({ v: 2, theme: 'light', sidebarOpen: false }));

    runHeadScript();

    expect(rootState()).toMatchObject({ class: 'dark', sidebarClosed: undefined });
  });

  it('leaves the neutral default when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });

    expect(runHeadScript).not.toThrow();
    expect(root.dataset['sidebarClosed']).toBeUndefined();
  });

  it('folds the stores from before the record into it once, with no flash', () => {
    setPrefersLight(true);
    localStorage.setItem('tau-theme', 'dark');
    localStorage.setItem('tau-sidebar-op', 'false');
    localStorage.setItem('tau-pointer-cursors', 'true');

    runHeadScript();

    expect(rootState()).toMatchObject({ class: 'dark', sidebarClosed: '', pointerCursors: 'true' });
    expect(JSON.parse(localStorage.getItem(clientFactsStorageKey) ?? '{}')).toStrictEqual({
      v: 1,
      theme: 'dark',
      sidebarOpen: false,
      pointerCursors: true,
    });
    expect(localStorage.getItem('tau-theme')).toBeNull();
    expect(localStorage.getItem('tau-sidebar-op')).toBeNull();
    expect(localStorage.getItem('tau-pointer-cursors')).toBeNull();
    forgetClientFacts();
    expect(readClientFacts()).toStrictEqual({ theme: 'dark', sidebarOpen: false, pointerCursors: true });
  });
});

describe('client facts record', () => {
  it('writes one owner fact, keeps the others, applies them and announces the change', () => {
    writeClientFacts({ theme: 'dark', sidebarOpen: false });
    writeClientFacts({ pointerCursors: true });

    expect(readClientFacts()).toStrictEqual({ theme: 'dark', sidebarOpen: false, pointerCursors: true });
    expect(rootState()).toMatchObject({ class: 'dark', sidebarClosed: '', pointerCursors: 'true' });

    writeClientFacts({ sidebarOpen: undefined });
    expect(readClientFacts()).toStrictEqual({ theme: 'dark', pointerCursors: true });
    expect(root.dataset['sidebarClosed']).toBeUndefined();
  });

  it('follows another tab through the storage event', () => {
    writeClientFacts({ theme: 'light' });
    localStorage.setItem(clientFactsStorageKey, JSON.stringify({ v: 1, theme: 'black' }));

    globalThis.dispatchEvent(new StorageEvent('storage', { key: clientFactsStorageKey }));

    expect(readClientFacts().theme).toBe('black');
    expect([...root.classList]).toStrictEqual(['dark', 'black']);
  });

  it('expires the presentation cookies the server used to read', () => {
    for (const [name, value] of [
      ['tau-shell-op-sidebar', '0'],
      ['tau-chat-model', '"x"'],
      ['tau-layout-flags', 'onboarding.1'],
      ['tau-cookie-consent', '{}'],
    ] as const) {
      Cookies.set(name, value, { path: '/' });
    }

    retireLegacyFactCookies();

    expect(Object.keys(Cookies.getAll())).toStrictEqual(['tau-cookie-consent']);
    Cookies.remove('tau-cookie-consent', { path: '/' });
  });

  it('renders a body fact as unknown on the server and in the hydrating render, whatever is stored', () => {
    writeClientFacts({ sidebarOpen: false });
    const probe = (): React.JSX.Element => createElement('span', null, String(useClientFact('sidebarOpen')));

    expect(renderToString(createElement(probe))).toContain('undefined');
  });

  it('hydrates an <html> fact with the stored value the head script already applied', () => {
    writeClientFacts({ pointerCursors: true });
    const probe = (): React.JSX.Element => createElement('span', null, String(useDocumentFact('pointerCursors')));

    // A document exists under jsdom, so this render stands in for the hydrating one; the server reads none.
    expect(renderToString(createElement(probe))).toContain('true');
  });
});
