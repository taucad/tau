import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import {
  awaitSaved,
  focusSource,
  openBackupChooser,
  openFixture,
  openSourceFile,
  replaceSource,
  revisionChip,
  saveShortcut,
  visibleRevisionsPanel,
} from '#support/revision-session.js';
import * as target from '#support/external-target.js';

/**
 * How long the save stays offline: past the sync debounce (2 s) and the first
 * two retry backoffs (5 s, then 10 s), so the attempts the worker makes while
 * offline fall inside it, and a push or a *Backed up* one produced is seen.
 */
const offlineWindowMilliseconds = 17_000;

/** The Sync row's status line: what is backed up, and whether this device is offline. */
const backupStatus = (): Locator =>
  selectors.getByCss(`${visibleRevisionsPanel} [role="status"][aria-label="Backup status"]`);

/** Link the open project to the fixture's repository through the Sync region's picker. */
const linkThroughPicker = async (repositoryFullName: string): Promise<void> => {
  try {
    await openBackupChooser();
  } catch (error) {
    await target.screenshot(undefined, 'github-chooser-failure.png');
    throw error;
  }
  await target.click(selectors.getByRole('radio', { name: 'Git remote' }));
  const repository = selectors.getByRole('button', { name: /^Repository\b/u });
  await target.expectVisible(repository, 60_000);
  await target.click(repository);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${repositoryFullName}\\b`, 'u') }));
  await target.expectVisible(selectors.getByRole('button', { name: /^Branch main\b/u }), 30_000);
  await target.click(selectors.getByRole('button', { name: 'Connect repository', exact: true }));
};

/** Wait for the Sync row to read `sentence` as its first words. */
const awaitBackup = async (sentence: RegExp, timeout = 120_000): Promise<void> => {
  await expect.poll(async () => (await target.textContent(backupStatus())) ?? '', { timeout }).toMatch(sentence);
};

/**
 * Record every Sync row and chip sentence the page shows from now on, so a
 * *Backed up* that flashes between two polls is still seen.
 */
test('keeps GitHub read-only until approval and a separate explicit push, including after reconnect', async () => {
  const linked = await target.commands.uiStartLinkedGithubFixture();
  const shortcut = await saveShortcut();
  await openFixture('');
  await openSourceFile();
  await focusSource();
  await replaceSource('// explicit GitHub push');
  await target.keyboardPress(shortcut);
  await awaitSaved();
  await target.click(revisionChip());
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel), 30_000);
  await linkThroughPicker(linked.repositoryFullName);
  await awaitBackup(/^Saved locally/u);
  const linkedState = await target.commands.uiReadLinkedGithubFixture();
  expect(linkedState.pushes).toBe(0);
  await target.click(selectors.getByRole('button', { name: 'Enable writes', exact: true }));
  await target.expectVisible(selectors.getByRole('alertdialog'));
  await target.screenshot(undefined, 'github-enable-writes');
  await target.click(selectors.getByRole('button', { name: 'Enable repository writes', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Disable writes', exact: true }));
  const approved = await target.commands.uiReadLinkedGithubFixture();
  expect(approved.pushes).toBe(0);
  expect(approved.writeTokens).toBe(0);
  await target.screenshot(undefined, 'github-ready-to-push');
  await target.click(selectors.getByRole('button', { name: 'Push to GitHub', exact: true }));
  await target.expectVisible(selectors.getByText('Push completed.', { exact: true }), 60_000);
  const pushed = await target.commands.uiReadLinkedGithubFixture();
  expect(pushed.pushes).toBeGreaterThan(0);
  expect(pushed.commits).toBeGreaterThan(0);
  expect(pushed.writeTokens).toBe(1);
  expect(pushed.uncredited).toBe(0);

  await openSourceFile();
  await focusSource();
  await target.commands.uiSetTargetOffline(true);
  await replaceSource('// saved offline without GitHub upload');
  await target.keyboardPress(shortcut);
  await awaitSaved();
  await target.delay(offlineWindowMilliseconds);
  await target.commands.uiSetTargetOffline(false);
  await target.delay(offlineWindowMilliseconds);
  const reconnected = await target.commands.uiReadLinkedGithubFixture();
  expect(reconnected.head).toBe(pushed.head);
  expect(reconnected.pushes).toBe(pushed.pushes);
  expect(reconnected.writeTokens).toBe(1);

  await target.click(revisionChip());
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel), 30_000);
  await target.click(selectors.getByRole('button', { name: 'Disable writes', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Enable writes', exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Fetch latest', exact: true }));
  await awaitBackup(/^Saved locally/u);
  const disabled = await target.commands.uiReadLinkedGithubFixture();
  expect(disabled.writeEnabled).toBe(false);
  expect(disabled.pushes).toBe(pushed.pushes);
  expect(disabled.writeTokens).toBe(1);
  await target.screenshot(undefined, 'github-writes-disabled');
});

test('shows independent GitHub connections and repository approval at desktop and mobile widths', async () => {
  await target.commands.uiStartLinkedGithubFixture();
  await target.setViewport({ width: 1280, height: 900 });
  await target.emulateColorScheme('light');
  await target.navigate('/?settings=security');
  await target.expectVisible(selectors.getByRole('heading', { name: 'GitHub sign-in and Gists', exact: true }));
  await target.expectVisible(selectors.getByRole('heading', { name: 'GitHub repositories', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  await target.screenshot(undefined, 'github-security-light');
  await target.click(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  await target.expectVisible(
    selectors.getByText('Existing Gists remain. GitHub still holds your authorization.', { exact: true }),
  );
  await target.expectVisible(selectors.getByRole('button', { name: 'Enable Gist sharing', exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Enable Gist sharing', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  await target.emulateColorScheme('dark');
  await target.screenshot(undefined, 'github-security-dark');
  await target.setViewport({ width: 390, height: 844 });
  await target.scrollIntoView(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  const overflows = await target.evaluate(() => {
    const region = document.querySelector('[aria-label="Security settings"]');
    return region !== null && region.scrollWidth > region.clientWidth;
  });
  expect(overflows).toBe(false);
  await target.screenshot(undefined, 'github-security-mobile');
  await target.scrollIntoView(selectors.getByRole('button', { name: 'Manage repositories', exact: true }));
  await target.screenshot(undefined, 'github-security-repositories-mobile.png');
  await target.navigate('/?settings=repositories');
  await target.expectVisible(selectors.getByRole('heading', { name: 'Repositories', exact: true }));
  await target.screenshot(undefined, 'github-repositories-mobile');
  await target.setViewport({ width: 1280, height: 900 });
  await target.emulateColorScheme('light');
  await target.screenshot(undefined, 'github-repositories-light');
  await target.click(selectors.getByRole('button', { name: 'Repository settings', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Enable writes', exact: true }));
  await target.screenshot(undefined, 'github-repository-write-settings.png');
  await target.click(selectors.getByRole('button', { name: 'Enable writes', exact: true }));
  await target.expectVisible(selectors.getByRole('alertdialog'));
  await target.keyboardPress('Escape');
  await target.expectHidden(selectors.getByRole('alertdialog'));
  const cancelled = await target.commands.uiReadLinkedGithubFixture();
  expect(cancelled.writeEnabled).toBe(false);
  await target.setViewport({ width: 390, height: 844 });
  await target.click(selectors.getByRole('button', { name: 'Enable writes', exact: true }));
  await target.screenshot(undefined, 'github-repository-approval-mobile.png');
  await target.click(selectors.getByRole('button', { name: 'Enable repository writes', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Disable writes', exact: true }));
  const approved = await target.commands.uiReadLinkedGithubFixture();
  expect(approved.writeEnabled).toBe(true);
  expect(approved.writeTokens).toBe(0);
  expect(approved.pushes).toBe(0);
  await target.screenshot(undefined, 'github-repository-enabled-mobile.png');
  await target.click(selectors.getByRole('button', { name: 'Disable writes', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Enable writes', exact: true }));
});

test('keeps the Share pane in sync with Gist use without publishing or exposing a token', async () => {
  await target.commands.uiStartLinkedGithubFixture();
  await target.setViewport({ width: 1280, height: 900 });
  await target.navigate('/?settings=security');
  await target.expectVisible(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Enable Gist sharing', exact: true }));
  await openFixture('');
  await target.click(selectors.getByRole('button', { name: 'Share', exact: true }).first());
  const share = selectors.getByRole('region', { name: 'Share project' });
  await target.expectVisible(share);
  await target.click(share.getByRole('button', { name: /^Share with/u }));
  await target.click(selectors.getByRole('option', { name: 'GitHub Gist', exact: true }));
  await target.expectVisible(share.getByRole('button', { name: 'Manage Gist sharing', exact: true }));
  await target.screenshot(undefined, 'github-share-disabled.png');
  await target.click(share.getByRole('button', { name: 'Manage Gist sharing', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Enable Gist sharing', exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Enable Gist sharing', exact: true }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Turn off Gist sharing', exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Back to app', exact: true }));
  await target.expectVisible(share.getByRole('button', { name: 'Create Gist and copy link', exact: true }));
  await target.screenshot(undefined, 'github-share-ready.png');
  const state = await target.commands.uiReadLinkedGithubFixture();
  expect(state.unanswered.some((path) => /get-access-token|refresh-token|\/github\/gists$/u.test(path))).toBe(false);
});
