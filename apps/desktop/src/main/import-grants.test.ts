import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

const sandbox = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-import-grant-'));
  temporary.push(root);
  return root;
};

describe('createImportGrants', () => {
  it('mints an opaque grant for exactly what was chosen, pinned by identity and scoped to its window', async () => {
    const root = sandbox();
    mkdirSync(join(root, 'Bracket'));
    writeFileSync(join(root, 'part.step'), 'ISO-10303-21;');
    const published: Array<readonly ImportGrant[]> = [];
    const grants = createImportGrants({ maxGrants: 4, publish: (held) => published.push(held) });

    const folder = await grants.mint(join(root, 'Bracket'), 'directory', 7);
    expect(folder.name).toBe('Bracket');
    expect(folder.grant).toMatch(/^[\w-]{8,128}$/u);
    expect(folder.grant).not.toContain(root);
    const { dev, ino } = lstatSync(realpathSync(join(root, 'Bracket')), { bigint: true });
    expect(published.at(-1)).toEqual([
      {
        grant: folder.grant,
        path: realpathSync(join(root, 'Bracket')),
        kind: 'directory',
        identity: { dev: String(dev), ino: String(ino) },
        owner: '7',
      },
    ]);
    await expect(grants.mint(join(root, 'part.step'), 'directory', 7)).rejects.toThrow(/folder/u);
    await expect(grants.mint(join(root, 'Bracket'), 'file', 7)).rejects.toThrow(/file/u);
  });

  it('lets a window release only its own grants, and all of them when it closes', async () => {
    const root = sandbox();
    const published: Array<readonly ImportGrant[]> = [];
    const grants = createImportGrants({ maxGrants: 8, publish: (held) => published.push(held) });
    const mine = await grants.mint(root, 'directory', 1);
    const other = await grants.mint(root, 'directory', 2);
    const later = await grants.mint(root, 'directory', 1);
    grants.release([mine.grant, other.grant], 1);
    expect(grants.list().map(({ grant }) => grant)).toEqual([other.grant, later.grant]);
    grants.releaseOwner(1);
    expect(grants.list().map(({ grant }) => grant)).toEqual([other.grant]);
    expect(published.at(-1)?.map(({ grant }) => grant)).toEqual([other.grant]);
  });

  it('lets the oldest grant go past its bound', async () => {
    const root = sandbox();
    const grants = createImportGrants({ maxGrants: 2, publish: () => undefined });
    const first = await grants.mint(root, 'directory', 1);
    await grants.mint(root, 'directory', 1);
    await grants.mint(root, 'directory', 1);
    expect(grants.list()).toHaveLength(2);
    expect(grants.list().some(({ grant }) => grant === first.grant)).toBe(false);
  });
});
