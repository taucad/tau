import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildFrameHintScript,
  defaultWideFrameHint,
  frameHintKey,
  frameHintProjectLimit,
  frameHintStorageKey,
  frameHintVariableNames,
  frameHintVariables,
  readWideFrameHint,
  writeWideFrameHint,
} from '#lib/frame-hint.js';
import type { WideFrameHint } from '#lib/frame-hint.js';

const workbenchClosed: WideFrameHint = {
  chatOpen: true,
  chatWidth: 440,
  workbenchOpen: false,
  workbenchWidth: 420,
  compactAuxiliary: 'chat',
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
});
