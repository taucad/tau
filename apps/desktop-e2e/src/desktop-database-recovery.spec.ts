/**
 * T-B5.5 and T-B5.6 (B5, R7): database recovery through the real shell.
 *
 * Home's files are on disk, so with both local databases unopenable Home still lists and opens its projects and says
 * why the rest is missing; Reset local database quarantines the app origin's IndexedDB under `recovery/<time>/` at
 * the next start, and the granted folder comes back from the grant file with its projects. Nothing under `home/` moves.
 *
 * The profile is seeded on disk: one Home project, one granted folder holding a project, and the grant file naming it.
 * The first launch creates the databases and adopts the granted folder from the grant file (T-B5.8), as a reset does.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';

const schema = 'https://tau.new/schemas/tau-v1.json';
const source = 'cube([3, 4, 5]);\n';
const token = 'offline-database-recovery';
const databasePanel = "Tau's local database is unavailable";

const seedProject = async (root: string, name: string): Promise<void> => {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'tau.json'),
    JSON.stringify({
      $schema: schema,
      name,
      description: 'Database recovery acceptance',
      tags: [],
      assets: { main: { entryPath: 'main.scad' } },
    }),
  );
  await writeFile(join(root, 'main.scad'), source);
};

/** Every file under `root` with its bytes, to prove a reset moved nothing there. */
const snapshot = async (root: string): Promise<Record<string, string>> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const contents = await Promise.all(
    files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return [path, await readFile(path, 'utf8')] as const;
    }),
  );
  return Object.fromEntries(contents);
};

/** Make both databases unopenable: a file where Chromium expects the origin's IndexedDB directory. */
const breakDatabases = async (profileRoot: string): Promise<void> => {
  const directory = join(profileRoot, 'IndexedDB');
  for (const entry of await readdir(directory)) {
    if (entry.startsWith('app_tau_0.')) {
      // oxlint-disable-next-line no-await-in-loop -- one origin's few entries, replaced in order.
      await rm(join(directory, entry), { recursive: true, force: true });
    }
  }
  await writeFile(join(directory, 'app_tau_0.indexeddb.leveldb'), 'not a database');
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- tear down in reverse launch order.
    await cleanup().catch(() => undefined);
  }
});

const profile = async (): Promise<{ profileRoot: string; folder: string }> => {
  const profileRoot = await mkdtemp(join(tmpdir(), 'tau-database-recovery-'));
  const folder = await mkdtemp(join(tmpdir(), 'tau-database-recovery-folder-'));
  cleanups.push(
    async () => removeDesktopRoot(profileRoot),
    async () => rm(folder, { recursive: true, force: true }),
  );
  await seedProject(join(profileRoot, 'home', 'home-project'), 'Home project');
  await seedProject(join(folder, 'folder-project'), 'Folder project');
  await writeFile(join(profileRoot, 'granted-roots.json'), JSON.stringify([folder]));
  return { profileRoot, folder };
};

const launch = async (profileRoot: string): Promise<DesktopSession> => {
  const session = await launchDesktopApp({ token, profileRoot, preserveProfile: true });
  cleanups.push(async () => session.close());
  return session;
};

describe('desktop database recovery', () => {
  it('T-B5.5, T-B5.6: lists and opens Home without its databases, and a reset brings the folder list back', async () => {
    const { profileRoot, folder } = await profile();
    const runId = randomBytes(4).toString('hex');

    /* 1. A healthy launch: both databases are created and the granted folder is adopted from the grant file. */
    const first = await launch(profileRoot);
    try {
      await first.page.goto('app://tau/projects');
      await expect.poll(async () => first.page.getByRole('link', { name: 'Open Folder project' }).count()).toBe(1);
      await first.close();
    } catch (error) {
      await first.capture(`database-recovery-healthy-${runId}`);
      throw error;
    }
    await breakDatabases(profileRoot);
    const homeBefore = await snapshot(join(profileRoot, 'home'));

    /* 2. T-B5.5: both databases unopenable. Home lists and opens its project; the panel offers the reset. */
    const broken = await launch(profileRoot);
    try {
      await broken.page.goto('app://tau/');
      const panel = broken.page.getByRole('alert', { name: databasePanel });
      await panel.waitFor({ timeout: 60_000 });
      await broken.page.goto('app://tau/projects');
      await broken.page.getByRole('link', { name: 'Open Home project', exact: true }).click();
      await broken.page.waitForURL(/\/w\//u);
      await broken.page.goto('app://tau/');
      const reset = broken.page.getByRole('alert', { name: databasePanel }).getByRole('button', {
        name: 'Reset local database',
      });
      /* The panel's last button is reachable at the window floor (the WP11 sweep's database-panel row). */
      await broken.application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(400, 300);
      });
      await reset.scrollIntoViewIfNeeded();
      await expect.poll(async () => reset.isVisible()).toBe(true);
      /* Keep the restart from spawning a process this harness does not own: the next launch is this spec's. */
      await broken.application.evaluate(({ app }) => {
        app.relaunch = () => undefined;
      });
      const closed = broken.application.waitForEvent('close');
      await reset.click();
      await closed;
    } catch (error) {
      await broken.capture(`database-recovery-broken-${runId}`);
      throw error;
    }

    /* 3. T-B5.6: the old database is quarantined, the databases open, and the folder list returns from the grants. */
    const recoveryEntries = await readdir(join(profileRoot, 'recovery'));
    expect(recoveryEntries).toHaveLength(1);
    expect(await readdir(join(profileRoot, 'recovery', recoveryEntries[0]!, 'IndexedDB'))).toContain(
      'app_tau_0.indexeddb.leveldb',
    );
    const repaired = await launch(profileRoot);
    try {
      await repaired.page.goto('app://tau/projects');
      await expect.poll(async () => repaired.page.getByRole('link', { name: 'Open Folder project' }).count()).toBe(1);
      expect(await repaired.page.getByRole('alert', { name: databasePanel }).count()).toBe(0);
      expect(JSON.parse(await readFile(join(profileRoot, 'granted-roots.json'), 'utf8'))).toEqual([folder]);
      expect(await snapshot(join(profileRoot, 'home'))).toEqual(homeBefore);
    } catch (error) {
      await repaired.capture(`database-recovery-repaired-${runId}`);
      throw error;
    }
  });
});
