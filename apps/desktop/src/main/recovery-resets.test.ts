import * as fs from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyPendingResets,
  cacheDirectories,
  pendingResetsFileName,
  readPendingResets,
  requestReset,
  resettableStores,
} from '#main/recovery-resets.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  const observed = {
    ...actual,
    renameSync: vi.fn(actual.renameSync),
    rmSync: vi.fn(actual.rmSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    rmdirSync: vi.fn(actual.rmdirSync),
  };
  return { ...observed, default: observed };
});

let userData: string | undefined;
const profile = async (): Promise<string> => {
  userData = await mkdtemp(join(tmpdir(), 'tau-recovery-resets-'));
  return userData;
};
afterEach(async () => {
  vi.clearAllMocks();
  if (userData !== undefined) {
    await rm(userData, { recursive: true, force: true });
    userData = undefined;
  }
});

/** A profile holding one item of every store, a project in Home and a sentinel that nothing may touch. */
const seed = async (root: string): Promise<void> => {
  await writeFile(join(root, 'granted-roots.json'), '["/projects/a"]');
  await writeFile(join(root, 'window-state.json'), '{"maximized":true}');
  await mkdir(join(root, 'IndexedDB', 'app_tau_0.indexeddb.leveldb'), { recursive: true });
  await writeFile(join(root, 'IndexedDB', 'app_tau_0.indexeddb.leveldb', 'CURRENT'), 'MANIFEST-1');
  await mkdir(join(root, 'IndexedDB', 'https_example.com_0.indexeddb.leveldb'), { recursive: true });
  await mkdir(join(root, 'Code Cache', 'js'), { recursive: true });
  await mkdir(join(root, 'GPUCache'), { recursive: true });
  await mkdir(join(root, 'home', 'project'), { recursive: true });
  await writeFile(join(root, 'home', 'project', 'sentinel.txt'), 'keep me');
};

const options = (root: string) => ({
  userData: root,
  sessionData: root,
  stamp: '2026-11-17T10-00-00Z',
  appOrigins: ['app_tau_0'],
  report: vi.fn(),
  log: vi.fn(),
});

describe('recovery resets (T-R12.7)', () => {
  it('should record each request in the pending file and apply none of them now', async () => {
    const root = await profile();
    await seed(root);
    for (const store of resettableStores) {
      requestReset(root, store);
    }
    requestReset(root, 'folder-list');
    expect(readPendingResets(root)).toEqual([...resettableStores]);
    expect(fs.existsSync(join(root, 'granted-roots.json'))).toBe(true);
  });

  it('should rename every store under recovery/<time>/ at the next start, and delete nothing', async () => {
    const root = await profile();
    await seed(root);
    for (const store of resettableStores) {
      requestReset(root, store);
    }
    const remove = vi.mocked(fs.rmSync);
    const unlink = vi.mocked(fs.unlinkSync);
    const run = options(root);
    const results = applyPendingResets(run);
    expect(results.map(({ store, outcome }) => [store, outcome])).toEqual(
      resettableStores.map((store) => [store, 'moved']),
    );
    const quarantine = join(root, 'recovery', run.stamp);
    expect(await readFile(join(quarantine, 'granted-roots.json'), 'utf8')).toBe('["/projects/a"]');
    expect(await readFile(join(quarantine, 'window-state.json'), 'utf8')).toBe('{"maximized":true}');
    expect(await readFile(join(quarantine, 'IndexedDB', 'app_tau_0.indexeddb.leveldb', 'CURRENT'), 'utf8')).toBe(
      'MANIFEST-1',
    );
    expect(await readdir(join(quarantine))).toEqual(
      expect.arrayContaining(['Code Cache', 'GPUCache', 'IndexedDB', 'granted-roots.json', 'window-state.json']),
    );
    /* Another origin's database is not the app's to reset. */
    expect(fs.existsSync(join(root, 'IndexedDB', 'https_example.com_0.indexeddb.leveldb'))).toBe(true);
    expect(fs.existsSync(join(root, 'granted-roots.json'))).toBe(false);
    /* The window layout leaves `{}` behind, so the launch is not taken for a first run. */
    expect(await readFile(join(root, 'window-state.json'), 'utf8')).toBe('{}');
    expect(await readFile(join(root, 'home', 'project', 'sentinel.txt'), 'utf8')).toBe('keep me');
    expect(fs.existsSync(join(root, 'recovery', pendingResetsFileName))).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(fs.rmdirSync).not.toHaveBeenCalled();
    expect(unlink.mock.calls.every(([path]) => String(path).endsWith(pendingResetsFileName))).toBe(true);
    expect(run.report).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: ['desktop-store-reset', 'folder-list', 'moved'],
        tags: { store: 'folder-list', outcome: 'moved' },
      }),
    );
  });

  it('should report and skip a rename that fails with EBUSY, and not retry it at the next start', async () => {
    const root = await profile();
    await seed(root);
    requestReset(root, 'folder-list');
    requestReset(root, 'window-layout');
    vi.mocked(fs.renameSync).mockImplementationOnce((from) => {
      throw Object.assign(new Error(`EBUSY: resource busy, rename '${String(from)}'`), { code: 'EBUSY' });
    });
    const run = options(root);
    const results = applyPendingResets(run);
    expect(results).toEqual([
      { store: 'folder-list', outcome: 'failed', errno: 'EBUSY' },
      { store: 'window-layout', outcome: 'moved' },
    ]);
    expect(run.report).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { store: 'folder-list', outcome: 'failed' } }),
    );
    expect(fs.existsSync(join(root, 'granted-roots.json'))).toBe(true);
    expect(readPendingResets(root)).toEqual([]);
    expect(applyPendingResets(options(root))).toEqual([]);
    expect(fs.existsSync(join(root, 'granted-roots.json'))).toBe(true);
  });

  it('should apply nothing when the request file cannot be removed, so no reset can run twice', async () => {
    const root = await profile();
    await seed(root);
    requestReset(root, 'folder-list');
    vi.mocked(fs.renameSync).mockClear();
    vi.mocked(fs.unlinkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('EPERM: operation not permitted, unlink'), { code: 'EPERM' });
    });
    const run = options(root);
    expect(applyPendingResets(run)).toEqual([]);
    expect(fs.existsSync(join(root, 'granted-roots.json'))).toBe(true);
    expect(fs.renameSync).not.toHaveBeenCalled();
    expect(run.log).toHaveBeenCalledWith('warn', 'main.pending-resets-unremovable', { errno: 'EPERM' });
  });

  it('should skip a store that is absent, and touch only the cache directories it names', async () => {
    const root = await profile();
    requestReset(root, 'caches');
    requestReset(root, 'folder-list');
    expect(cacheDirectories).toContain('GPUCache');
    expect(applyPendingResets(options(root))).toEqual([
      { store: 'folder-list', outcome: 'absent' },
      { store: 'caches', outcome: 'absent' },
    ]);
  });

  it('should remove a damaged request file and reset nothing', async () => {
    const root = await profile();
    await seed(root);
    await mkdir(join(root, 'recovery'), { recursive: true });
    await writeFile(join(root, 'recovery', pendingResetsFileName), '{"schemaVersion":1,"stores":["home"]}');
    expect(readPendingResets(root)).toEqual([]);
    expect(applyPendingResets(options(root))).toEqual([]);
    expect(fs.existsSync(join(root, 'recovery', pendingResetsFileName))).toBe(false);
    expect(fs.existsSync(join(root, 'granted-roots.json'))).toBe(true);
  });

  it('should never throw, even when the profile cannot be read', () => {
    const run = options(join(tmpdir(), 'tau-recovery-resets-missing', 'nowhere'));
    expect(() => applyPendingResets(run)).not.toThrow();
  });
});

/*
 * WP9 (R7, T-B5.6's unit half): Reset local database quarantines the app origin's database and its blobs, even when a
 * damaged profile left a file where Chromium expects the database directory (T-B5.5's setup). The grant file stays, so
 * the renderer rebuilds the folder list from it, and Local Storage stays, so Home's engine mirror survives the reset.
 */
describe('local database reset', () => {
  it("should move the app origin's database and blobs, and keep the grant file and Local Storage", async () => {
    const root = await profile();
    await writeFile(join(root, 'granted-roots.json'), '["/projects/a"]');
    await mkdir(join(root, 'IndexedDB'), { recursive: true });
    await writeFile(join(root, 'IndexedDB', 'app_tau_0.indexeddb.leveldb'), 'not a directory');
    await mkdir(join(root, 'IndexedDB', 'app_tau_0.indexeddb.blob', '1'), { recursive: true });
    await mkdir(join(root, 'Local Storage', 'leveldb'), { recursive: true });
    await writeFile(join(root, 'Local Storage', 'leveldb', 'CURRENT'), 'MANIFEST-2');
    requestReset(root, 'local-database');
    const run = options(root);

    expect(applyPendingResets(run)).toEqual([{ store: 'local-database', outcome: 'moved' }]);

    const quarantine = join(root, 'recovery', run.stamp, 'IndexedDB');
    const quarantined = await readdir(quarantine);
    expect(quarantined.toSorted()).toEqual(['app_tau_0.indexeddb.blob', 'app_tau_0.indexeddb.leveldb']);
    expect(await readFile(join(quarantine, 'app_tau_0.indexeddb.leveldb'), 'utf8')).toBe('not a directory');
    expect(await readdir(join(root, 'IndexedDB'))).toEqual([]);
    expect(await readFile(join(root, 'granted-roots.json'), 'utf8')).toBe('["/projects/a"]');
    expect(await readFile(join(root, 'Local Storage', 'leveldb', 'CURRENT'), 'utf8')).toBe('MANIFEST-2');
  });
});
