/**
 * The project lifecycle journey (W30): a project with chats goes to the Trash from the library without being opened,
 * the Trash lists it alone, and it is deleted permanently from there (#2303, #2305).
 *
 * A trashed project is never open, so its chats are verified from their logs under a lease, not through a session. The
 * Tau Cloud half of the IDN-3 drill (publish, Delete from Tau Cloud, the Share panel's "no cloud copy", #2304) needs an
 * API this tier does not start; `project-share-panel.test.tsx` holds its row.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  readProjectLibraryEvidence,
  readProjectStorageState,
  readProjectTree,
} from '#support/project-storage-state.js';

const projectNames = { a: 'Project Navigation A', b: 'Project Navigation B' } as const;
const projectRoute = /\/w\/[^/]+\/[^/]+$/u;
const projectLink = (name: string) => selectors.getByRole('link', { name, exact: true }).first();
const actionsOf = (name: string) => selectors.getByRole('button', { name: `Actions for ${name}` });

test('trashes a closed project with chats from the library, lists only the Trash, and deletes it permanently', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  /* The fixture seeds A and B, each with its first chat, and opens A; B is never opened. */
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(projectRoute, 60_000);
  const { configs } = await readProjectStorageState();
  const names = await Promise.all(
    configs.map(async (config) => {
      const tree = await readProjectTree(config);
      const manifest = tree['/tau.json'];
      return manifest === undefined ? undefined : (JSON.parse(manifest) as { name: string }).name;
    }),
  );
  const configB = configs[names.indexOf(projectNames.b)];
  if (!configB) {
    throw new Error('The fixture did not seed Project Navigation B.');
  }

  await target.navigate('/projects');
  await target.expectVisible(projectLink(projectNames.b), 60_000);
  await target.click(projectLink(projectNames.b), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Move to Trash' }));
  await target.expectVisible(selectors.getByText(`Moved ${projectNames.b} to Trash`), 30_000);
  await expect
    .poll(
      async () => {
        const evidence = await readProjectLibraryEvidence(configB.projectId);
        return evidence.deletedAt;
      },
      { timeout: 30_000 },
    )
    .toBeTypeOf('number');

  /* #2305: the Trash is the trashed project alone. */
  await target.navigate('/projects?trash=1');
  await target.expectVisible(actionsOf(projectNames.b), 60_000);
  await target.expectCount(actionsOf(projectNames.a), 0);

  /* #2303: deleted permanently with no restore and no open. */
  await target.click(actionsOf(projectNames.b));
  await target.click(selectors.getByRole('menuitem', { name: 'Delete permanently' }));
  const dialog = selectors.getByRole('alertdialog');
  await target.expectVisible(dialog.getByText('Delete this project permanently?'), 30_000);
  await target.click(dialog.getByRole('button', { name: 'Delete permanently' }));
  await target.expectVisible(selectors.getByText(`Permanently deleted ${projectNames.b}`), 30_000);
  await target.expectCount(actionsOf(projectNames.b), 0, 30_000);
  await expect
    .poll(
      async () => {
        const state = await readProjectStorageState();
        return state.configs.map((config) => config.projectId);
      },
      { timeout: 30_000 },
    )
    .not.toContain(configB.projectId);
});
