import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';

export type BrowserDeployment = 'isolated' | 'non-isolated';

type GeometrySummary = {
  readonly meshes: number;
  readonly primitives: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
};

const runtimeTimeout = 120_000;

export const getBrowserDeployment = (testInfo: TestInfo): BrowserDeployment => {
  const { metadata }: { readonly metadata: Record<string, unknown> } = testInfo.project;
  const { deployment } = metadata;
  if (deployment !== 'isolated' && deployment !== 'non-isolated') {
    throw new TypeError(`Project ${testInfo.project.name} is missing valid deployment metadata.`);
  }
  return deployment;
};

export const openBrowserRuntime = async (page: Page, testInfo: TestInfo): Promise<void> => {
  const deployment = getBrowserDeployment(testInfo);
  const response = await page.goto('/');
  if (!response) {
    throw new Error('Browser runtime navigation did not return a document response.');
  }

  const headers = response.headers();
  if (deployment === 'isolated') {
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    await expect(page.getByLabel('Browser isolation')).toHaveText('isolated');
    await expect(page.getByLabel('Shared memory')).toHaveText('available');
    return;
  }

  expect(headers['cross-origin-opener-policy']).toBeUndefined();
  expect(headers['cross-origin-embedder-policy']).toBeUndefined();
  await expect(page.getByLabel('Browser isolation')).toHaveText('non-isolated');
  await expect(page.getByLabel('Shared memory')).toHaveText('unavailable');
};

const readGeometryNumber = async (page: Page, label: string): Promise<number> => {
  const text = await page.getByLabel(label).textContent();
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} did not contain a finite number: ${text ?? '<missing>'}`);
  }
  return value;
};

const readPublishedGeometry = async (page: Page): Promise<GeometrySummary> => {
  await expect
    .poll(
      async () => {
        const status = await page.getByRole('status', { name: 'Runtime status', exact: true }).textContent();
        if (status === 'error') {
          const message = await page.getByRole('alert', { name: 'Runtime error', exact: true }).textContent();
          throw new Error(message ?? 'Runtime fixture entered error state without an error message');
        }

        return status;
      },
      { timeout: runtimeTimeout },
    )
    .toBe('ready');

  return {
    meshes: await readGeometryNumber(page, 'Geometry mesh count'),
    primitives: await readGeometryNumber(page, 'Geometry primitive count'),
    width: await readGeometryNumber(page, 'Geometry width'),
    height: await readGeometryNumber(page, 'Geometry height'),
    depth: await readGeometryNumber(page, 'Geometry depth'),
  };
};

export const expectCylinderRender = async (page: Page): Promise<void> => {
  const summary = await readPublishedGeometry(page);
  expect(summary.meshes).toBeGreaterThan(0);
  expect(summary.primitives).toBeGreaterThan(0);
  expect(summary.width).toBeGreaterThan(0.015);
  expect(summary.depth).toBeGreaterThan(0.015);
};

export const expectRapidParameterChangesPublishLatestGeometry = async (page: Page): Promise<void> => {
  const before = await readPublishedGeometry(page);
  const radius = page.getByLabel('Radius');

  await radius.fill('11');
  await radius.fill('14');
  await radius.fill('18');

  await expect(radius).toHaveValue('18');
  await expect(page.getByRole('alert', { name: 'Runtime error', exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const geometry = await readPublishedGeometry(page);
        return geometry.width;
      },
      { timeout: runtimeTimeout },
    )
    .toBeCloseTo(before.width * 1.8, 4);

  const after = await readPublishedGeometry(page);
  expect(after.depth).toBeCloseTo(before.depth * 1.8, 4);
  expect(after.height).toBeCloseTo(before.height, 4);
};

export const expectCooperativeTimeoutRecovery = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Run delayed render', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Cooperative timeout status', exact: true })).toHaveText(
    'runtime recovered after timeout',
  );
  await expect(page.getByRole('alert', { name: 'Cooperative timeout error', exact: true })).toHaveCount(0);

  expect(await readGeometryNumber(page, 'Cooperative successor mesh count')).toBeGreaterThan(0);
  expect(await readGeometryNumber(page, 'Cooperative successor primitive count')).toBeGreaterThan(0);
  expect(await readGeometryNumber(page, 'Cooperative successor width')).toBeGreaterThan(0.015);
  expect(await readGeometryNumber(page, 'Cooperative successor height')).toBeGreaterThan(0.015);
  expect(await readGeometryNumber(page, 'Cooperative successor depth')).toBeGreaterThan(0.015);
};

export const expectHardTimeoutTermination = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Run blocking render', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Hard timeout status', exact: true })).toHaveText(
    'runtime terminated after timeout',
  );
  await expect(page.getByRole('alert', { name: 'Hard timeout error', exact: true })).toHaveCount(0);
};
