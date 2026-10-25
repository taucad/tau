import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRenderTimeout, saveCapture, viewerSettings } from '#mcp-viewer-chrome.js';

let root: string;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tau-viewer-chrome-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('viewerSettings', () => {
  it("should keep the entry's render timeout in entries.json beside its other settings", async () => {
    await mkdir(join(root, '.tau', 'workbench'), { recursive: true });
    await writeFile(
      join(root, '.tau', 'workbench', 'entries.json'),
      JSON.stringify({
        version: 1,
        entries: { 'gear.ts': { components: { hidden: ['a'], isolated: [], opacity: [] } } },
      }),
    );

    await expect(
      viewerSettings({ root, entryPath: 'gear.ts', defaultRenderTimeout: 600_000, request: { modelId: 'm1' } }),
    ).resolves.toEqual({ defaultRenderTimeout: 600_000 });
    await expect(
      viewerSettings({
        root,
        entryPath: 'gear.ts',
        defaultRenderTimeout: 600_000,
        request: { modelId: 'm1', renderTimeout: 30_000 },
      }),
    ).resolves.toEqual({ renderTimeout: 30_000, defaultRenderTimeout: 600_000 });

    await expect(readRenderTimeout(root, 'gear.ts')).resolves.toBe(30_000);
    const written = JSON.parse(await readFile(join(root, '.tau', 'workbench', 'entries.json'), 'utf8')) as {
      entries: Record<string, { components?: { hidden: string[] } }>;
    };
    expect(written.entries['gear.ts']?.components?.hidden).toEqual(['a']);
  });

  it('should leave a record from a newer Tau alone', async () => {
    await mkdir(join(root, '.tau', 'workbench'), { recursive: true });
    await writeFile(join(root, '.tau', 'workbench', 'entries.json'), JSON.stringify({ version: 2, entries: {} }));

    await expect(
      viewerSettings({
        root,
        entryPath: 'gear.ts',
        defaultRenderTimeout: 1,
        request: { modelId: 'm1', renderTimeout: 5 },
      }),
    ).resolves.toMatchObject({ errorCode: 'RECORD_NOT_WRITTEN' });
  });
});

describe('saveCapture', () => {
  it('should save PNGs under exports/ without replacing an earlier capture', async () => {
    const request = { modelId: 'm1', data: png.toString('base64') };

    await expect(saveCapture({ root, entryPath: 'parts/gear.ts', request })).resolves.toEqual({
      path: 'exports/gear-capture-1.png',
      byteLength: png.length,
    });
    await expect(saveCapture({ root, entryPath: 'parts/gear.ts', request })).resolves.toMatchObject({
      path: 'exports/gear-capture-2.png',
    });
    expect(await readFile(join(root, 'exports', 'gear-capture-1.png'))).toEqual(png);
  });

  it('should refuse anything but a PNG', async () => {
    await expect(
      saveCapture({
        root,
        entryPath: 'gear.ts',
        request: { modelId: 'm1', data: Buffer.from('GIF89a').toString('base64') },
      }),
    ).resolves.toMatchObject({ errorCode: 'UNSUPPORTED_FORMAT' });
  });
});
