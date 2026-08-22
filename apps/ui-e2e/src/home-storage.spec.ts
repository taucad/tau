import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readProjectStorageState } from '#support/project-storage-state.js';

const createHomeProject = async (name: string): Promise<void> => {
  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), name);
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
};

describe('Home storage engine selection', () => {
  test('prefers and pins OPFS when sync access handles are available', async () => {
    await createHomeProject('OPFS Home Browser Test');

    const state = await readProjectStorageState();
    expect({ pin: state.pin, projectBackends: state.configs.map(({ backend }) => backend) }).toEqual({
      pin: 'opfs',
      projectBackends: ['opfs'],
    });
  });

  test('degrades and pins IndexedDB when the OPFS requirement probe is unavailable', async () => {
    await target.addInitScript(() => {
      Object.defineProperty(navigator.storage, 'getDirectory', { configurable: true, value: undefined });
    });
    await createHomeProject('IndexedDB Home Browser Test');

    const state = await readProjectStorageState();
    expect({ pin: state.pin, projectBackends: state.configs.map(({ backend }) => backend) }).toEqual({
      pin: 'indexeddb',
      projectBackends: ['indexeddb'],
    });
  });
});
