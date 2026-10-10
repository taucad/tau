import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';

/** Runs offline against the actual built shell, with a simulator-only binding in a disposable profile. */
test('should display the real storage diagnostic and automatically decode a failure still', async () => {
  const profileRoot = await mkdtemp(join(tmpdir(), 'tau-print-failure-'));
  let session = await launchDesktopApp({ token: 'offline-preferences', profileRoot, preserveProfile: true });
  try {
    let { page } = session;
    await page.setViewportSize({ width: 1440, height: 1000 });
    page.setDefaultTimeout(20_000);
    await page.goto('app://tau/projects/new');
    await page.getByLabel('Project Name *').fill('Simulated print failure');
    await page.getByRole('button', { name: /^Create Project/u }).click();
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const projectUrl = page.url();
    const settingsUrl = new URL(projectUrl);
    settingsUrl.searchParams.set('settings', 'machines');
    await page.goto(settingsUrl.href);
    const settings = page.getByRole('dialog').first();
    await settings.getByRole('button', { name: 'Simulated X1C', exact: true }).click();
    const add = settings.getByRole('button', { name: 'Add simulated X1C' });
    await expect.poll(async () => add.isEnabled(), { timeout: 60_000 }).toBe(true);
    await add.click();
    await expect.poll(async () => settings.textContent(), { timeout: 60_000 }).toContain('Simulated X1C is bound');
    await session.close();

    const bindingPath = join(profileRoot, 'config/machines/simulated-x1c/machine.json');
    const binding = JSON.parse(await readFile(bindingPath, 'utf8')) as Record<string, unknown>;
    expect(binding['providerId']).toBe('bambu-simulator');
    await writeFile(
      bindingPath,
      JSON.stringify({ ...binding, configuration: { logicalId: 'simulated-x1c', faults: ['storage-damaged'] } }),
    );
    session = await launchDesktopApp({ token: 'offline-preferences', profileRoot, preserveProfile: true });
    page = session.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    page.setDefaultTimeout(20_000);
    await page.goto(projectUrl);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect
      .poll(async () => page.getByText('The microSD card has damaged sector data.', { exact: false }).isVisible(), {
        timeout: 60_000,
      })
      .toBe(true);
    const image = page.getByRole('img', { name: 'Failure still from Simulated X1C', exact: true });
    await image.waitFor({ state: 'visible' });
    await expect
      .poll(async () =>
        image.evaluate((element: HTMLImageElement) => ({
          complete: element.complete,
          width: element.naturalWidth,
          height: element.naturalHeight,
        })),
      )
      .toEqual({ complete: true, width: 320, height: 180 });
    expect(await page.getByText('Camera at failure · 0500-402F', { exact: true }).isVisible()).toBe(true);
    await session.capture('bambu-storage-failure');
  } catch (error) {
    await session.capture('bambu-storage-failure-error');
    throw error;
  } finally {
    await session.close();
    await rm(profileRoot, { recursive: true, force: true });
  }
});
