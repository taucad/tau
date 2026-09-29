import { expect } from 'vitest';
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
  const whereYouAre = selectors.getByCss('[aria-label="Where you are"]');
  const newBranch = whereYouAre.getByRole('button', { name: 'New branch' });
  const save = whereYouAre.getByRole('button', { name: 'Save revision' });
  let ready: 'branch' | 'unsaved' | undefined;
  await expect.poll(async () => {
    if (await target.isVisible(newBranch)) { ready = 'branch'; }
    else if (await target.isVisible(save)) {
      const stripText = await target.textContent(whereYouAre);
      if (stripText?.includes('Not saved yet')) { ready = 'unsaved'; }
    }
    return ready;
  }, { timeout: 60_000 }).toBeDefined();
  if (ready === 'unsaved') {
    await target.click(save);
  }
  await target.expectVisible(newBranch, 60_000);
  await target.click(newBranch);
  await target.fill(selectors.getByLabelText('Name for the new branch'), name);
  await target.click(selectors.getByRole('button', { name: 'Create branch' }));
  const actions = selectors.getByRole('button', { name: `Actions for ${name}` });
  await target.expectVisible(actions, 60_000);
  await target.click(actions);
  const place = selectors.getByRole('menuitem', { name: `Use ${name} in this chat` });
  await target.click(place);
  // The menu closes immediately, before placement settles. Reopen it after its
  // action is enabled: this option is absent only when chatCheckoutIds places
  // the focused chat on this branch's checkout.
  await target.click(actions);
  await target.expectVisible(selectors.getByRole('menuitem', { name: `Rename ${name}…` }), 60_000);
  await target.expectCount(place, 0, 60_000);
  await target.keyboardPress('Escape');
};
