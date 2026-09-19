import { setTimeout as wait } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { desktopE2EFrontendUrl } from '#support/config.js';
import { deliverDesktopDeepLink, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectSignedIn, expectVisible } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { forgetSeededProjects, seedProPlan, tauCloudOwnerIds } from '#support/two-client/tau-cloud.js';
import type { TauCloudOwnerIds } from '#support/two-client/tau-cloud.js';

/**
 * Share links and the clipboard on the desktop shell (share-links blueprint R5).
 *
 * Two defects shipped together and are pinned together here, because they are
 * only observable from *outside* the renderer:
 *
 *  - **Copy link was dead.** The shell's permission handler granted
 *    `persistent-storage` alone, so Chromium refused every
 *    `navigator.clipboard.writeText`, and `CopyButton` ticked "Copied" before
 *    the write anyway. Only Electron's own `clipboard.readText()`, read in
 *    main, can tell a real copy from a rendered claim — a renderer-side
 *    assertion would be checking the same lie. The clipboard is seeded with a
 *    sentinel first, so a no-op copy fails instead of reading whatever the
 *    previous row left behind.
 *  - **The link was unshareable.** `globalThis.location.origin` is `app://tau`
 *    in the shell, so the minted invitation was one nobody outside the app
 *    could open. `shareOrigin()` mints it from `TAU_FRONTEND_URL` instead,
 *    which this suite sets to `http://localhost:3014`.
 *
 * The second row is the inbound half (R4): an admitted `tau://` link is a
 * window navigation, and a foreign one is refused without moving the window.
 * `open-url` is emitted on `app` in main, which is exactly how macOS delivers a
 * link — and, unlike a real handler registration, needs no packaged bundle.
 */

/* The invitation card is the owner's half of a *connected Tau Cloud* project
 * (`revision-sync-region.tsx`: `role === 'owner' && remote.kind === 'tau' &&
 * remote.phase === 'connected'`), and a free owner's connect is refused with
 * `403 GIT_SYNC_NOT_ENTITLED`, so the plan is seeded exactly as the two-client
 * tier seeds it. */
const account = tauTestAccount('share-link-copy');
const projectName = 'R5 Share Link';
const invitee = 'tau-desktop-share-link-invitee@example.test';
const clipboardSentinel = 'tau-e2e-clipboard-sentinel';
const invitationPrefix = `${new URL(desktopE2EFrontendUrl).origin}/invitations/`;

let session: DesktopSession | undefined;
let owner: TauCloudOwnerIds | undefined;

/** The live session, or a failure that names what went missing. */
const live = (): DesktopSession => {
  if (session === undefined) {
    throw new Error('The desktop shell did not launch.');
  }
  return session;
};

beforeAll(async () => {
  const bearer = await seedTauTestUser(account);
  owner = await tauCloudOwnerIds(account.email);
  await seedProPlan(owner);
  session = await launchDesktopApp({ token: bearer });
  await expectSignedIn(session.page);
}, 300_000);

/* The session outlives each row, so a failure keeps its rendered state: the
 * card this spec drives is several product steps deep, and the screenshot plus
 * body text is the only account of which step did not arrive. */
afterEach(async ({ task }) => {
  if (task.result?.state === 'fail') {
    await session?.capture(`share-link-${task.name.replaceAll(/[^a-zA-Z0-9]+/gu, '-')}`);
  }
}, 120_000);

afterAll(async () => {
  await session?.close();
  session = undefined;
  if (owner) {
    await forgetSeededProjects(owner);
  }
  await deleteTauTestUser(account.email);
}, 300_000);

describe('desktop share links', () => {
  it('should put a web-origin invitation link on the system clipboard', async () => {
    const desktop = live();
    const { application, page } = desktop;

    await page.goto('app://tau/projects/new', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Project Name *').fill(projectName);
    await page
      .getByRole('button', { name: /^Create Project/u })
      .first()
      .click();
    await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });

    /* The same two steps `two-client.spec.ts` drives: the workbench chip opens
     * the pane, and the region only offers the radio while no remote exists. */
    await page
      .getByRole('button', { name: /^Open Revisions\./u })
      .first()
      .click({ timeout: 120_000 });
    const connect = page.getByRole('button', { name: 'Connect Tau Cloud', exact: true }).first();
    if (await connect.isVisible()) {
      await connect.click();
    }
    await expectVisible(page.getByRole('region', { name: 'Sync' }).first(), 60_000);
    /* Waited for rather than sampled: the region renders before its choices do,
     * and a sampled `isVisible()` skipped the connect entirely — leaving a
     * project with no remote, which renders no invitation card at all. */
    const choice = page.getByRole('radio', { name: 'Tau Cloud' }).first();
    await expectVisible(choice, 60_000);
    await choice.click();
    await page.getByRole('button', { name: 'Connect backup', exact: true }).first().click();

    const email = page.getByLabel('Invite by email');
    await expectVisible(email, 180_000);
    await email.fill(invitee);
    await page.getByRole('button', { name: 'Create invitation' }).first().click();
    const created = page.getByRole('status', { name: 'Invitation created' }).first();
    await expectVisible(created, 60_000);

    await application.evaluate(({ clipboard }, sentinel) => {
      clipboard.writeText(sentinel);
    }, clipboardSentinel);
    await created.getByRole('button', { name: 'Copy link' }).click();
    /* (a) what the button says, which is all the previous build ever proved. */
    await expectVisible(created.getByRole('button', { name: 'Copied' }), 15_000);

    /* (b) what actually reached the machine's clipboard. */
    const copied = await application.evaluate(({ clipboard }) => clipboard.readText());
    expect(copied, 'R1: Copy link must write to the system clipboard, not merely report "Copied"').not.toBe(
      clipboardSentinel,
    );
    expect(
      copied.slice(0, invitationPrefix.length),
      `R2: the copied invitation link must be a web link; it was ${copied}`,
    ).toBe(invitationPrefix);
    expect(copied.startsWith('app://'), 'R2: a desktop-origin link is unopenable outside the shell').toBe(false);
    /* The field a person can select is the same link the button copied. */
    await expect.poll(async () => created.getByRole('textbox').inputValue()).toBe(copied);
  }, 600_000);

  it('should open an admitted tau:// invitation and leave a foreign link alone', async () => {
    const { page } = live();
    const token = 'tauE2EDeepLinkToken';
    const opened = `app://tau/invitations/${token}`;

    await deliverDesktopDeepLink(live(), `tau://invitations/${token}`);
    await expect
      .poll(() => page.url(), { message: 'R4: an admitted deep link must navigate the window', timeout: 60_000 })
      .toBe(opened);

    for (const foreign of ['tau://evil/x', 'tau://invitations/a/b']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one link at a time, exactly as the OS delivers them
      await deliverDesktopDeepLink(live(), foreign);
    }
    /* A refusal is a log line, not an event: give main the window an admitted
     * link needs to navigate in, then read the URL back. */
    await wait(3000);
    expect(page.url(), 'R4: a link outside the four the app publishes must not move the window').toBe(opened);
  }, 300_000);
});
