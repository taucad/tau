import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { fitToDisplays, readWindowState, writeWindowState } from '#main/window-state.js';

const laptop = { x: 0, y: 34, width: 1728, height: 1083 };
const external = { x: 1728, y: 0, width: 2560, height: 1415 };

describe('fitToDisplays', () => {
  it('keeps a frame that fits a connected display', () => {
    const bounds = { x: 100, y: 80, width: 1200, height: 800 };
    expect(fitToDisplays(bounds, [laptop])).toEqual(bounds);
  });

  it('drops a frame left on a display that is no longer connected', () => {
    expect(fitToDisplays({ x: 2000, y: 100, width: 1600, height: 1000 }, [laptop])).toBeUndefined();
  });

  it('shrinks and shifts a frame from a larger display to fit the one it falls on', () => {
    expect(fitToDisplays({ x: 200, y: 34, width: 2560, height: 1415 }, [laptop, external])).toEqual(laptop);
  });
});

describe('readWindowState', () => {
  const directories: string[] = [];
  const storePath = (): string => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-window-state-'));
    directories.push(directory);
    return join(directory, 'nested', 'window-state.json');
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns nothing on first launch', () => {
    expect(readWindowState(storePath(), [laptop])).toBeUndefined();
  });

  it('restores what was written', () => {
    const path = storePath();
    const state = { bounds: { x: 100, y: 80, width: 1200, height: 800 }, maximized: true, fullScreen: false };
    writeWindowState(path, state);
    expect(readWindowState(path, [laptop])).toEqual(state);
  });

  it('ignores a corrupt or malformed file', () => {
    const path = storePath();
    writeWindowState(path, { bounds: laptop, maximized: false, fullScreen: false });
    writeFileSync(path, '{"bounds":{"x":0,"y":0,"width":-5,"height":10}}');
    expect(readWindowState(path, [laptop])).toBeUndefined();
    writeFileSync(path, 'not json');
    expect(readWindowState(path, [laptop])).toBeUndefined();
  });
});
