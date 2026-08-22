import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import {
  clickTarget,
  currentReactTarget,
  expectTargetCount,
  expectTargetText,
  expectTargetValue,
  fillTarget,
  navigateTarget,
  readTarget,
} from './external-target.js';

export type BrowserDeployment = 'isolated' | 'non-isolated';

type GeometrySummary = {
  readonly meshes: number;
  readonly primitives: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
};

const runtimeTimeout = 120_000;

export const getBrowserDeployment = (): BrowserDeployment => {
  const target = currentReactTarget();
  const { deployment } = target.metadata;
  if (deployment !== 'isolated' && deployment !== 'non-isolated') {
    throw new TypeError(`Project ${target.id} is missing valid deployment metadata.`);
  }
  return deployment;
};

export const openBrowserRuntime = async (): Promise<void> => {
  const deployment = getBrowserDeployment();
  const headers = await navigateTarget('/');
  if (deployment === 'isolated') {
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    await expectTargetText(selectors.getByLabelText('Browser isolation'), 'isolated');
    await expectTargetText(selectors.getByLabelText('Shared memory'), 'available');
    return;
  }

  expect(headers['cross-origin-opener-policy']).toBeUndefined();
  expect(headers['cross-origin-embedder-policy']).toBeUndefined();
  await expectTargetText(selectors.getByLabelText('Browser isolation'), 'non-isolated');
  await expectTargetText(selectors.getByLabelText('Shared memory'), 'unavailable');
};

const readGeometryNumber = async (label: string): Promise<number> => {
  const state = await readTarget(selectors.getByLabelText(label));
  const { text } = state;
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} did not contain a finite number: ${text ?? '<missing>'}`);
  }
  return value;
};

const readPublishedGeometry = async (): Promise<GeometrySummary> => {
  await expect
    .poll(
      async () => {
        const statusState = await readTarget(selectors.getByRole('status', { name: 'Runtime status', exact: true }));
        const { text: status } = statusState;
        if (status === 'error') {
          const errorState = await readTarget(selectors.getByRole('alert', { name: 'Runtime error', exact: true }));
          const { text: message } = errorState;
          throw new Error(message ?? 'Runtime fixture entered error state without an error message');
        }
        return status;
      },
      { timeout: runtimeTimeout },
    )
    .toBe('ready');

  return {
    meshes: await readGeometryNumber('Geometry mesh count'),
    primitives: await readGeometryNumber('Geometry primitive count'),
    width: await readGeometryNumber('Geometry width'),
    height: await readGeometryNumber('Geometry height'),
    depth: await readGeometryNumber('Geometry depth'),
  };
};

export const expectCylinderRender = async (): Promise<void> => {
  const summary = await readPublishedGeometry();
  expect(summary.meshes).toBeGreaterThan(0);
  expect(summary.primitives).toBeGreaterThan(0);
  expect(summary.width).toBeGreaterThan(0.015);
  expect(summary.depth).toBeGreaterThan(0.015);
};

export const expectRapidParameterChangesPublishLatestGeometry = async (): Promise<void> => {
  const before = await readPublishedGeometry();
  const radius: Locator = selectors.getByLabelText('Radius');

  await fillTarget(radius, '11');
  await fillTarget(radius, '14');
  await fillTarget(radius, '18');

  await expectTargetValue(radius, '18');
  await expectTargetCount(selectors.getByRole('alert', { name: 'Runtime error', exact: true }), 0);
  await expect
    .poll(
      async () => {
        const geometry = await readPublishedGeometry();
        return geometry.width;
      },
      { timeout: runtimeTimeout },
    )
    .toBeCloseTo(before.width * 1.8, 4);

  const after = await readPublishedGeometry();
  expect(after.depth).toBeCloseTo(before.depth * 1.8, 4);
  expect(after.height).toBeCloseTo(before.height, 4);
};

export const expectCooperativeTimeoutRecovery = async (): Promise<void> => {
  await clickTarget(selectors.getByRole('button', { name: 'Run delayed render', exact: true }));
  await expectTargetText(
    selectors.getByRole('status', { name: 'Cooperative timeout status', exact: true }),
    'runtime recovered after timeout',
  );
  await expectTargetCount(selectors.getByRole('alert', { name: 'Cooperative timeout error', exact: true }), 0);

  expect(await readGeometryNumber('Cooperative successor mesh count')).toBeGreaterThan(0);
  expect(await readGeometryNumber('Cooperative successor primitive count')).toBeGreaterThan(0);
  expect(await readGeometryNumber('Cooperative successor width')).toBeGreaterThan(0.015);
  expect(await readGeometryNumber('Cooperative successor height')).toBeGreaterThan(0.015);
  expect(await readGeometryNumber('Cooperative successor depth')).toBeGreaterThan(0.015);
};

export const expectHardTimeoutTermination = async (): Promise<void> => {
  await clickTarget(selectors.getByRole('button', { name: 'Run blocking render', exact: true }));
  await expectTargetText(
    selectors.getByRole('status', { name: 'Hard timeout status', exact: true }),
    'runtime terminated after timeout',
  );
  await expectTargetCount(selectors.getByRole('alert', { name: 'Hard timeout error', exact: true }), 0);
};
