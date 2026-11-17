import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { largeObjectFiltersIn, writeLargeObjectFilters } from '#lfs-filters.js';

const core = '[core]\n\trepositoryformatversion = 0\n\tbare = false\n';
const installed =
  '[lfs]\n\trepositoryformatversion = 0\n[filter "lfs"]\n\tprocess = git-lfs filter-process\n\trequired = true\n\tclean = git-lfs clean -- %f\n\tsmudge = git-lfs smudge -- %f\n';

describe('largeObjectFiltersIn', () => {
  it.each([
    ['a store git-lfs configured', `${core}${installed}`, 'configured'],
    [
      'the same keys in another order, with CRLF and comments',
      `${core}[filter "lfs"]\r\n\tsmudge = git-lfs smudge -- %f\r\n# note\r\n\tclean = git-lfs clean -- %f\r\n\trequired = true\r\n\tprocess = git-lfs filter-process\r\n[LFS]\r\n\tRepositoryFormatVersion = 0\r\n`,
      'configured',
    ],
    ['a store with none of them', core, 'absent'],
    ['an empty file', '', 'absent'],
    ['a changed value', `${core}${installed.replace('required = true', 'required = false')}`, 'other'],
    ['a key twice', `${core}${installed}[filter "lfs"]\n\tprocess = git-lfs filter-process\n`, 'other'],
    ['a key missing', `${core}${installed.replace('\tsmudge = git-lfs smudge -- %f\n', '')}`, 'other'],
    ['the format version alone', `${core}[lfs]\n\trepositoryformatversion = 0\n`, 'other'],
    ['an empty filter section', `${core}[filter "lfs"]\n`, 'other'],
    ['an include', `${core}[include]\n\tpath = more\n`, 'other'],
    ['a conditional include', `${core}[includeIf "gitdir:/x/"]\n\tpath = more\n`, 'other'],
    ['the older section spelling', `${core}[filter.lfs]\n\trequired = true\n`, 'other'],
    ['a quoted value', `${core}${installed.replace('required = true', 'required = "true"')}`, 'other'],
    ['a key with no value', `${core}${installed.replace('required = true', 'required')}`, 'other'],
  ] as const)('reads %s', (_name, config, state) => {
    expect(largeObjectFiltersIn(config)).toBe(state);
  });
});

describe('writeLargeObjectFilters', () => {
  const stores: string[] = [];
  afterEach(async () => {
    await Promise.all(stores.splice(0).map(async (store) => rm(store, { recursive: true, force: true })));
  });
  const store = async (config: string): Promise<string> => {
    const path = await mkdtemp(join(tmpdir(), 'tau-revisions-lfs-filters-'));
    stores.push(path);
    await writeFile(join(path, 'config'), config);
    return path;
  };

  it("appends git-lfs's sections to a config with none, through Git's lock", async () => {
    const path = await store(core.trimEnd());

    expect(await writeLargeObjectFilters(path)).toBe(true);

    expect(await readFile(join(path, 'config'), 'utf8')).toBe(`${core}${installed}`);
    await expect(readFile(join(path, 'config.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('writes nothing while another writer holds the lock', async () => {
    const path = await store(core);
    await writeFile(join(path, 'config.lock'), 'theirs');

    expect(await writeLargeObjectFilters(path)).toBe(false);

    expect(await readFile(join(path, 'config'), 'utf8')).toBe(core);
    expect(await readFile(join(path, 'config.lock'), 'utf8')).toBe('theirs');
  });

  it('leaves a config that holds any of the keys as it is', async () => {
    const changed = `${core}[filter "lfs"]\n\trequired = false\n`;
    const path = await store(changed);

    expect(await writeLargeObjectFilters(path)).toBe(false);

    expect(await readFile(join(path, 'config'), 'utf8')).toBe(changed);
    await expect(readFile(join(path, 'config.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
