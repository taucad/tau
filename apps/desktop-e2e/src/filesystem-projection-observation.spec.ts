import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Page } from 'playwright';
import { serializeTodoList, todoListPath } from '@taucad/chat';
import { readMachineSettings, serializeMachineSettings } from '@taucad/runtime/machine/settings';
import { desktopE2ECompletedArtifact } from '#support/config.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import { gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  expectSignedIn,
  expectVisible,
  fileTreeItemOf,
  selectChatModel,
  submitPrompt,
} from '#support/scenario.js';

test('projects independent native source, directory and skill mutations into the mounted workspace', async () => {
  const session = await launchDesktopApp({ token: 'offline-preferences' });
  try {
    const { page } = session;
    await page.addInitScript(() => {
      localStorage.setItem('tau:flags', JSON.stringify({ pluginsStore: true }));
    });
    const query = new URLSearchParams({ chat: '1', observation: '1' });
    query.append('watch', 'public/models/honeycomb.js');
    query.append('watch', '.agents');
    await page.goto(`app://tau/__e2e/project-file-tree?${query}`);
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const slug = new URL(page.url()).pathname.split('/').at(-1);
    if (!slug) {
      throw new Error('The native fixture did not create a rooted project.');
    }
    const root = join(session.homeRoot, slug);
    if (
      !(await page
        .getByRole('region', { name: /^Files for /u })
        .first()
        .isVisible())
    ) {
      await page.getByRole('button', { name: /Search/u }).click();
      await page.getByPlaceholder('Search projects, chats, and actions…').fill('Open files');
      await page.getByText('Open files', { exact: true }).click();
    }
    const publicDirectory = fileTreeItemOf(page, 'public');
    await expectVisible(publicDirectory);
    if ((await publicDirectory.getAttribute('aria-expanded')) !== 'true') {
      await publicDirectory.click({ position: { x: 8, y: 14 } });
    }
    const modelsDirectory = fileTreeItemOf(page, 'public/models');
    await expectVisible(modelsDirectory);
    if ((await modelsDirectory.getAttribute('aria-expanded')) !== 'true') {
      await modelsDirectory.click({ position: { x: 8, y: 14 } });
    }
    const source = 'public/models/honeycomb.js';
    await fileTreeItemOf(page, source).click();
    const editor = page.locator('.monaco-editor:visible').last();
    await expectVisible(editor);
    const original = await readFile(join(root, source), 'utf8');
    await writeFile(join(root, source), `${original}\n// Native independent source observation\n`);
    await expect
      .poll(async () => editor.locator('.view-lines').textContent(), { timeout: 30_000 })
      .toContain('Native independent source observation');
    await editor.evaluate((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('The editor container is not an HTML element.');
      }
      element.dataset['observationRetained'] = 'yes';
    });
    const acquiredValue1 = await controlWatch(page, 'close', source);
    expect(acquiredValue1).toBeGreaterThan(0);
    await expectVisible(page.getByText('File updates unavailable', { exact: true }));
    await writeFile(join(root, source), `${original}\n// Native acknowledged retry observation\n`);
    await controlWatch(page, 'hold', source);
    await page.getByRole('button', { name: 'Retry file updates', exact: true }).click();
    const acquiredValue2 = await editor.locator('.view-lines').textContent();
    expect(acquiredValue2).toContain('Native independent source observation');
    const acquiredValue3 = await page.locator('.monaco-editor[data-observation-retained="yes"]').count();
    expect(acquiredValue3).toBe(1);
    await controlWatch(page, 'release', source);
    await expect
      .poll(async () => editor.locator('.view-lines').textContent(), { timeout: 30_000 })
      .toContain('Native acknowledged retry observation');
    const acquiredValue4 = await page.locator('.monaco-editor[data-observation-retained="yes"]').count();
    expect(acquiredValue4).toBe(1);
    const peer = 'public/models/native-observation-peer.js';
    await writeFile(join(root, peer), 'export default function main() { return []; }\n');
    await expectVisible(fileTreeItemOf(page, peer));
    await rm(join(root, peer));
    await expect.poll(async () => fileTreeItemOf(page, peer).count()).toBe(0);
    const skill = join(root, '.agents/skills/native-observation-peer/SKILL.md');
    await mkdir(join(root, '.agents/skills/native-observation-peer'), { recursive: true });
    await writeFile(
      skill,
      '---\nname: native-observation-peer\ndescription: Native integration skill\n---\nQualify native settled discovery.\n',
    );
    const composer = page.locator('[aria-label="Ask Tau to build anything..."]').last();
    await expectVisible(composer);
    await composer.fill('/native-observation-peer');
    await expectVisible(page.getByText('Native integration skill', { exact: true }));
    const acquiredValue5 = await controlWatch(page, 'close', '.agents');
    expect(acquiredValue5).toBeGreaterThan(0);
    await expectVisible(page.getByText('Skill updates unavailable', { exact: true }));
    await expect.poll(async () => page.getByText('Native integration skill', { exact: true }).count()).toBe(0);
    await controlWatch(page, 'reject', '.agents');
    await page.getByRole('button', { name: 'Retry skill updates', exact: true }).click();
    await expectVisible(page.getByText('Skill updates unavailable', { exact: true }));
    await controlWatch(page, 'hold', '.agents');
    await page.getByRole('button', { name: 'Retry skill updates', exact: true }).click();
    await expectVisible(page.getByText('Skill updates unavailable', { exact: true }));
    await controlWatch(page, 'release', '.agents');
    await expect.poll(async () => page.getByText('Skill updates unavailable', { exact: true }).count()).toBe(0);
    await expectVisible(page.getByText('Native integration skill', { exact: true }));
    await rm(skill);
    await expect.poll(async () => page.getByText('Native integration skill', { exact: true }).count()).toBe(0);
    const sourceDirectory = join(root, 'public/models');
    const acquiredValue6 = await stat(sourceDirectory);
    const mode = acquiredValue6.mode % 4096;
    const savedBytes = await readFile(join(root, source), 'utf8');
    await chmod(sourceDirectory, 0o555);
    try {
      const input = editor.locator('.native-edit-context, textarea.inputarea').last();
      await input.focus();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.insertText('\n// Unsaved native observation bytes\n');
      await expect
        .poll(async () => editor.locator('.view-lines').textContent())
        .toContain('Unsaved native observation bytes');
      const acquiredValue7 = await readFile(join(root, source), 'utf8');
      expect(acquiredValue7).toBe(savedBytes);
      const acquiredValue8 = await controlWatch(page, 'close', source);
      expect(acquiredValue8).toBeGreaterThan(0);
      await expectVisible(page.getByText('File updates unavailable', { exact: true }));
      await controlWatch(page, 'hold', source);
      await page.getByRole('button', { name: 'Retry file updates', exact: true }).click();
      const acquiredValue9 = await editor.locator('.view-lines').textContent();
      expect(acquiredValue9).toContain('Unsaved native observation bytes');
      await controlWatch(page, 'release', source);
      await expect.poll(async () => page.getByText('File updates unavailable', { exact: true }).count()).toBe(0);
      const acquiredValue10 = await editor.locator('.view-lines').textContent();
      expect(acquiredValue10).toContain('Unsaved native observation bytes');
      const acquiredValue11 = await readFile(join(root, source), 'utf8');
      expect(acquiredValue11).toBe(savedBytes);
    } finally {
      await chmod(sourceDirectory, mode);
    }
    await session.capture('observation-native-source-tree-catalog');
    await page.getByRole('link', { name: 'Plugins', exact: true }).click();
    await expectVisible(page.getByRole('heading', { name: 'Plugins', exact: true }));
    const acquiredValue12 = await controlWatch(page, 'close', '.agents');
    expect(acquiredValue12).toBeGreaterThan(0);
    await expectVisible(page.getByText('Skill updates unavailable', { exact: true }));
    await controlWatch(page, 'hold', '.agents');
    await page.getByRole('button', { name: 'Retry skill updates', exact: true }).click();
    await expectVisible(page.getByText('Skill updates unavailable', { exact: true }));
    await controlWatch(page, 'release', '.agents');
    await expect.poll(async () => page.getByText('Skill updates unavailable', { exact: true }).count()).toBe(0);
  } finally {
    await session.page.evaluate(() => {
      (
        globalThis as typeof globalThis & { __tauE2eObservationWatch?: { restore(): void } }
      ).__tauE2eObservationWatch?.restore();
    });
    await session.close();
  }
});

const choose = async (page: Page, label: string, name: string): Promise<void> => {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page
    .getByRole('option')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
};

const selected = async (page: Page, label: string, name: string): Promise<void> => {
  await expect.poll(async () => page.getByRole('combobox', { name: label, exact: true }).textContent()).toContain(name);
};

const controlWatch = async (
  page: Page,
  action: 'close' | 'hold' | 'reject' | 'release',
  path: string,
): Promise<number> =>
  page.evaluate(
    ({ action, path }) => {
      const control = (
        globalThis as typeof globalThis & {
          __tauE2eObservationWatch?: {
            close(path: string): number;
            hold(path: string): void;
            reject(path: string): void;
            release(path: string): void;
          };
        }
      ).__tauE2eObservationWatch;
      if (!control) {
        throw new Error('Native observation fixture controls are missing.');
      }
      if (action === 'close') {
        return control.close(path);
      }
      control[action](path);
      return 0;
    },
    { action, path },
  );

const openNativeSeed = async (page: Page, paths: readonly string[]): Promise<string> => {
  const query = new URLSearchParams({ chat: '1', observation: '1' });
  for (const path of paths) {
    query.append('watch', path);
  }
  await page.goto(`app://tau/__e2e/project-file-tree?${query}`);
  await page.waitForURL(/\/w\//u, { timeout: 60_000 });
  const slug = new URL(page.url()).pathname.split('/').at(-1);
  if (!slug) {
    throw new Error('Native observation fixture did not create a rooted project.');
  }
  if (
    !(await page
      .getByRole('region', { name: /^Files for /u })
      .first()
      .isVisible())
  ) {
    await page.getByRole('button', { name: /Search/u }).click();
    await page.getByPlaceholder('Search projects, chats, and actions…').fill('Open files');
    await page.getByText('Open files', { exact: true }).click();
  }
  const publicDirectory = fileTreeItemOf(page, 'public');
  await expectVisible(publicDirectory);
  if ((await publicDirectory.getAttribute('aria-expanded')) !== 'true') {
    await publicDirectory.click({ position: { x: 8, y: 14 } });
  }
  const modelsDirectory = fileTreeItemOf(page, 'public/models');
  await expectVisible(modelsDirectory);
  if ((await modelsDirectory.getAttribute('aria-expanded')) !== 'true') {
    await modelsDirectory.click({ position: { x: 8, y: 14 } });
  }
  return slug;
};

test('recovers native image content and the actual FileSelector after isolated directory closure', async () => {
  const session = await launchDesktopApp({ token: 'offline-preferences' });
  try {
    const { page } = session;
    const relative = 'public/models/native-observation-image.png';
    const slug = await openNativeSeed(page, [relative, 'public/models']);
    const path = join(session.homeRoot, slug, relative);
    const image = page.getByRole('img', { name: 'native-observation-image.png', exact: true });
    const bytes = async (width: number, height: number): Promise<Uint8Array<ArrayBuffer>> =>
      new Uint8Array(
        await page.evaluate(
          async ({ width, height }) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) {
              throw new Error('Native PNG fixture canvas is unavailable.');
            }
            context.fillStyle = '#0891b2';
            context.fillRect(0, 0, width, height);
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((value) => {
                if (value) {
                  resolve(value);
                } else {
                  reject(new Error('Native PNG encoding failed.'));
                }
              }, 'image/png');
            });
            return [...new Uint8Array(await blob.arrayBuffer())];
          },
          { width, height },
        ),
      );
    const dimensions = async (): Promise<readonly number[]> =>
      image.evaluate((element) => {
        if (!(element instanceof HTMLImageElement)) {
          throw new Error('Native image viewer did not render an image.');
        }
        return [element.naturalWidth, element.naturalHeight];
      });
    await writeFile(path, await bytes(8, 6));
    await expectVisible(fileTreeItemOf(page, relative));
    await fileTreeItemOf(page, relative).click();
    await expect.poll(dimensions, { timeout: 30_000 }).toEqual([8, 6]);
    const oldUrl = await image.getAttribute('src');
    await writeFile(path, await bytes(13, 9));
    await expect.poll(dimensions, { timeout: 30_000 }).toEqual([13, 9]);
    const acquiredValue13 = await image.getAttribute('src');
    expect(acquiredValue13).not.toBe(oldUrl);
    expect(
      await page.evaluate(async (url) => {
        if (!url) {
          throw new Error('The replaced native image had no captured URL.');
        }
        try {
          await fetch(url);
          return true;
        } catch {
          return false;
        }
      }, oldUrl),
    ).toBe(false);
    await rm(path);
    await expectVisible(page.getByText('File not found', { exact: true }));
    await expect.poll(async () => image.count()).toBe(0);
    await writeFile(path, await bytes(11, 7));
    await expect.poll(dimensions, { timeout: 30_000 }).toEqual([11, 7]);
    await rm(path);
    await expectVisible(page.getByText('File not found', { exact: true }));
    await page.getByRole('button', { name: 'Select file to edit…', exact: true }).click();
    const picker = page.locator('[data-slot="popover-content"]:has(input[placeholder="Search files…"])');
    await picker.getByRole('option').getByText('public', { exact: true }).click();
    await picker.getByRole('option').getByText('models', { exact: true }).click();
    await writeFile(join(session.homeRoot, slug, 'public/models/native-picker-recovery.png'), await bytes(17, 12));
    await expectVisible(picker.getByText('native-picker-recovery.png', { exact: true }));
    const acquiredValue14 = await controlWatch(page, 'close', 'public/models');
    expect(acquiredValue14).toBeGreaterThan(0);
    await expectVisible(picker.getByRole('button', { name: 'Retry', exact: true }));
    const peer = join(session.homeRoot, slug, 'public/models/native-picker-after-close.js');
    await writeFile(peer, 'export default function main() { return []; }\n');
    await controlWatch(page, 'hold', 'public/models');
    await picker.getByRole('button', { name: 'Retry', exact: true }).click();
    const acquiredValue15 = await picker.getByText('native-picker-after-close.js', { exact: true }).count();
    expect(acquiredValue15).toBe(0);
    await controlWatch(page, 'release', 'public/models');
    await expectVisible(picker.getByText('native-picker-after-close.js', { exact: true }));
    await picker.getByText('native-picker-recovery.png', { exact: true }).click();
    await expect
      .poll(
        async () =>
          page.getByRole('img', { name: 'native-picker-recovery.png', exact: true }).evaluate((element) => {
            if (!(element instanceof HTMLImageElement)) {
              throw new Error('Recovered native image is unavailable.');
            }
            return [element.naturalWidth, element.naturalHeight];
          }),
        { timeout: 30_000 },
      )
      .toEqual([17, 12]);
    await session.capture('observation-native-image-picker-recovered');
  } finally {
    await session.page.evaluate(() => {
      (
        globalThis as typeof globalThis & { __tauE2eObservationWatch?: { restore(): void } }
      ).__tauE2eObservationWatch?.restore();
    });
    await session.close();
  }
});

test('restores saved simulated machine profiles and observes independent native settings writes', async () => {
  const profileRoot = await mkdtemp(join(tmpdir(), 'tau-observation-settings-'));
  let session = await launchDesktopApp({ token: 'offline-preferences', profileRoot, preserveProfile: true });
  try {
    let { page } = session;
    const settingsRelative = '.tau/machines/settings/bambu.x1c.json';
    const query = new URLSearchParams({ chat: '1', observation: '1', watch: settingsRelative });
    await page.goto(`app://tau/__e2e/project-file-tree?${query}`);
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const projectUrl = page.url();
    const slug = new URL(projectUrl).pathname.split('/').at(-1);
    if (!slug) {
      throw new Error('Native settings fixture did not create a rooted project.');
    }
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = page.getByRole('dialog').first();
    await dialog
      .getByRole('navigation', { name: 'Settings navigation' })
      .getByRole('button', { name: 'Machines', exact: true })
      .click();
    await dialog.getByRole('button', { name: 'Simulated X1C', exact: true }).click();
    const add = dialog.getByRole('button', { name: 'Add simulated X1C' });
    await expect.poll(async () => add.isEnabled(), { timeout: 60_000 }).toBe(true);
    await add.click();
    await expect.poll(async () => dialog.textContent(), { timeout: 60_000 }).toContain('Simulated X1C is bound');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await selected(page, 'Profile', 'Default');
    await choose(page, 'Plate', 'Cool plate');
    await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Duplicate profile…', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name for the copy of Default', exact: true }).fill('Observation copy');
    await page.getByRole('button', { name: 'Duplicate profile', exact: true }).click();
    await selected(page, 'Profile', 'Observation copy');
    await choose(page, 'Plate', 'Textured PEI plate');
    await page.getByRole('combobox', { name: 'Material', exact: true }).click();
    await page
      .getByRole('option')
      .filter({ has: page.getByText(/ · PLA$/u) })
      .click();
    await selected(page, 'Material', 'PLA');
    const settingsPath = join(session.homeRoot, slug, settingsRelative);
    await expect.poll(async () => readFile(settingsPath, 'utf8')).toContain('Observation copy');
    const settingsDirectory = join(session.homeRoot, slug, '.tau/machines/settings');
    const acquiredValue16 = await stat(settingsDirectory);
    const mode = acquiredValue16.mode % 4096;
    await expect.poll(async () => page.getByText('Saving changes…', { exact: true }).count()).toBe(0);
    const savedBytes = await readFile(settingsPath, 'utf8');
    await chmod(settingsDirectory, 0o555);
    try {
      await choose(page, 'Plate', 'Cool plate');
      await expectVisible(page.getByRole('button', { name: 'Use latest saved settings', exact: true }));
      const acquiredValue17 = await readFile(settingsPath, 'utf8');
      expect(acquiredValue17).toBe(savedBytes);
      const acquiredValue18 = await controlWatch(page, 'close', settingsRelative);
      expect(acquiredValue18).toBeGreaterThan(0);
      const retry = page.getByRole('button', { name: 'Retry settings updates', exact: true });
      await expectVisible(retry);
      await controlWatch(page, 'reject', settingsRelative);
      await retry.click();
      await expectVisible(page.getByText(`Observation fixture rejected ${settingsRelative}.`, { exact: false }));
      await controlWatch(page, 'hold', settingsRelative);
      await retry.click();
      await selected(page, 'Plate', 'Cool plate');
      await controlWatch(page, 'release', settingsRelative);
      await expect.poll(async () => retry.count()).toBe(0);
      await selected(page, 'Plate', 'Cool plate');
      const acquiredValue19 = await readFile(settingsPath, 'utf8');
      expect(acquiredValue19).toBe(savedBytes);
    } finally {
      await chmod(settingsDirectory, mode);
    }
    await page.getByRole('button', { name: 'Use latest saved settings', exact: true }).click();
    await selected(page, 'Plate', 'Textured PEI plate');
    await session.capture('observation-settings-saved');
    await page.evaluate(() => {
      (
        globalThis as typeof globalThis & { __tauE2eObservationWatch?: { restore(): void } }
      ).__tauE2eObservationWatch?.restore();
    });
    await session.close();
    session = await launchDesktopApp({ token: 'offline-preferences', profileRoot, preserveProfile: true });
    page = session.page;
    await page.goto(projectUrl);
    await selected(page, 'Profile', 'Observation copy');
    await selected(page, 'Plate', 'Textured PEI plate');
    await selected(page, 'Material', 'PLA');
    const saved = readMachineSettings({ bytes: new Uint8Array(await readFile(settingsPath)), typeId: 'bambu.x1c' });
    if (saved.status !== 'current') {
      throw new Error('Native settings were not admitted after restart.');
    }
    const active = saved.record.activeProfile;
    const profile = saved.record.profiles[active];
    if (profile === undefined) {
      throw new Error('The saved profile is missing.');
    }
    await writeFile(
      settingsPath,
      serializeMachineSettings({
        record: {
          ...saved.record,
          profiles: { ...saved.record.profiles, [active]: { ...profile, name: 'Native peer profile' } },
        },
      }),
    );
    await selected(page, 'Profile', 'Native peer profile');
    await selected(page, 'Plate', 'Textured PEI plate');
    await selected(page, 'Material', 'PLA');
    await session.capture('observation-settings-native-peer');
  } finally {
    await session.close();
    await rm(profileRoot, { recursive: true, force: true });
  }
});

test('updates the mounted task list from independent native rooted file writes', async () => {
  const fixture = await startGatewayFixture({ toolCalls: [], textChunks: ['Native observation ready.'] });
  const account = tauTestAccount('filesystem-observation-todo');
  let session: Awaited<ReturnType<typeof launchDesktopApp>> | undefined;
  try {
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token });
    const { page } = session;
    await fixture.routeThrough(page);
    await page.reload();
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    if (desktopE2ECompletedArtifact) {
      await authenticatePackagedDesktop(session, token);
    }
    await expectSignedIn(page);
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, 'Prepare a local task list.');
    await expectVisible(page.getByText('Native observation ready.', { exact: true }), 120_000);
    const route = page.url();
    const path = join(session.homeRoot, slug, todoListPath(activeChatId(page)));
    await writeFile(
      path,
      serializeTodoList({
        version: 1,
        items: [
          { id: 'native-task', title: 'Inspect native observation', status: 'in_progress' },
          { id: 'native-finish', title: 'Finish native observation', status: 'pending' },
        ],
      }),
    );
    const first = page.getByRole('button', { name: 'Tasks: 0 of 2 done · Inspect native observation', exact: true });
    await expectVisible(first);
    await writeFile(
      path,
      serializeTodoList({
        version: 1,
        items: [
          { id: 'native-task', title: 'Inspect native observation', status: 'done' },
          { id: 'native-finish', title: 'Finish native observation', status: 'in_progress' },
        ],
      }),
    );
    await expectVisible(
      page.getByRole('button', { name: 'Tasks: 1 of 2 done · Finish native observation', exact: true }),
    );
    const acquiredValue20 = await first.count();
    expect(acquiredValue20).toBe(0);
    expect(page.url()).toBe(route);
    await session.capture('observation-todo-native-peer');
  } finally {
    try {
      await session?.close();
    } finally {
      try {
        await fixture.close();
      } finally {
        await deleteTauTestUser(account.email);
      }
    }
  }
});

test('includes and withdraws settled native catalog skills in actual gateway system prompts', async () => {
  const fixture = await startGatewayFixture({ toolCalls: [], textChunks: ['Native skill context received.'] });
  const account = tauTestAccount('filesystem-observation-skills');
  let session: Awaited<ReturnType<typeof launchDesktopApp>> | undefined;
  try {
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token });
    const { page } = session;
    await fixture.routeThrough(page);
    await page.reload();
    if (desktopE2ECompletedArtifact) {
      await authenticatePackagedDesktop(session, token);
    }
    await expectSignedIn(page);
    const slug = await openNativeSeed(page, ['.agents']);
    const skillRoot = join(session.homeRoot, slug, '.agents/skills/native-gateway-observation');
    await mkdir(skillRoot, { recursive: true });
    const description = 'Native gateway catalog qualification';
    await writeFile(
      join(skillRoot, 'SKILL.md'),
      `---\nname: native-gateway-observation\ndescription: ${description}\n---\nQualify native prompt selection.\n`,
    );
    const composer = page.locator('[aria-label="Ask Tau to build anything..."]').last();
    await expectVisible(composer);
    await composer.fill('/native-gateway-observation');
    await expectVisible(page.getByText(description, { exact: true }));
    await selectChatModel(page, gatewayFixtureModelName);
    await submitPrompt(page, 'Describe the settled native skill catalog.');
    await expectVisible(page.getByText('Native skill context received.', { exact: true }), 120_000);
    const first = fixture.gatewayRequests.at(-1) as { readonly system?: unknown } | undefined;
    expect(JSON.stringify(first?.system)).toContain(description);
    const acquiredValue21 = await controlWatch(page, 'close', '.agents');
    expect(acquiredValue21).toBeGreaterThan(0);
    await expectVisible(page.getByText('Skill updates unavailable', { exact: true }));
    await submitPrompt(page, 'Describe the currently available native catalog.');
    await expect.poll(() => fixture.gatewayRequests.length, { timeout: 120_000 }).toBe(2);
    await expect
      .poll(async () => page.getByText('Native skill context received.', { exact: true }).count(), { timeout: 120_000 })
      .toBe(2);
    const closed = fixture.gatewayRequests.at(-1) as { readonly system?: unknown } | undefined;
    expect(closed).toBeDefined();
    expect(JSON.stringify(closed?.system)).not.toContain(description);
    await session.capture('observation-native-gateway-skill-withdrawal');
  } finally {
    try {
      await session?.page.evaluate(() => {
        (
          globalThis as typeof globalThis & { __tauE2eObservationWatch?: { restore(): void } }
        ).__tauE2eObservationWatch?.restore();
      });
    } finally {
      try {
        await session?.close();
      } finally {
        try {
          await fixture.close();
        } finally {
          await deleteTauTestUser(account.email);
        }
      }
    }
  }
});

test('persists native per-chat composer drafts through chat replacement and reload', async () => {
  const session = await launchDesktopApp({ token: 'offline-preferences' });
  try {
    const { page } = session;
    await page.goto('app://tau/__e2e/chat-attachments?chats=2&seed=drafts');
    await page.waitForURL(/\/w\/[^/]+\/[^/?]+\?/u, { timeout: 60_000 });
    const ids = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('tau:e2e:chat-attachments') ?? 'null') as
          | {
              readonly projectId: string;
              readonly chatIds: readonly string[];
            }
          | undefined,
    );
    if (!ids?.chatIds[0] || !ids.chatIds[1]) {
      throw new Error('Native composer fixture did not create two chats.');
    }
    const composer = page.locator('[aria-label="Ask Tau to build anything..."]').first();
    await expectVisible(composer);
    const draft = 'Filesystem observation retained native draft.';
    await composer.fill(draft);
    const recordPath = join(session.homeRoot, '.tau/composers/chats', ids.projectId, `${ids.chatIds[0]}.json`);
    const persistedDraft = async (): Promise<string> => {
      const record = JSON.parse(await readFile(recordPath, 'utf8')) as {
        readonly draft?: { readonly parts: ReadonlyArray<{ readonly type: string; readonly text?: string }> };
      };
      return (record.draft?.parts ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('');
    };
    await expect.poll(persistedDraft, { timeout: 30_000 }).toBe(draft);
    await page.getByRole('link', { name: 'Second chat', exact: true }).click();
    await page.waitForURL(new RegExp(`[?&]chat=${ids.chatIds[1]}(?:&|$)`, 'u'));
    const acquiredValue22 = await composer.textContent();
    expect(acquiredValue22).not.toContain(draft);
    await page.getByRole('link', { name: 'Attachments chat', exact: true }).click();
    await expect.poll(async () => composer.textContent()).toContain(draft);
    await page.reload();
    await expect.poll(async () => composer.textContent(), { timeout: 60_000 }).toContain(draft);
    const acquiredValue23 = await persistedDraft();
    expect(acquiredValue23).toBe(draft);
    await session.capture('observation-native-composer-draft-reload');
  } finally {
    await session.close();
  }
});

const observationManualModes = [
  'files',
  'directory',
  'catalog',
  'settings',
  'drafts',
  'media',
  'parameters',
  'todo',
  'plugins',
] as const;
type ObservationManualAction = 'close' | 'hold' | 'reject' | 'release' | 'mutate' | 'delete' | 'screenshot' | 'end';
const installObservationManualControls = ({
  mode,
  actions,
}: {
  mode: string;
  actions: readonly ObservationManualAction[];
}) => {
  const state = { actions: [] as Array<{ id: number; action: ObservationManualAction; gesture: string }>, nextId: 0 };
  Object.assign(globalThis, { __tauObservationManual: state });
  document.title = `Tau observation manual · ${mode}`;
  const controls = document.createElement('aside');
  controls.setAttribute('aria-label', 'Observation fixture controls');
  controls.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  const gesture = document.createElement('input');
  gesture.placeholder = 'Gesture checkpoint name';
  gesture.setAttribute('aria-label', 'Gesture checkpoint name');
  controls.append(gesture);
  const status = document.createElement('output');
  status.setAttribute('aria-label', 'Fixture action status');
  status.dataset['observationActionStatus'] = '';
  status.textContent = 'No fixture action requested';
  controls.append(status);
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = `Fixture ${action}`;
    button.addEventListener('click', () => {
      if (action === 'screenshot' && !gesture.value.trim()) {
        gesture.focus();
        return;
      }
      if (state.actions.length < 16) {
        const id = ++state.nextId;
        status.dataset['requestId'] = String(id);
        status.textContent = `Fixture ${action} #${id}: pending`;
        state.actions.push({ id, action, gesture: gesture.value.trim().slice(0, 160) });
      }
    });
    controls.append(button);
  }
  document.body.append(controls);
  return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
};
const takeObservationManualActions = (): Array<{ id: number; action: ObservationManualAction; gesture: string }> => {
  const state = (
    globalThis as typeof globalThis & {
      __tauObservationManual: { actions: Array<{ id: number; action: ObservationManualAction; gesture: string }> };
    }
  ).__tauObservationManual;
  return state.actions.splice(0);
};

const nativeObservationManualMode = process.env['TAU_E2E_OBSERVATION_MANUAL'];
for (const mode of observationManualModes) {
  test.skipIf(nativeObservationManualMode !== mode)(`manual observation ${mode}`, async () => {
    const windowTitle = `Tau native observation manual · ${mode}`;
    const session = await launchDesktopApp({ token: 'offline-preferences', visible: true, windowTitle });
    try {
      const { page } = session;
      if (mode === 'plugins') {
        await page.addInitScript(() => {
          localStorage.setItem('tau:flags', JSON.stringify({ pluginsStore: true }));
        });
      }
      let root: string | undefined;
      const watchPath =
        mode === 'plugins'
          ? '.agents/plugins/installed.json'
          : mode === 'directory'
            ? 'public/models'
            : mode === 'catalog'
              ? '.agents'
              : mode === 'media'
                ? 'public/models/observation-image.png'
                : mode === 'settings'
                  ? '.tau/machines/settings/bambu.x1c.json'
                  : 'public/models/honeycomb.js';
      if (mode === 'drafts') {
        await page.goto('app://tau/__e2e/chat-attachments?chats=2&seed=drafts');
        await page.waitForURL(/\/w\//u, { timeout: 60_000 });
      } else if (mode === 'parameters') {
        await page.goto('app://tau/__e2e/user-project-thumbnail-generation');
        await page.waitForURL(/\/w\//u, { timeout: 60_000 });
      } else {
        const slug = await openNativeSeed(page, [watchPath, 'public/models']);
        root = mode === 'plugins' ? session.homeRoot : join(session.homeRoot, slug);
        if (mode === 'settings') {
          await page.keyboard.press('ControlOrMeta+,');
        }
      }
      const mutationPath =
        mode === 'plugins'
          ? '.agents/plugins/installed.json'
          : mode === 'todo'
            ? todoListPath(activeChatId(page))
            : mode === 'catalog'
              ? '.agents/skills/manual-observation/SKILL.md'
              : mode === 'media'
                ? watchPath
                : mode === 'files'
                  ? 'public/models/honeycomb.js'
                  : 'public/models/manual-observation-peer.js';
      const contents =
        mode === 'plugins'
          ? '{invalid-manual-installed-manifest'
          : mode === 'todo'
            ? serializeTodoList({
                version: 1,
                items: [
                  { id: 'manual-task', title: 'Inspect manual task observation', status: 'in_progress' },
                  { id: 'manual-finish', title: 'Finish manual task observation', status: 'pending' },
                ],
              })
            : mode === 'catalog'
              ? '---\nname: manual-observation\ndescription: Manual observation skill\n---\nActual native skill.\n'
              : 'export default function main() { return []; }\n';
      const imageBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=',
        'base64',
      );
      const actions: ObservationManualAction[] =
        mode === 'todo'
          ? ['mutate', 'delete', 'screenshot', 'end']
          : root
            ? mode === 'settings'
              ? ['close', 'hold', 'reject', 'release', 'screenshot', 'end']
              : ['close', 'hold', 'reject', 'release', 'mutate', 'delete', 'screenshot', 'end']
            : ['screenshot', 'end'];
      const identity = await page.evaluate(installObservationManualControls, { mode: `${mode} · native`, actions });
      const specSource = await readFile(new URL('filesystem-projection-observation.spec.ts', import.meta.url));
      const { createHash } = await import('node:crypto');
      const sourceSha256 = createHash('sha256').update(specSource).digest('hex');
      const deadline = Date.now() + 240_000;
      const receipt = {
        identity,
        windowTitle,
        mode,
        root,
        homeRoot: session.homeRoot,
        logPath: session.logPath,
        electronPid: session.application.process().pid,
        watchPath,
        mutationPath,
        sourceSha256,
        deadline,
        instructions:
          'Principal performs actual product gestures, including machine binding/settings changes. No physical print. Driver handles explicit fixture requests only.',
      };
      console.info('OBSERVATION MANUAL READY', JSON.stringify(receipt));
      await writeFile(
        join(session.homeRoot, `observation-manual-${mode}-ready.json`),
        JSON.stringify(receipt, null, 2),
      );
      let ended = false;
      let checkpoint = 0;
      while (!ended && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- Poll only explicit bounded fixture requests after READY.
        const requested = await page.evaluate(takeObservationManualActions);
        for (const request of requested) {
          const { id, action, gesture } = request;
          if (action === 'end') {
            ended = true;
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- Explicit named operator screenshot checkpoint.
          if (action === 'screenshot') {
            const capturedAt = Date.now();
            // oxlint-disable-next-line no-await-in-loop -- Capture current document identity for this explicit screenshot.
            const captureIdentity = await page.evaluate(() => ({
              href: location.href,
              title: document.title,
              timeOrigin: performance.timeOrigin,
            }));
            // oxlint-disable-next-line no-await-in-loop -- Only an explicit named checkpoint captures the native window.
            const directory = await session.capture(`observation-manual-${mode}-${++checkpoint}`);
            const screenshotFile = join(directory, 'screenshot.png');
            // oxlint-disable-next-line no-await-in-loop -- Read the exact saved PNG; missing capture must fail, not mint a receipt.
            const bytes = await readFile(screenshotFile);
            const screenshotSha256 = createHash('sha256').update(bytes).digest('hex');
            let installedManifestSha256: string | undefined;
            if (mode === 'plugins') {
              try {
                // oxlint-disable-next-line no-await-in-loop -- Passive exact Home manifest hash after Principal install/guard gestures.
                const installedManifestBytes = await readFile(join(session.homeRoot, '.agents/plugins/installed.json'));
                installedManifestSha256 = createHash('sha256').update(installedManifestBytes).digest('hex');
              } catch (error) {
                if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                  throw error;
                }
              }
            }

            // oxlint-disable-next-line no-await-in-loop -- Paired receipt beside the actual native screenshot.
            await writeFile(
              join(directory, 'screenshot-receipt.json'),
              JSON.stringify(
                {
                  ...receipt,
                  initialIdentity: receipt.identity,
                  identity: captureIdentity,
                  screenshotFile,
                  screenshotSha256,
                  installedManifestSha256,
                  bytes: bytes.byteLength,
                  gesture,
                  capturedAt,
                },
                null,
                2,
              ),
            );
          } else if (root && action === 'mutate') {
            const path = join(root, mutationPath);
            // oxlint-disable-next-line no-await-in-loop -- Fixed-path native mutation requested by operator.
            await mkdir(join(path, '..'), { recursive: true });
            // oxlint-disable-next-line no-await-in-loop -- Actual native bytes, no forged change event.
            await writeFile(path, mode === 'media' ? imageBytes : contents);
          } else if (root && action === 'delete') {
            // oxlint-disable-next-line no-await-in-loop -- Explicit fixed-path native deletion.
            await rm(join(root, mutationPath), { force: true });
          } else if (action === 'close' || action === 'hold' || action === 'reject' || action === 'release') {
            // oxlint-disable-next-line no-await-in-loop -- Existing exact-path watch controls only.
            const closed = await controlWatch(page, action, watchPath);
            // oxlint-disable-next-line no-await-in-loop -- Save actual provider-control evidence after the acknowledged action.
            const evidence = await page.evaluate(() => {
              const control = (
                globalThis as typeof globalThis & {
                  __tauE2eObservationWatch?: {
                    evidence(): {
                      registrations: Record<string, number>;
                      disposed: number;
                      active: Array<{ path: string; watches: number }>;
                    };
                  };
                }
              ).__tauE2eObservationWatch;
              if (!control) {
                throw new Error('Native observation fixture controls are missing.');
              }
              return control.evidence();
            });
            const completedAt = Date.now();
            // oxlint-disable-next-line no-await-in-loop -- Preserve the actual action receipt before displaying completion.
            await writeFile(
              join(session.homeRoot, `observation-manual-${mode}-action-${id}.json`),
              JSON.stringify({ id, action, watchPath, closed, evidence, completedAt, sourceSha256 }, null, 2),
            );
          }
          // oxlint-disable-next-line no-await-in-loop -- A finished older request must not overwrite newer pending status.
          await page.evaluate(
            ({ id, action }) => {
              const status = document.querySelector<HTMLOutputElement>('[data-observation-action-status]');
              if (status?.dataset['requestId'] === String(id)) {
                status.textContent = `Fixture ${action} #${id}: complete`;
              }
            },
            { id, action },
          );
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded fixture-only cadence, no product-state polling.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      expect(ended).toBe(true);
    } finally {
      await session.close();
    }
  });
}
