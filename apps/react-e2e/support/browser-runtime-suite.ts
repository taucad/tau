import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { summarizeGlb } from './glb-bounds';

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Playwright browser probe typing.
  interface Window {
    __tauReactE2eGlb?: Uint8Array<ArrayBuffer>;
    __tauReactE2eGeometryVersion?: number;
  }
}

export const waitForPublishedGeometry = async (page: Page): Promise<Uint8Array> => {
  await expect
    .poll(
      async () => {
        const status = await page.getByRole('status').textContent();
        if (status === 'error') {
          const message = await page.getByRole('alert').textContent();
          throw new Error(message ?? 'Runtime fixture entered error state without an error message');
        }

        return status;
      },
      { timeout: 120_000 },
    )
    .toBe('ready');
  await page.waitForFunction(() => window.__tauReactE2eGlb instanceof Uint8Array, null, {
    timeout: 120_000,
  });
  const bytes = await page.evaluate(() => Array.from(window.__tauReactE2eGlb ?? []));
  return Uint8Array.from(bytes);
};

export const expectCylinderRender = async (page: Page): Promise<void> => {
  const bytes = await waitForPublishedGeometry(page);
  const summary = summarizeGlb(bytes);
  expect(summary.bytes).toBeGreaterThan(1_000);
  expect(summary.meshes).toBeGreaterThan(0);
  expect(summary.primitives).toBeGreaterThan(0);
  expect(summary.size[0]).toBeGreaterThan(0.015);
  expect(summary.size[2]).toBeGreaterThan(0.015);
};

export const expectParameterUpdateChangesGeometry = async (page: Page): Promise<void> => {
  const beforeBytes = await waitForPublishedGeometry(page);
  const before = summarizeGlb(beforeBytes);
  const version = await page.evaluate(() => window.__tauReactE2eGeometryVersion ?? 0);

  await page.getByLabel('Radius').fill('14');
  await page.waitForFunction((previous) => (window.__tauReactE2eGeometryVersion ?? 0) > previous, version, {
    timeout: 120_000,
  });

  const afterBytes = await waitForPublishedGeometry(page);
  const after = summarizeGlb(afterBytes);
  expect(after.size[0]).toBeGreaterThan(before.size[0]);
};
