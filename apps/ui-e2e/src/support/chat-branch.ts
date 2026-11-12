import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Put the chat in focus on a new branch of its own, the way a person does it.
 *
 * The composer offers no branch (C3): the History header's branch chip makes
 * the branch, and its row's *Use in this chat* places the chat there.
 *
 * @param name - The new branch's name.
 * @returns Nothing.
 */
export const placeChatOnNewBranch = async (name: string): Promise<void> => {
  const openRevisions = selectors.getByRole('button', { name: /^Open History\./u });
  await target.expectVisible(openRevisions, 60_000);
  await target.click(openRevisions);
  /* The History header's branch chip is the branch menu, and New branch… is its last item (C2, 59f8f356a8). It is
   * offered once the files have an entry to start from; a project still without one is saved first. */
  const whereYouAre = selectors.getByCss('[aria-label="Where you are"]');
  const chip = whereYouAre.getByRole('button', { name: /^Branch: .+\. Switch branch$/u });
  const newBranch = selectors.getByRole('menuitem', { name: 'New branch…' });
  const save = whereYouAre.getByRole('button', { name: 'Save' });
  await target.expectVisible(chip, 60_000);
  const switchBranch = selectors.getByRole('menu').getByText('Switch branch', { exact: true });
  await expect
    .poll(
      async () => {
        if (await target.isVisible(newBranch)) {
          return true;
        }
        if (await target.isVisible(switchBranch)) {
          // The menu is open without New branch…: nothing is saved to branch from yet.
          await target.keyboardPress('Escape');
          if (await target.isVisible(save)) {
            await target.click(save);
          }
          return false;
        }
        await target.click(chip);
        return false;
      },
      { timeout: 60_000, interval: 1000 },
    )
    .toBe(true);
  await target.click(newBranch);
  await target.fill(selectors.getByLabelText('Branch name'), name);
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
