import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createImportGrants } from '#main/import-grants.js';
import type { ImportGrant } from '#main/import-grants.js';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('createImportGrants', () => {
  it('mints an opaque grant for exactly what was chosen and publishes every grant held', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-import-grant-'));
    temporary.push(root);
    mkdirSync(join(root, 'Bracket'));
    writeFileSync(join(root, 'part.step'), 'ISO-10303-21;');
    const published: Array<readonly ImportGrant[]> = [];
    const grants = createImportGrants({ maxGrants: 2, publish: (held) => published.push(held) });

    const folder = await grants.mint(join(root, 'Bracket'), 'directory');
    expect(folder.name).toBe('Bracket');
    expect(folder.grant).toMatch(/^[\w-]{8,128}$/u);
    expect(folder.grant).not.toContain(root);
    expect(published.at(-1)).toEqual([
      { grant: folder.grant, path: realpathSync(join(root, 'Bracket')), kind: 'directory' },
    ]);
    await expect(grants.mint(join(root, 'part.step'), 'directory')).rejects.toThrow(/folder/u);
    await expect(grants.mint(join(root, 'Bracket'), 'file')).rejects.toThrow(/file/u);
  });

  it('lets the oldest grant go past its bound', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-import-grant-'));
    temporary.push(root);
    const grants = createImportGrants({ maxGrants: 2, publish: () => undefined });
    const first = await grants.mint(root, 'directory');
    await grants.mint(root, 'directory');
    await grants.mint(root, 'directory');
    expect(grants.list()).toHaveLength(2);
    expect(grants.list().some(({ grant }) => grant === first.grant)).toBe(false);
  });
});
