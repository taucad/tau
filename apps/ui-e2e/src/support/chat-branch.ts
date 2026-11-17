import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Put the chat in focus on a new branch of its own, the way a person does it.
 *
 * The composer offers no branch (C3): the History header's branch chip makes
 * the branch, and the ⋮ on the branch's chip in History's lanes places the
 * chat there with *Run this chat here* (D3, bee2a79e41). The chip of a branch
 * with no entries yet shows under *All branches* (D2).
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
  /* Making a branch leaves the files where they are, and *This branch* draws a branch with no entries of its own only
   * while the files are on it (D2, f42cb91a2b): the new branch's chip, and its ⋮, show under *All branches*. A
   * single-choice Radix ToggleGroup is a `radiogroup` of `radio` items, never a `group`. */
  const allBranches = selectors
    .getByRole('radiogroup', { name: 'Which branches to show' })
    .getByRole('radio', { name: 'All branches' });
  await target.click(allBranches, { timeout: 60_000 });
  await target.expectAttribute(allBranches, 'aria-checked', 'true');
  /* D3 (bee2a79e41) moved a branch's verbs onto its chip's ⋮ in History's lanes. Run this chat here is offered once
   * the new branch's checkout is in the projection and only while it would move the chat in focus, so the menu is
   * reopened until it is. */
  const more = selectors.getByRole('button', { name: `More for ${name}` });
  const runHere = selectors.getByRole('menuitem', { name: 'Run this chat here' });
  const branchMenu = selectors.getByRole('menu').getByText(name, { exact: true });
  await target.expectVisible(more, 60_000);
  await expect
    .poll(
      async () => {
        if (await target.isVisible(runHere)) {
          return true;
        }
        if (await target.isVisible(branchMenu)) {
          await target.keyboardPress('Escape');
          return false;
        }
        await target.click(more);
        return false;
      },
      { timeout: 60_000, interval: 1000 },
    )
    .toBe(true);
  await target.click(runHere);
  // The menu closes immediately, before placement settles. Reopen it: Run this
  // chat here is absent only once the focused chat is placed on this branch's
  // checkout.
  await target.click(more);
  await target.expectVisible(selectors.getByRole('menuitem', { name: /^Rename…/u }), 60_000);
  await target.expectCount(runHere, 0, 60_000);
  await target.keyboardPress('Escape');
};
