import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';

const schema = 'https://tau.new/schemas/tau-v1.json';
const source = 'cube([3, 4, 5]);\n';

/** Seed authored bytes only; admission must create its own identity metadata. */
const seedProject = async (root: string, name: string, legacyId?: string): Promise<void> => {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'tau.json'),
    JSON.stringify({
      $schema: legacyId ? 'https://tau.new/schemas/tau-schema-v1.json' : schema,
      ...(legacyId ? { id: legacyId } : {}),
      name,
      description: 'Local identity acceptance',
      tags: [],
      assets: { main: { entryPath: 'main.scad' } },
    }),
  );
  await writeFile(join(root, 'main.scad'), source);
};

/** Read the host-created identity rather than inferring it from a route. */
const readIdentity = async (root: string): Promise<{ version: number; projectId: string }> =>
  JSON.parse(await readFile(join(root, '.tau/project.json'), 'utf8')) as { version: number; projectId: string };

it.runIf(process.platform === 'darwin')(
  'should migrate a legacy desktop project automatically and retain its identity across restart',
  async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-identity-legacy-'));
    const root = join(profileRoot, 'home/legacy-identity');
    const projectId = `proj_${randomBytes(16).toString('hex').slice(0, 21)}`;
    let session: DesktopSession | undefined;
    try {
      await seedProject(root, 'Legacy identity', projectId);
      session = await launchDesktopApp({ token: 'offline-identity-acceptance', profileRoot, preserveProfile: true });
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: 'Open Legacy identity', exact: true }).click();
      await session.page.waitForURL(/\/w\//u);
      await expect.poll(async () => readIdentity(root), { timeout: 60_000 }).toEqual({ version: 1, projectId });
      const declaration = JSON.parse(await readFile(join(root, 'tau.json'), 'utf8')) as Record<string, unknown>;
      expect(declaration).toMatchObject({ $schema: schema, name: 'Legacy identity' });
      expect(declaration).not.toHaveProperty('id');
      expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(source);
      await session.close();
      session = await launchDesktopApp({ token: 'offline-identity-acceptance', profileRoot, preserveProfile: true });
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: 'Open Legacy identity', exact: true }).click();
      await session.page.waitForURL(/\/w\//u);
      expect(await readIdentity(root)).toEqual({ version: 1, projectId });
      expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(source);
    } catch (error) {
      await session?.capture('identity-legacy');
      throw error;
    } finally {
      await session?.close();
      await removeDesktopRoot(profileRoot);
    }
  },
);

it.runIf(process.platform === 'darwin')(
  'should admit a hand-authored ID-free project and give its UI duplicate a fresh identity',
  async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-identity-authored-'));
    const home = join(profileRoot, 'home');
    const root = join(home, 'authored-identity');
    let session: DesktopSession | undefined;
    try {
      await seedProject(root, 'Authored identity');
      expect(await readdir(root)).toEqual(expect.not.arrayContaining(['.tau']));
      session = await launchDesktopApp({ token: 'offline-identity-acceptance', profileRoot, preserveProfile: true });
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: 'Open Authored identity', exact: true }).waitFor();
      const original = await readIdentity(root);
      expect(original.version).toBe(1);
      expect(original.projectId).toMatch(/^proj_[\dA-Za-z]{21}$/u);
      await session.page.getByRole('button', { name: 'Actions for Authored identity', exact: true }).click();
      await session.page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
      // Identity is reserved before files are copied; the UI reports the completed transaction.
      await session.page.getByText('Duplicated Authored identity', { exact: true }).waitFor({ timeout: 60_000 });
      await expect
        .poll(
          async () => {
            const names = await readdir(home);
            return names.filter((name) => name.startsWith('authored-identity'));
          },
          {
            timeout: 60_000,
          },
        )
        .toHaveLength(2);
      const names = await readdir(home);
      const duplicateName = names.find((name) => name.startsWith('authored-identity') && name !== 'authored-identity');
      expect(duplicateName).toBeDefined();
      const duplicateRoot = join(home, duplicateName!);
      await expect
        .poll(async () => readIdentity(duplicateRoot), { timeout: 60_000 })
        .toMatchObject({
          version: 1,
        });
      const duplicateIdentity = await readIdentity(duplicateRoot);
      expect(duplicateIdentity.projectId).toMatch(/^proj_[\dA-Za-z]{21}$/u);
      expect(duplicateIdentity.projectId).not.toBe(original.projectId);
      expect(await readFile(join(duplicateRoot, 'main.scad'), 'utf8')).toBe(source);
      expect(JSON.parse(await readFile(join(duplicateRoot, 'tau.json'), 'utf8'))).not.toHaveProperty('id');
      await session.close();
      session = await launchDesktopApp({ token: 'offline-identity-acceptance', profileRoot, preserveProfile: true });
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: 'Open Authored identity (Copy)', exact: true }).click();
      await session.page.waitForURL(/\/w\//u);
      expect(await readIdentity(duplicateRoot)).toEqual(duplicateIdentity);
      expect(await readIdentity(root)).toEqual(original);
      expect(await readFile(join(duplicateRoot, 'main.scad'), 'utf8')).toBe(source);
      expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(source);
    } catch (error) {
      await session?.capture('identity-authored');
      throw error;
    } finally {
      await session?.close();
      await rm(profileRoot, { recursive: true, force: true });
    }
  },
);
