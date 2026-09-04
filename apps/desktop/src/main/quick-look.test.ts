import { mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createProjectRootRegistry } from '#main/project-roots.js';
import { createQuickLookController, removeStaleQuickLookSessions } from '#main/quick-look.js';

const fixture = () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tau-quick-look-test-'));
  const admittedRoot = join(temporaryRoot, 'project');
  mkdirSync(admittedRoot);
  const registry = createProjectRootRegistry();
  registry.admit(admittedRoot);
  const window = {
    closeFilePreview: vi.fn<() => void>(),
    previewFile: vi.fn<(path: string, displayName?: string) => void>(),
  };
  const controller = createQuickLookController({
    maxOutputBytes: 64,
    registry,
    temporaryRoot: join(temporaryRoot, 'sessions'),
    window,
  });
  return { admittedRoot, controller, temporaryRoot, window };
};

describe('Quick Look controller', () => {
  it('previews a real file under an admitted root and rejects outside paths', () => {
    const { admittedRoot, controller, temporaryRoot, window } = fixture();
    const source = join(admittedRoot, 'part.glb');
    writeFileSync(source, 'glb');
    controller.previewPath({ path: source, displayName: 'Part.glb' });
    expect(window.previewFile).toHaveBeenCalledExactlyOnceWith(realpathSync(source), 'Part.glb');

    const outside = join(temporaryRoot, 'outside.glb');
    writeFileSync(outside, 'glb');
    expect(() => {
      controller.previewPath({ path: outside });
    }).toThrow(/untrusted/u);
    controller.dispose();
  });

  it('writes bounded ZIP-shaped USDZ bytes and removes them on close', () => {
    const { controller, window } = fixture();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    controller.previewUsdz({ bytes, displayName: '../Bracket' });
    const generated = window.previewFile.mock.calls[0]?.[0];
    expect(generated).toBeTypeOf('string');
    if (typeof generated !== 'string') {
      throw new TypeError('Quick Look did not pass a generated path to Electron');
    }
    expect(generated.endsWith('/Bracket.usdz')).toBe(true);
    expect(readFileSync(generated)).toEqual(Buffer.from(bytes));
    controller.close();
    expect(() => statSync(generated)).toThrow();
    controller.dispose();
  });

  it('rejects malformed and oversized generated previews', () => {
    const { controller, window } = fixture();
    expect(() => {
      controller.previewUsdz({ bytes: new Uint8Array([1, 2, 3]), displayName: 'bad' });
    }).toThrow(/ZIP/u);
    expect(() => {
      controller.previewUsdz({
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Uint8Array(64)]),
        displayName: 'huge',
      });
    }).toThrow(/between 1 and 64/u);
    expect(window.previewFile).not.toHaveBeenCalled();
    controller.dispose();
  });
});

describe('removeStaleQuickLookSessions', () => {
  it('removes only old Tau session directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-quick-look-stale-'));
    const old = join(root, 'session-old');
    const fresh = join(root, 'session-fresh');
    const unrelated = join(root, 'other');
    mkdirSync(old);
    mkdirSync(fresh);
    mkdirSync(unrelated);
    utimesSync(old, 1, 1);
    removeStaleQuickLookSessions(root, 2 * 24 * 60 * 60 * 1000);
    expect(() => statSync(old)).toThrow();
    expect(statSync(fresh).isDirectory()).toBe(true);
    expect(statSync(unrelated).isDirectory()).toBe(true);
  });
});
