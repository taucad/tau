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
