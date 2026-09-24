import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Put the chat in focus on a new branch of its own, the way a person does it.
 *
 * The composer offers no branch (C3): the Revisions pane makes the branch, and
 * its row's *Use in this chat* places the chat there.
 *
 * @param name - The new branch's name.
 * @returns Nothing.
 */
export const placeChatOnNewBranch = async (name: string): Promise<void> => {
  const openRevisions = selectors.getByRole('button', { name: /^Open Revisions\./u });
  await target.expectVisible(openRevisions, 60_000);
  await target.click(openRevisions);
  await target.click(selectors.getByRole('button', { name: 'New branch' }));
  await target.fill(selectors.getByLabelText('Name for the new branch'), name);
  await target.click(selectors.getByRole('button', { name: 'Create branch' }));
  const actions = selectors.getByRole('button', { name: `Actions for ${name}` });
  await target.expectVisible(actions, 60_000);
  await target.click(actions);
  await target.click(selectors.getByRole('menuitem', { name: `Use ${name} in this chat` }));
  await target.expectHidden(selectors.getByRole('menuitem', { name: `Use ${name} in this chat` }));
};
