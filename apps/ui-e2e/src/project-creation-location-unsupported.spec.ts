import { expect, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { installProjectCreationFixture } from '#support/project-creation-location-fixture.js';
import { readIndexedDbProjectEvidence, readProjectStorageState } from '#support/project-storage-state.js';

test('Playwright WebKit exposes Home-only creation with no location picker', async ({ skip }) => {
  skip(server.browser !== 'webkit', 'The unsupported-capability proof runs in Playwright WebKit.');
  await target.setViewport({ width: 390, height: 844 });
  await installProjectCreationFixture({ projectName: 'WebKit Home Project' });
  await target.navigate('/');
  const editor = '.tiptap[contenteditable="true"], textarea[placeholder="Ask Tau to build anything..."]';
  await target.expectVisible(editor, 60_000);

  expect(await target.evaluate(() => 'showDirectoryPicker' in globalThis)).toBe(false);
  await target.expectCount(selectors.getByRole('button', { name: /^Create in/u }), 0);
  await target.click(selectors.getByRole('button', { name: 'Open chat options' }));
  await target.expectCount(selectors.getByRole('button', { name: /^Create in/u }), 0);
  await target.expectCount(selectors.getByText('Location', { exact: true }), 0);
  await target.keyboardPress('Escape');

  await target.fill(editor, 'Create in the only available Home location');
  await target.press(editor, 'Enter');
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);

  let state = await readProjectStorageState();
  expect(state.pin).toBe('indexeddb');
  expect(state.preference).toEqual({ kind: 'home' });
  expect(state.configs).toHaveLength(1);
  const homepageConfig = state.configs[0]!;
  expect(homepageConfig.backend).toBe('indexeddb');
  const homepageEvidence = await readIndexedDbProjectEvidence(homepageConfig.providerBasePath);
  expect(homepageEvidence).toBeDefined();
  expect(JSON.parse(homepageEvidence!.manifestText)).toMatchObject({
    id: homepageConfig.projectId,
    name: 'WebKit Home Project',
  });

  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByText('Home · in this browser', { exact: true }), 60_000);
  await target.expectCount(selectors.getByRole('button', { name: /^Create in/u }), 0);
  await target.fill(selectors.getByLabelText('Project Name *'), 'WebKit Route Project');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/webkit-route-project$/u, 60_000);

  state = await readProjectStorageState();
  expect(state.configs).toHaveLength(2);
  const routeConfig = state.configs.find(({ providerBasePath }) => providerBasePath.endsWith('/webkit-route-project'))!;
  expect(routeConfig.backend).toBe('indexeddb');
  expect(await readIndexedDbProjectEvidence(routeConfig.providerBasePath)).toBeDefined();
});
