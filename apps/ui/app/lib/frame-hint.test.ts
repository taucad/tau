import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildFrameHintScript,
  defaultWideFrameHint,
  frameHintKey,
  frameHintProjectLimit,
  frameHintStorageKey,
  frameHintVariableNames,
  frameHintVariables,
  frameTabAttribute,
  phoneFrameDestination,
  phoneFrameHintVariableNames,
  phoneFrameHintVariables,
  readPhoneFrameHint,
  readWideFrameHint,
  writePhoneFrameHint,
  writeWideFrameHint,
} from '#lib/frame-hint.js';
import type { WideFrameHint } from '#lib/frame-hint.js';
import { mobilePanelIds } from '@taucad/ui-core/constants/editor.constants';

const workbenchClosed: WideFrameHint = {
  chatOpen: true,
  chatWidth: 440,
  workbenchOpen: false,
  workbenchWidth: 420,
  compactAuxiliary: 'chat',
};

/** Run the pre-paint script at `pathname` and read back the phone variables and the tab it left on `<html>`. */
const runPhoneScriptAt = (pathname: string): Record<string, string> => {
  runScriptAt(pathname);
  const html = document.documentElement;
  const tab = html.getAttribute(frameTabAttribute);
  return Object.fromEntries([
    ...phoneFrameHintVariableNames
      .map((name) => [name, html.style.getPropertyValue(name)] as const)
      .filter(([, value]) => value !== ''),
    ...(tab === null ? [] : [[frameTabAttribute, tab] as const]),
  ]);
};

/** Run the pre-paint script at `pathname` and read back the variables it left on `<html>`. */
const runScriptAt = (pathname: string): Record<string, string> => {
  globalThis.history.replaceState(null, '', pathname);
  const script = document.createElement('script');
  script.textContent = buildFrameHintScript();
  /* In jsdom an inline script runs as the document head would; the script is the unit under test. */
  document.head.append(script);
  script.remove();
  const { style } = document.documentElement;
  return Object.fromEntries(
    frameHintVariableNames
      .map((name) => [name, style.getPropertyValue(name)] as const)
      .filter(([, value]) => value !== ''),
  );
};

describe('frame hint', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute(frameTabAttribute);
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('keys a project route by its URL slugs and nothing else', () => {
    expect(frameHintKey('/w/home/one')).toBe('home/one');
    expect(frameHintKey('/w/home/one/extra')).toBe('home/one');
    expect(frameHintKey('/w/my%20space/one')).toBe('my%20space/one');
    expect(frameHintKey('/')).toBeUndefined();
    expect(frameHintKey('/w/home')).toBeUndefined();
  });

  // C5 (blueprint, § Red-first tests): the script sets the variables for a stored project and the defaults for an
  // unknown one; a malformed record is ignored.
  it('C5: the pre-paint script sets the stored project variables, as frameHintVariables derives them', () => {
    writeWideFrameHint('home/one', workbenchClosed);

    expect(runScriptAt('/w/home/one')).toEqual(frameHintVariables(workbenchClosed));
  });

  it('C5: the pre-paint script leaves an unknown project at the CSS defaults', () => {
    writeWideFrameHint('home/one', workbenchClosed);

    expect(runScriptAt('/w/home/two')).toEqual({});
    expect(runScriptAt('/')).toEqual({});
  });

  it.each([
    ['not JSON', '{'],
    ['another version', JSON.stringify({ v: 2, projects: { 'home/one': { usedAt: 1, wide: workbenchClosed } } })],
    [
      'a width that is not a number',
      JSON.stringify({ v: 1, projects: { 'home/one': { usedAt: 1, wide: { ...workbenchClosed, chatWidth: '440' } } } }),
    ],
    [
      'an unknown compact lane',
      JSON.stringify({
        v: 1,
        projects: { 'home/one': { usedAt: 1, wide: { ...workbenchClosed, compactAuxiliary: 'viewer' } } },
      }),
    ],
    ['a null entry', JSON.stringify({ v: 1, projects: { 'home/one': null } })],
  ])('C5: the pre-paint script and the reader ignore %s', (_name, raw) => {
    globalThis.localStorage.setItem(frameHintStorageKey, raw);

    expect(runScriptAt('/w/home/one')).toEqual({});
    expect(readWideFrameHint('home/one')).toBeUndefined();
  });

  it('sets --wait-offset to minus the time since navigation start on every route', () => {
    runScriptAt('/');

    expect(document.documentElement.style.getPropertyValue('--wait-offset')).toMatch(/^-\d+ms$/u);
  });

  it('derives the same variables as the script for every compact case', () => {
    const cases: WideFrameHint[] = [
      defaultWideFrameHint,
      workbenchClosed,
      { ...workbenchClosed, chatOpen: false, workbenchOpen: true },
      { ...workbenchClosed, chatOpen: false, workbenchOpen: false },
      { ...workbenchClosed, workbenchOpen: true, compactAuxiliary: 'workbench' },
      { ...workbenchClosed, chatOpen: true, workbenchOpen: false, compactAuxiliary: 'workbench', chatWidth: 333.6 },
    ];
    for (const wide of cases) {
      writeWideFrameHint('home/one', wide);
      document.documentElement.removeAttribute('style');

      expect(runScriptAt('/w/home/one')).toEqual(frameHintVariables(wide));
    }
  });

  it('writes over a version-1 record holding a malformed entry, dropping that entry', () => {
    globalThis.localStorage.setItem(
      frameHintStorageKey,
      JSON.stringify({
        v: 1,
        projects: { 'home/x': null, 'home/y': { usedAt: 1, wide: workbenchClosed }, 'home/z': { usedAt: 'a' } },
      }),
    );

    expect(() => {
      writeWideFrameHint('home/one', workbenchClosed);
    }).not.toThrow();
    expect(readWideFrameHint('home/one')).toEqual(workbenchClosed);
    expect(readWideFrameHint('home/y')).toEqual(workbenchClosed);
    const stored = JSON.parse(globalThis.localStorage.getItem(frameHintStorageKey)!) as {
      projects: Record<string, unknown>;
    };
    expect(Object.keys(stored.projects).toSorted()).toEqual(['home/one', 'home/y']);
  });

  /* PR review: a malformed entry under the key being written must not throw before the write. */
  it.each([
    ['a null layout', { usedAt: 1, wide: null }],
    ['a layout that is not an object', { usedAt: 1, wide: 3 }],
    ['an entry that is not an object', 'x'],
  ])("replaces the written key's own malformed entry holding %s", (_name, malformed) => {
    globalThis.localStorage.setItem(frameHintStorageKey, JSON.stringify({ v: 1, projects: { 'home/one': malformed } }));

    expect(() => {
      writeWideFrameHint('home/one', workbenchClosed);
    }).not.toThrow();
    expect(readWideFrameHint('home/one')).toEqual(workbenchClosed);
  });

  it('reads back what it wrote, as the same object until the record changes', () => {
    writeWideFrameHint('home/one', workbenchClosed);
    const first = readWideFrameHint('home/one');

    expect(first).toEqual(workbenchClosed);
    expect(readWideFrameHint('home/one')).toBe(first);
  });

  it('keeps the most recently used projects up to the cap', () => {
    for (let index = 0; index <= frameHintProjectLimit; index += 1) {
      writeWideFrameHint(`home/p${index}`, workbenchClosed, index);
    }

    expect(readWideFrameHint('home/p0')).toBeUndefined();
    expect(readWideFrameHint(`home/p${frameHintProjectLimit}`)).toEqual(workbenchClosed);
    const stored = JSON.parse(globalThis.localStorage.getItem(frameHintStorageKey)!) as {
      projects: Record<string, unknown>;
    };
    expect(Object.keys(stored.projects)).toHaveLength(frameHintProjectLimit);
  });

  // ── A15c: the phone shape ──

  it('derives the same phone variables and tab as the script for every surface', () => {
    for (const tab of mobilePanelIds) {
      writePhoneFrameHint('home/one', tab);
      document.documentElement.removeAttribute('style');
      document.documentElement.removeAttribute(frameTabAttribute);
      const phone = readPhoneFrameHint('home/one');

      expect(phone?.tab).toBe(tab);
      expect(runPhoneScriptAt('/w/home/one')).toEqual({
        ...phoneFrameHintVariables(phone!),
        [frameTabAttribute]: phoneFrameDestination(tab),
      });
    }
  });

  it('records the detent the sheet opens at: full for the Editor, half for any other surface', () => {
    writePhoneFrameHint('home/one', 'editor');
    expect(readPhoneFrameHint('home/one')).toEqual({ tab: 'editor', snap: 1 });
    expect(phoneFrameHintVariables(readPhoneFrameHint('home/one')!)['--frame-sheet-height']).toBe('calc(1 * 100dvh)');

    writePhoneFrameHint('home/one', 'chat');
    expect(readPhoneFrameHint('home/one')).toEqual({ tab: 'chat', snap: 0.5 });

    writePhoneFrameHint('home/one', 'viewer');
    expect(phoneFrameHintVariables(readPhoneFrameHint('home/one')!)).toEqual({
      '--frame-sheet-display': 'none',
      '--frame-sheet-height': '0px',
    });
  });

  it('keeps the wide layout when the phone layout is written, and the phone layout when the wide one is', () => {
    writeWideFrameHint('home/one', workbenchClosed, 1);
    writePhoneFrameHint('home/one', 'parameters', 2);
    writeWideFrameHint('home/one', { ...workbenchClosed, chatWidth: 500 }, 3);

    expect(readWideFrameHint('home/one')).toEqual({ ...workbenchClosed, chatWidth: 500 });
    expect(readPhoneFrameHint('home/one')).toEqual({ tab: 'parameters', snap: 0.5 });
    expect(runScriptAt('/w/home/one')).toEqual(frameHintVariables({ ...workbenchClosed, chatWidth: 500 }));
    expect(runPhoneScriptAt('/w/home/one')).toEqual({
      '--frame-sheet-display': 'flex',
      '--frame-sheet-height': 'calc(0.5 * 100dvh)',
      [frameTabAttribute]: 'parameters',
    });
  });

  it('keeps a phone-only entry, which sets no wide variable', () => {
    writePhoneFrameHint('home/one', 'chat');

    expect(readWideFrameHint('home/one')).toBeUndefined();
    expect(runScriptAt('/w/home/one')).toEqual({});
    expect(runPhoneScriptAt('/w/home/one')[frameTabAttribute]).toBe('chat');
  });

  it.each([
    ['an unknown surface', { tab: 'gallery', snap: 0.5 }],
    ['an unknown detent', { tab: 'chat', snap: 0.7 }],
    ['a layout that is not an object', 'chat'],
  ])('ignores a phone layout holding %s and still applies the wide one', (_name, phone) => {
    globalThis.localStorage.setItem(
      frameHintStorageKey,
      JSON.stringify({ v: 1, projects: { 'home/one': { usedAt: 1, wide: workbenchClosed, phone } } }),
    );

    expect(readPhoneFrameHint('home/one')).toBeUndefined();
    expect(runPhoneScriptAt('/w/home/one')).toEqual({});
    expect(runScriptAt('/w/home/one')).toEqual(frameHintVariables(workbenchClosed));
  });

  it("keeps another project's valid wide layout when its phone layout is one this build cannot read", () => {
    globalThis.localStorage.setItem(
      frameHintStorageKey,
      JSON.stringify({
        v: 1,
        projects: {
          'home/two': { usedAt: 1, wide: workbenchClosed, phone: { tab: 'gallery', snap: 0.5 } },
          'home/one': { usedAt: 1, wide: workbenchClosed, phone: { tab: 'chat', snap: 0.7 } },
        },
      }),
    );
    writePhoneFrameHint('home/three', 'chat');
    writePhoneFrameHint('home/one', 'parameters');

    expect(readWideFrameHint('home/two')).toEqual(workbenchClosed);
    expect(readWideFrameHint('home/one')).toEqual(workbenchClosed);
    expect(readPhoneFrameHint('home/one')).toEqual({ tab: 'parameters', snap: 0.5 });
  });
});
