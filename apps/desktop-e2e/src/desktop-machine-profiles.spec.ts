/* oxlint-disable no-await-in-loop -- Each desktop interaction must settle before the next activation. */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Page } from 'playwright';
import { z } from 'zod';
import { readMachineSettings, serializeMachineSettings } from '@taucad/runtime/machine/settings';
import { launchDesktopApp } from '#support/desktop-app.js';

const choose = async (page: Page, label: string, name: string): Promise<void> => {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page
    .getByRole('option')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
};

const visible = async (page: Page, label: string, text: string): Promise<void> => {
  await expect.poll(async () => page.getByRole('combobox', { name: label, exact: true }).textContent()).toContain(text);
};

test('should manage profiles and restore their independent settings after a desktop restart', async () => {
  const profileRoot = await mkdtemp(join(tmpdir(), 'tau-machine-profiles-'));
  let session = await launchDesktopApp({ token: 'offline-preferences', profileRoot, preserveProfile: true });
  try {
    let { page } = session;
    page.setDefaultTimeout(15_000);
    await page.goto('app://tau/projects/new');
    await page.getByLabel('Project Name *').fill('Machine profiles');
    await page.getByRole('button', { name: /^Create Project/u }).click();
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const projectUrl = page.url();
    const settingsUrl = new URL(page.url());
    settingsUrl.searchParams.set('settings', 'machines');
    await page.goto(settingsUrl.href);
    const settings = page.getByRole('dialog').first();
    await settings.getByRole('button', { name: 'Simulated X1C', exact: true }).click();
    const add = settings.getByRole('button', { name: 'Add simulated X1C' });
    await expect.poll(async () => add.isEnabled(), { timeout: 60_000 }).toBe(true);
    await add.click();
    await expect.poll(async () => settings.textContent(), { timeout: 60_000 }).toContain('Simulated X1C is bound');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await visible(page, 'Profile', 'Default');
    await choose(page, 'Plate', 'Cool plate');
    await visible(page, 'Plate', 'Cool plate');
    await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
    await page.getByRole('textbox', { name: 'Profile name' }).fill('Production');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await visible(page, 'Profile', 'Production');
    await choose(page, 'Plate', 'Textured PEI plate');
    await choose(page, 'Profile', 'Default');
    await visible(page, 'Plate', 'Cool plate');
    await choose(page, 'Profile', 'Production');
    await visible(page, 'Plate', 'Textured PEI plate');
    await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
    await page.getByRole('textbox', { name: 'Profile name' }).fill('Batch');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await page.keyboard.press('Escape');
    await visible(page, 'Profile', 'Batch');
    const directories = await readdir(session.homeRoot);
    const project = directories.find((name) => name === 'machine-profiles');
    expect(project).toBeDefined();
    const settingsPath = join(session.homeRoot, project!, '.tau/machines/settings/bambu.x1c.json');
    await expect.poll(async () => readFile(settingsPath, 'utf8')).toContain('Batch');
    await writeFile(join(session.homeRoot, project!, 'main.scad'), 'cube([10, 10, 10]);\n');
    await session.capture('machine-profiles-before-restart');
    await session.close();
    // Offline binding fixtures retain the app's canonical record; the host validates them on restart.
    const machineRoot = join(profileRoot, 'config/machines');
    const binding = z
      .object({
        last: z.object({
          descriptor: z.object({}).loose(),
          snapshot: z.object({}).loose(),
          observedAt: z.string(),
        }),
      })
      .loose()
      .parse(JSON.parse(await readFile(join(machineRoot, 'simulated-x1c/machine.json'), 'utf8')));
    await Promise.all(
      [
        { id: 'second-x1c', name: 'Second X1C', providerId: 'bambu', model: 'X1C' },
        { id: 'mini', name: 'Mini', providerId: 'bambu-a1-mini', model: 'A1 mini' },
      ].map(async (machine) => {
        const record = {
          ...binding,
          version: 1,
          id: machine.id,
          name: machine.name,
          providerId: machine.providerId,
          physicalId: machine.id,
          // The binding configuration carries only provider fields; the name is the bind's, the candidate's is observed.
          configuration: {},
          candidate: {
            id: `${machine.providerId}:${machine.id}`,
            name: `${machine.model} at 127.0.0.1`,
            endpoint: { address: '127.0.0.1', interface: 'manual' },
            claimedIdentity: { model: machine.model },
            observedAt: binding.last.observedAt,
            expiresAt: binding.last.observedAt,
          },
          last: {
            ...binding.last,
            descriptor: { ...binding.last.descriptor, id: machine.id, name: machine.name, model: machine.model },
          },
        };
        await mkdir(join(machineRoot, machine.id));
        await writeFile(join(machineRoot, machine.id, 'machine.json'), JSON.stringify(record));
      }),
    );
    session = await launchDesktopApp({ token: 'offline-preferences', profileRoot, preserveProfile: true });
    page = session.page;
    page.setDefaultTimeout(15_000);
    await page.goto(projectUrl);
    await choose(page, 'Machine', 'Simulated X1C');
    await visible(page, 'Profile', 'Batch');
    await visible(page, 'Plate', 'Textured PEI plate');
    await choose(page, 'Machine', 'Second X1C');
    await visible(page, 'Profile', 'Batch');
    await visible(page, 'Plate', 'Textured PEI plate');
    await choose(page, 'Machine', 'Mini');
    await visible(page, 'Profile', 'Default');
    await choose(page, 'Plate', 'Smooth PEI plate');
    await visible(page, 'Plate', 'Smooth PEI plate');
    await choose(page, 'Machine', 'Simulated X1C');
    await visible(page, 'Profile', 'Batch');
    await visible(page, 'Plate', 'Textured PEI plate');
    await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
    await page.getByRole('button', { name: 'Reset to defaults', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm reset', exact: true }).click();
    await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await page.keyboard.press('Escape');
    await visible(page, 'Profile', 'Default');
    await visible(page, 'Plate', 'Cool plate');
    await session.capture('machine-profiles-final');
    // Admit the maximum profile count and a near-limit record through the real external-file watch.
    const saved = readMachineSettings({ bytes: new Uint8Array(await readFile(settingsPath)), typeId: 'bambu.x1c' });
    if (saved.status !== 'current') {
      throw new Error('The desktop did not persist an admitted settings record.');
    }
    const profiles = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [
        index === 0 ? 'default' : `profile-${index}`,
        index === 0
          ? saved.record.profiles['default']!
          : {
              name: `Profile ${index}`,
              configurations:
                index === 15
                  ? {
                      'future.owner': { version: '1', values: { opaque: 'x'.repeat(245_000) } },
                    }
                  : {},
            },
      ]),
    );
    const viewRoot = join(session.homeRoot, project!, '.tau/workbench/views');
    const viewFiles = await readdir(viewRoot);
    expect(viewFiles.length).toBeGreaterThan(0);
    const viewPath = join(viewRoot, viewFiles[0]!);
    const camera = async (): Promise<string> =>
      JSON.stringify(
        z
          .object({ camera: z.unknown() })
          .loose()
          .parse(JSON.parse(await readFile(viewPath, 'utf8'))).camera,
      );
    const measurements = [];
    for (const phase of [
      { name: 'baseline', activations: 20, opaque: '' },
      { name: 'near-limit', activations: 100, opaque: 'x'.repeat(245_000) },
    ]) {
      const bytes = serializeMachineSettings({
        record: {
          ...saved.record,
          activeProfile: 'profile-14',
          profiles: {
            ...profiles,
            'profile-15': {
              name: 'Profile 15',
              configurations: { 'future.owner': { version: '1', values: { opaque: phase.opaque } } },
            },
          },
        },
      });
      await writeFile(settingsPath, bytes);
      await visible(page, 'Profile', 'Profile 14');
      await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
      await expect.poll(async () => page.getByRole('button', { name: 'Save a copy' }).isDisabled()).toBe(true);
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          profileLongTasks?: number[];
          profileWork?: number[];
          profileTaskObserver?: PerformanceObserver;
        };
        state.profileLongTasks = [];
        state.profileWork = [];
        state.profileTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name.startsWith('tau.machine-settings.')) {
              state.profileWork?.push(entry.duration);
            } else if (entry.entryType === 'longtask') {
              state.profileLongTasks?.push(entry.duration);
            }
          }
        });
        state.profileTaskObserver.observe({ entryTypes: ['longtask', 'measure'] });
      });
      const durations: number[] = [];
      for (let index = 0; index < phase.activations; index += 1) {
        const name = index % 15 === 0 ? 'Default' : `Profile ${index % 15}`;
        let movedCamera: string | undefined;
        if (phase.name === 'near-limit' && index % 10 === 0) {
          const previous = await camera();
          const viewport = await page.locator('canvas:visible').first().boundingBox();
          if (!viewport || viewport.width < 500) {
            throw new Error('The desktop viewer canvas is unavailable.');
          }
          await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
          await page.mouse.down();
          await page.mouse.move(viewport.x + viewport.width / 2 + 80, viewport.y + viewport.height / 2 + 40, {
            steps: 10,
          });
          await page.mouse.up();
          await expect.poll(camera, { timeout: 20_000 }).not.toBe(previous);
          movedCamera = await camera();
        }
        const started = performance.now();
        await choose(page, 'Profile', name);
        await visible(page, 'Profile', name);
        expect(
          await page
            .getByRole('combobox', { name: 'Profile', exact: true })
            .evaluate((element) => element === document.activeElement),
        ).toBe(true);
        durations.push(performance.now() - started);
        if (movedCamera) {
          expect(await camera()).toBe(movedCamera);
        }
      }
      const longTasks = await page.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          profileLongTasks?: number[];
          profileWork?: number[];
          profileTaskObserver?: PerformanceObserver;
        };
        state.profileTaskObserver?.disconnect();
        return { longTasks: state.profileLongTasks ?? [], settingsWork: state.profileWork ?? [] };
      });
      expect(longTasks.settingsWork.length).toBeGreaterThan(phase.activations);
      expect(Math.max(...longTasks.settingsWork)).toBeLessThan(50);
      measurements.push({
        name: phase.name,
        bytes: new TextEncoder().encode(bytes).length,
        activations: durations.length,
        durations,
        ...longTasks,
      });
    }
    await writeFile(
      join(import.meta.dirname, '../../../out/test-results/desktop-e2e/machine-profiles-performance.json'),
      JSON.stringify(measurements),
    );
    console.info(
      JSON.stringify(
        measurements.map(({ durations, longTasks, settingsWork, ...measurement }) => ({
          ...measurement,
          maxInteraction: Math.max(...durations),
          maxSettingsWork: Math.max(...settingsWork),
          maxLongTask: Math.max(...longTasks),
          longTaskCount: longTasks.length,
        })),
      ),
    );
    await choose(page, 'Profile', 'Profile 15');
    await expect
      .poll(async () => page.getByRole('region', { name: 'Prepare' }).getByRole('alert').textContent())
      .toContain('unavailable');
    await choose(page, 'Profile', 'Default');
    await visible(page, 'Plate', 'Cool plate');
    await session.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 900);
    });
    const longName = 'Production profile '.repeat(6).trim();
    await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
    await page.getByRole('textbox', { name: 'Profile name' }).fill(longName);
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await page.keyboard.press('Escape');
    await visible(page, 'Profile', longName);
    const control = await page.getByRole('combobox', { name: 'Profile', exact: true }).boundingBox();
    expect(control).not.toBeNull();
    expect(control!.width).toBeLessThan(400);
    await session.capture('machine-profiles-limits');
  } catch (error) {
    await session.capture('machine-profiles-failure');
    throw error;
  } finally {
    await session.close();
    await rm(profileRoot, { recursive: true, force: true });
  }
});
