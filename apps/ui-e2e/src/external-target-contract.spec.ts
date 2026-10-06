import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

test('preserves native locator semantics and plain target evidence', async () => {
  await target.navigate('/projects/new');

  const nameInput = selectors.getByCss('.container').getByLabelText('Project Name *').first();
  await target.expectVisible(selectors.getByRole('heading', { name: /create new project/i }));
  await target.expectVisible(selectors.getByText('Create New Project', { exact: true }));
  await target.focus(nameInput);
  await target.expectFocused(nameInput);
  await target.fill(nameInput, 'Selector Contract');
  await target.expectValue(nameInput, 'Selector Contract');
  expect(await target.getAttribute(nameInput, 'id')).toBe('project-name');
  const inputBox = await target.boundingBox(nameInput);
  expect(inputBox?.height).toBeGreaterThan(0);
  expect(inputBox?.width).toBeGreaterThan(0);
  expect(await target.screenshot(nameInput)).toMatch(/^[A-Za-z0-9+/]+=*$/u);

  await target.navigate('/__e2e/project-creation-location?fixture=selector-contract');
  const status = selectors.getByTestId('project-creation-location-fixture');
  await target.expectVisible(selectors.getByTestId('missing-contract-node').or(status), 60_000);
  await target.expectVisible(selectors.getByText(/fixture ready$/i).first());
  await target.expectText(status, 'Project creation location fixture ready');
});

test('preserves the secondary surface when optional command arguments are omitted', async () => {
  await target.navigate('/__e2e/project-creation-location?fixture=secondary-surface-contract');
  await target.openSecondary('/projects/new');
  try {
    const heading = selectors.getByRole('heading', { name: /create new project/i });
    await target.expectVisible(heading, 60_000, 'secondary');
    expect(await target.screenshot(heading, undefined, 'secondary')).toMatch(/^[A-Za-z0-9+/]+=*$/u);
  } finally {
    await target.closeSecondary();
  }
});

test('persists recovery evidence through the real primary command without opening a secondary target', async () => {
  await target.navigate('/projects/new');
  const before = await target.evaluateWarehouseRecoveryArtifact(
    (value: unknown) => ({
      identity: { root: 'checked-root', candidateSceneId: 'candidate-1', receivedArgument: value },
      inventory: { surfaces: [{ componentId: 'component-1', drawTriangles: 12 }] },
    }),
    false,
    's15-webgl-warehouse-recovery-before.json',
  );
  const expectedBefore = {
    identity: { root: 'checked-root', candidateSceneId: 'candidate-1', receivedArgument: false },
    inventory: { surfaces: [{ componentId: 'component-1', drawTriangles: 12 }] },
  };
  const beforeBytes = new TextEncoder().encode(JSON.stringify(expectedBefore, undefined, 2));
  const beforeSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', beforeBytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  expect(before.identity).toEqual(expectedBefore.identity);
  expect(before.byteLength).toBe(beforeBytes.byteLength);
  expect(before.sha256).toBe(beforeSha256);
  expect(before.path).toMatch(/\/s15-webgl-warehouse-recovery-before\.json$/u);

  const after = await target.evaluateWarehouseRecoveryArtifact(
    (value: unknown) => ({ identity: { root: 'checked-root', receivedArgument: value }, inventory: { surfaces: [] } }),
    undefined,
    's15-webgl-warehouse-recovery-after.json',
  );
  const expectedAfter = { identity: { root: 'checked-root', receivedArgument: null }, inventory: { surfaces: [] } };
  const afterBytes = new TextEncoder().encode(JSON.stringify(expectedAfter, undefined, 2));
  const afterSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', afterBytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  expect(after.identity).toEqual(expectedAfter.identity);
  expect(after.byteLength).toBe(afterBytes.byteLength);
  expect(after.sha256).toBe(afterSha256);
  expect(after.path).toMatch(/\/s15-webgl-warehouse-recovery-after\.json$/u);
});
