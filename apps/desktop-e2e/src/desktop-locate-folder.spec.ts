/**
 * T-R4.6 (blueprint R4, D2 Locate…): a granted folder that moved on disk is relinked to its new place with its
 * projects, and keeps its workspace id.
 */
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectVisible } from '#support/scenario.js';

const projectId = 'proj_locatefolder00000000';

let session: DesktopSession | undefined;
let profileRoot: string | undefined;
let movedParent: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  if (profileRoot !== undefined) {
    await rm(profileRoot, { recursive: true, force: true });
    profileRoot = undefined;
  }
  if (movedParent !== undefined) {
    await rm(movedParent, { recursive: true, force: true });
    movedParent = undefined;
  }
});

/** One project in `folder`, as discovery reads it: a manifest and a generated identity. */
const seedProject = async (folder: string): Promise<void> => {
  const directory = join(folder, 'gearbox');
  await mkdir(join(directory, '.tau'), { recursive: true });
  await writeFile(join(directory, '.tau/project.json'), `${JSON.stringify({ version: 1, projectId })}\n`);
  await writeFile(
    join(directory, 'tau.json'),
    JSON.stringify({
      $schema: 'https://tau.new/schemas/tau-v1.json',
      name: 'Locate Gearbox',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts' } },
    }),
  );
  await writeFile(join(directory, 'main.ts'), 'export default () => undefined;\n');
};

test('relinks a moved folder through Locate and keeps its workspace id (T-R4.6)', async () => {
  session = await launchDesktopApp({ token: 'offline-preferences', preserveProfile: true });
  profileRoot = dirname(session.homeRoot);
  const original = session.pickedDirectory;
  await seedProject(original);
  const { page } = session;
  await page.goto('app://tau/files', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add workspace' }).first().click();
  await expectVisible(page.getByText(original).first(), 60_000);
  await page.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
  await page.getByText('Locate Gearbox').first().click();
  await page.waitForURL(/\/w\//u, { timeout: 60_000 });
  const workspaceSlugBefore = new URL(page.url()).pathname.split('/')[2];
  await session.close();
  session = undefined;

  movedParent = await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-moved-'));
  const moved = join(movedParent, 'tau-desktop-workspace');
  await rename(original, moved);

  session = await launchDesktopApp({
    token: 'offline-preferences',
    profileRoot,
    preserveProfile: true,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- The shell's environment variable name.
    env: { TAU_E2E_PICK_DIRECTORY: moved },
  });
  const relaunched = session.page;
  await relaunched.goto('app://tau/files', { waitUntil: 'domcontentloaded' });
  const group = relaunched.getByRole('button', { name: /Folders not found \(1\)/u });
  await expectVisible(group, 60_000);
  await group.click();
  await expectVisible(relaunched.getByText('Folder not found').first(), 30_000);

  await relaunched.getByRole('button', { name: 'Locate…' }).click();

  await expectVisible(relaunched.getByText(moved).first(), 60_000);
  await expect.poll(async () => relaunched.getByText('Folder not found').count(), { timeout: 30_000 }).toBe(0);
  await relaunched.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
  await relaunched.getByText('Locate Gearbox').first().click();
  await relaunched.waitForURL(/\/w\//u, { timeout: 60_000 });
  /* The workspace id never changes; its slug follows the folder name, which the move kept. */
  expect(new URL(relaunched.url()).pathname.split('/')[2]).toBe(workspaceSlugBefore);
}, 300_000);
