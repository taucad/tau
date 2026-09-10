import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  declineCookieBanner,
  expectCount,
  expectSignedIn,
  expectVisible,
  openExecutionPicker,
  parkPointer,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * The external-agent arm of the desktop shell (W4-ACP), end to end on a real
 * machine: main discovers the pinned ACP adapters beside the app, the renderer
 * draws one execution row per adapter, and a turn placed on the Codex row is
 * answered by the operator's own Codex login.
 *
 * Not a mocked tier, and it cannot be: every other desktop spec drives the Tau
 * gateway through a fixture, but an external turn never reaches the gateway at
 * all — the adapter brings its own model, its own tools and its own credential
 * (X6). What is being asserted here is exactly the part no fixture can stand in
 * for: that the adapters resolve from `apps/desktop/node_modules`, that the
 * services utility can spawn one under Electron, and that its reply reaches the
 * transcript. It therefore spends the operator's own Codex quota, and skips
 * when the machine has no Codex to spend.
 *
 * The gateway fixture is still installed: the *seeding* turn that creates the
 * project is an ordinary Tau turn, and only the second turn is external.
 */

const seedPrompt = 'Create a cube with a centered cylindrical cutout and verify it.';
/** One word, no tools, cheap on every model — and unambiguous on screen. */
const externalPrompt = 'Reply with the single word pong.';

/**
 * Whether this machine can answer a Codex turn at all.
 *
 * Both halves are what the desktop's own discovery checks: the adapter must
 * resolve beside the app, and its CLI must answer — an adapter whose CLI is
 * missing is never advertised, so there would be no row to click.
 */
const codexAvailable = ((): boolean => {
  try {
    createRequire(join(import.meta.dirname, '../../desktop/package.json')).resolve(
      '@agentclientprotocol/codex-acp/package.json',
    );
    execFileSync('codex', ['--version'], { stdio: 'ignore', timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
})();

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test.skipIf(!codexAvailable)('answers a desktop turn through the Codex row', async () => {
  const account = tauTestAccount('acp');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    /* The seeding turn is what creates the project and its chat; the turn under
     * test is the second one, sent from inside the project route. */
    const slug = await submitPrompt(page, seedPrompt);
    const scriptedRequestsPerTurn = 2;
    await expect
      .poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 })
      .toBeGreaterThanOrEqual(scriptedRequestsPerTurn);
    const projectRoot = join(session.pickedDirectory, slug);
    await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
    const chatId = activeChatId(page);

    /* 1. Both adapters main discovered are offered as rows on this computer.
     * The renderer reads them from the preload bootstrap, so this is the
     * renderer half of the one discovery main performed. */
    const rows = await openExecutionPicker(page);
    /* Lane 15's selector work replaced the "· This computer" suffix: a row is
     * named for the adapter and described by where it runs (Q12.3). */
    expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
    /* Claude Code is matched on the row's name alone: its note is a refusal
     * when that login is absent, and this cell is about discovery. */
    expect(rows.join('\n')).toMatch(/^Claude Code/mu);

    /* 2. The services utility received the same answer. Written inside the
     * process that spawns the adapter, so the renderer cannot produce it. */
    await expect
      .poll(() => (existsSync(session!.logPath) ? readFileSync(session!.logPath, 'utf8') : ''), { timeout: 60_000 })
      .toMatch(/agent-host-config-received.*"externalAgents":\[[^\]]*"codex"/u);

    /* 3. A turn placed on the Codex row is answered by the real adapter. */
    await page
      .getByRole('option', { name: /^Codex/u })
      .first()
      .click();
    const gatewayCallsBefore = fixture.gatewayRequests.length;
    await sendPrompt(page, externalPrompt);

    await expectVisible(page.getByText(/^\s*pong[\s.!]*$/iu).first(), 300_000);

    /* 4. The turn was external, not a Tau turn wearing the row's label: the
     * gateway saw nothing, and the durable log records the ACP marker. */
    expect(fixture.gatewayRequests.length).toBe(gatewayCallsBefore);
    const events = readFileSync(join(projectRoot, '.tau/chats', chatId, 'events.jsonl'), 'utf8');
    expect(events).toMatch(/"kind":"external-agent"/u);
    expect(events).toMatch(/"agentId":"codex"/u);
    expect(events).toMatch(/"state":"completed"/u);

    console.info(`[desktop-e2e] acp chat=${chatId} rows=${rows.length} project=${projectRoot}`);
  } catch (error) {
    await session.capture('acp-failure');
    throw error;
  }
});

/**
 * The operator's actual flow, and the one turn the spec above cannot reach:
 * Codex is picked on the **home hero**, and the very first turn of the new
 * project is the seeded one.
 *
 * That turn is the app's only bodyless dispatch — `loadChatActor` consumes
 * `Chat.startupRequest` and dispatches it before the chat row's
 * `activeExecution` has hydrated into the React tree — so it is the only place
 * a selection can be honoured everywhere durable and still be discarded on the
 * wire. It ran as Tau-on-the-daemon at the cookie model until the consumed
 * row's execution was threaded onto the dispatch itself.
 */
test.skipIf(!codexAvailable)(
  'answers the seeded first turn through the Codex row picked on the home hero',
  async () => {
    const account = tauTestAccount('acp-seeded');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token });
    const { page } = session;
    /* Only the project-name turn reaches the gateway on this leg; the CAD turn
     * is external and never does. The fixture is still what funds that name. */
    fixture = await installGatewayFixture(page);

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await declineCookieBanner(page);
      await expectSignedIn(page);

      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);

      /* Picked *before* the first submit: the home hero is session-backed, so the
       * choice lands in `chat_homepage_main` and the new project's chat row is
       * created carrying it. */
      const rows = await openExecutionPicker(page);
      expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
      await page
        .getByRole('option', { name: /^Codex/u })
        .first()
        .click();

      await submitPrompt(page, externalPrompt);

      /* A home-hero submit routes to `/w/<workspace>/new-project` with no `chat`
       * param, and both the slug and the directory on disk are renamed when the
       * name generator answers — so the log path is re-derived from the live URL
       * on every poll rather than captured once. */
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const chatId = activeChatId(page);
      const eventsPathNow = (): string => {
        const { pathname } = new URL(page.url());
        return join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1), '.tau/chats', chatId);
      };
      const durableLog = (): string => {
        const path = join(eventsPathNow(), 'events.jsonl');
        return existsSync(path) ? readFileSync(path, 'utf8') : '';
      };

      /* Settlement is read from the durable log the daemon wrote, not from the
       * transcript: a partially rendered reply must not pass for a finished turn.
       * The seeded turn ran on Codex, not on a Tau host wearing the chip's label. */
      await expect.poll(durableLog, { timeout: 300_000 }).toMatch(/"state":"completed"/u);
      const events = durableLog();
      expect(events).toMatch(/"kind":"external-agent"/u);
      expect(events).toMatch(/"agentId":"codex"/u);
      await expectVisible(page.getByText(/^\s*pong[\s.!]*$/iu).first(), 60_000);

      console.info(`[desktop-e2e] acp seeded chat=${chatId} log=${eventsPathNow()}`);
    } catch (error) {
      await session.capture('acp-seeded-failure');
      throw error;
    }
  },
);

/** The candidate turn's instruction: one deterministic, cheap edit to the seeded model. */
const candidatePrompt =
  'Add the exact line `// candidate` as the very first line of main.scad. Change nothing else in the file and edit no other file.';

/** The one line the candidate turn is asked to prepend. */
const candidateMarker = '// candidate';

/** One chat's durable log as text, empty until the appender has created it. */
const readLog = (logPath: string): string => (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '');

/** One `revision.finalized` record as the durable log carries it. */
type FinalizedRevision = {
  readonly revisionId: string;
  readonly baseRevisionId: string;
  readonly treeId: string;
  readonly branchName: string;
  readonly changedPaths: readonly string[];
  readonly provenance: { readonly actorId: string; readonly source: string };
};

/**
 * Every revision one chat's durable log has finalized, in order.
 *
 * Parsed rather than pattern-matched because the *identity* is the evidence
 * this cell owes: the revision ids in order, and the branch each landed on.
 *
 * @param logPath - The chat's `events.jsonl`.
 * @returns The finalized revisions, oldest first.
 */
const finalizedRevisions = (logPath: string): readonly FinalizedRevision[] =>
  (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '').split('\n').flatMap((line) => {
    if (line.trim().length === 0) {
      return [];
    }
    try {
      const event = JSON.parse(line) as { readonly type?: string };
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the discriminant is checked.
      return event.type === 'revision.finalized' ? [event as unknown as FinalizedRevision] : [];
    } catch {
      /* An appender flushing its last line mid-read is the next poll's problem. */
      return [];
    }
  });

/** The Branches porcelain's own section, and one branch's row inside it. */
const branchesSection = (page: Page): Locator => page.getByRole('region', { name: 'Revision branches' });
/* Matched on the row's *name*, not on its text: every row also carries a diff
 * line naming the branch it is compared against ("1 file differs from main"),
 * so `hasText` alone matched both rows. */
const branchRow = (page: Page, branchName: string): Locator =>
  branchesSection(page)
    .locator('li')
    .filter({ has: page.getByText(branchName, { exact: true }) });

/**
 * G-REV-EXT live in candidate mode (J-E), and the populated look G-REV-PORCELAIN
 * owes — one project, one Tau turn in the live folder, one Codex turn in a
 * checkout of its own, and the four branch verbs over what they published.
 *
 * The two turns are on **two chats** on purpose: a direct turn records onto the
 * trunk the live tree tracks (`main`) and a candidate onto its own lane
 * (`agent/<chatId>`, `packages/revisions/src/turn-revision.ts`), so two chats is
 * the smallest shape in which switch, merge and discard exist at all — and the
 * shape in which the cross-chat merge base is load-bearing.
 *
 * The third turn — a second Tau turn back on the first chat, on the gateway
 * fixture, so it spends nothing — moves the trunk head to a tree that differs
 * from the candidate's, which is what keeps the Switch and the Merge below from
 * being true before they are clicked.
 *
 * Isolation is asserted where the charter actually claims it — *mid-turn*. A
 * candidate turn merges back into the live tree when it settles (that is what
 * "fork an isolated copy; merge back when done" means in
 * `TurnRevisionRecorder.finalize`), so the assertion is that the live
 * `main.scad` is byte-identical to the seeded bytes at every sample taken while
 * the run had not yet recorded a terminal marker. The file is read *before* the
 * log on each sample, so the only way to fail is the defect itself: bytes in the
 * project folder ahead of the turn's own settlement.
 */
test.skipIf(!codexAvailable)(
  'isolates a Codex candidate turn on its own branch and drives switch, merge, restore and discard',
  async () => {
    const account = tauTestAccount('acp-rev');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token });
    const { page } = session;
    /* The shell opens at 1440×900 (`apps/desktop/src/main/main.ts`), and at that
     * width the project route's composer is narrow enough that its right-hand
     * action group sits *over* the left group's last controls — the revision
     * selector included, which is the one control this spec has to click.
     * Maximizing does not clear it (the chat pane still opens at its Allotment
     * minimum); the sash drag below is what makes the control hittable
     * (lane 9-je-live finding 1). Maximized is still the operator's real state. */
    await session.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.maximize();
    });
    fixture = await installGatewayFixture(page);

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await declineCookieBanner(page);
      await expectSignedIn(page);

      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);
      await selectChatModel(page, gatewayFixtureModelName);

      /* 1–2. The Tau turn, in the default `direct` mode: it creates the project,
       * its first chat, and the first revision every later step names. */
      const slug = await submitPrompt(page, seedPrompt);
      await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
      const directChatId = activeChatId(page);
      /* Re-derived on every read: the slug and the directory are both renamed
       * when the project-name generator answers. */
      const projectRoot = (): string => {
        const { pathname } = new URL(page.url());
        return join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1));
      };
      const logOf = (chatId: string): string => join(projectRoot(), '.tau/chats', chatId, 'events.jsonl');
      const liveSource = (): string => {
        const path = join(projectRoot(), 'main.scad');
        return existsSync(path) ? readFileSync(path, 'utf8') : '(main.scad is missing)';
      };

      await expect.poll(() => finalizedRevisions(logOf(directChatId)).length, { timeout: 300_000 }).toBeGreaterThan(0);
      const directRevision = finalizedRevisions(logOf(directChatId))[0]!;
      const seededSource = liveSource();
      expect(seededSource).toContain('difference()');
      /* A direct turn records onto the trunk the live tree tracks, and creates
       * it on a project's first turn (operator decisions 2026-09-09, Q11). */
      expect(directRevision.branchName).toBe('main');

      /* 3. A second chat is the candidate's own lane, and therefore its own
       * branch. Created before anything is spent: a failure here costs no quota. */
      await parkPointer(page);
      await page
        .getByRole('button', { name: /^New chat in /u })
        .first()
        .click();
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 60_000 }).not.toBe(directChatId);
      const candidateChatId = activeChatId(page);
      const candidateBranch = `agent/${candidateChatId}`;

      /* The chat pane opens at its minimum width, and at that width the
       * composer's right-hand action group ("Add context", attach, send) sits
       * *over* the tail of its left group — the revision selector included, so
       * the one control this cell has to click cannot be hit. Widening the pane
       * is what an operator does about it, and it is the honest fix here; the
       * overlap itself is reported as a finding rather than papered over with a
       * synthetic event. */
      /* Scoped to the project workspace's own Allotment: the app sidebar has a
       * sash of its own, and it is the first one in the document. */
      const sash = page.locator('[data-project-workspace] .sash-container > .sash').first();
      const sashBounds = await sash.boundingBox();
      expect(sashBounds, 'the chat pane offers no drag handle to widen it').not.toBeNull();
      await page.mouse.move(sashBounds!.x + sashBounds!.width / 2, sashBounds!.y + sashBounds!.height / 2);
      await page.mouse.down();
      await page.mouse.move(sashBounds!.x + 360, sashBounds!.y + sashBounds!.height / 2, { steps: 12 });
      await page.mouse.up();
      await parkPointer(page);

      /* The Codex row, then `New branch`: the revision control is offered by the
       * placement's capability, so it is the same control a Tau turn picks. */
      const rows = await openExecutionPicker(page);
      /* The row is named for the adapter and described by where it runs. */
      expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
      await page
        .getByRole('option', { name: /^Codex/u })
        .first()
        .click();
      await parkPointer(page);
      await page.locator('[data-slot="chat-revision-selector"]').first().click();
      await page.getByText('New branch', { exact: true }).first().click();
      await expectVisible(page.locator('[aria-label="Work in: New branch"]'), 30_000);

      /* 4. The isolation claim, sampled rather than inferred. */
      const samples: Array<{ readonly live: string; readonly settled: boolean }> = [];
      const sampler = setInterval(() => {
        const live = liveSource();
        samples.push({ live, settled: readLog(logOf(candidateChatId)).includes('"state":"completed"') });
      }, 200);
      const gatewayCallsBefore = fixture.gatewayRequests.length;
      try {
        await sendPrompt(page, candidatePrompt);
        await expect.poll(() => readLog(logOf(candidateChatId)), { timeout: 300_000 }).toMatch(/"state":"completed"/u);
      } finally {
        clearInterval(sampler);
      }
      const leaked = samples.filter((sample) => !sample.settled && sample.live !== seededSource);
      expect(samples.length, 'the candidate turn was never sampled').toBeGreaterThan(0);
      expect(
        leaked.length,
        `the live main.scad changed in ${String(leaked.length)} of ${String(samples.length)} mid-turn samples`,
      ).toBe(0);

      /* The turn really was external, really was a candidate, and really landed
       * on the candidate lane's own branch. */
      const candidateEvents = readLog(logOf(candidateChatId));
      /* The three facts on one envelope, not three matches anywhere in the log
       * (9-review N3). */
      const envelope = candidateEvents
        .split('\n')
        .filter((line) => line.includes('"message.envelope-replaced"'))
        .map((line) => JSON.parse(line) as { replacement?: { metadata?: { tauInternal?: Record<string, unknown> } } })
        .map((event) => event.replacement?.metadata?.tauInternal)
        .find((marker) => marker !== undefined);
      expect(envelope).toMatchObject({ kind: 'external-agent', agentId: 'codex', mode: 'candidate' });
      expect(fixture.gatewayRequests.length, 'an external turn must not reach the Tau gateway').toBe(
        gatewayCallsBefore,
      );
      await expect
        .poll(() => finalizedRevisions(logOf(candidateChatId)).length, { timeout: 120_000 })
        .toBeGreaterThan(0);
      const candidateRevision = finalizedRevisions(logOf(candidateChatId)).at(-1)!;
      expect(candidateRevision.branchName).toBe(candidateBranch);
      expect(candidateRevision.changedPaths).toContain('main.scad');
      const candidateSource = liveSource();
      expect(candidateSource, 'the candidate turn wrote nothing to distinguish it from the seed').not.toBe(
        seededSource,
      );

      /* A second direct turn on the first chat, so the graph head — and with it
       * the pane's active branch — is the lane the candidate merges back into. */
      await page.goBack();
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 60_000 }).toBe(directChatId);
      await sendPrompt(page, 'Rebuild main.scad from scratch.');
      await expect.poll(() => finalizedRevisions(logOf(directChatId)).length, { timeout: 300_000 }).toBeGreaterThan(1);
      const directSecondRevision = finalizedRevisions(logOf(directChatId)).at(-1)!;

      /* 5. The porcelain. */
      await parkPointer(page);
      await page
        .getByRole('button', { name: /Search/u })
        .first()
        .click();
      await page.getByPlaceholder('Search projects, chats, and actions...').fill('Open revision history');
      await page.getByText('Open revision history', { exact: true }).first().click();
      await expectVisible(branchesSection(page), 60_000);
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `innerText` keeps the line breaks this evidence is read by.
      const listedText = await branchesSection(page).innerText();
      const listed = listedText.trim();
      expect(listed).toContain(candidateBranch);
      expect(listed).toContain(directRevision.branchName);
      await session.capture('rev-branches-list');

      /* 6. Switch to the candidate: the live folder takes the candidate's bytes,
       * and the head reference goes with it — so the candidate is what the pane
       * now calls Current, and the trunk is the row offering the verbs (Q11). */
      await branchRow(page, candidateBranch).getByRole('button', { name: 'Switch', exact: true }).click();
      await expect.poll(liveSource, { timeout: 120_000 }).toBe(candidateSource);
      expect(liveSource()).toContain(candidateMarker);
      await expectVisible(branchRow(page, candidateBranch).getByText('Current', { exact: true }), 60_000);
      await session.capture('rev-branches-after-switch');

      /* Back onto the trunk, the same verb in the other direction. */
      await branchRow(page, 'main').getByRole('button', { name: 'Switch', exact: true }).click();
      await expect.poll(liveSource, { timeout: 120_000 }).toBe(seededSource);
      await expectVisible(branchRow(page, 'main').getByText('Current', { exact: true }), 60_000);

      /* Merge the candidate into the trunk. Both chats' lanes descend from the
       * trunk head, so this is an ordinary three-way merge rather than the
       * add/add conflict two independently rooted lanes could only produce
       * (lane 9-je-live finding 3; operator decisions Q11). */
      await branchRow(page, candidateBranch)
        .getByRole('button', { name: /^Merge into /u })
        .click();
      /* Read as the row's own outcome line, not as its first `role="status"`:
       * the busy Spinner carries that role too, and a merge that lands in the
       * live tree is no longer instant, so `.first()` resolved to the spinner's
       * empty text while the merge was still running. */
      const mergeLine = async (): Promise<string> => {
        // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `innerText` keeps the line breaks this outcome is read by.
        const text = await branchRow(page, candidateBranch).innerText();
        return (/^(?:Merged into .*|Merge conflict .*|.* already holds this branch)$/mu.exec(text)?.[0] ?? '').trim();
      };
      await expect.poll(mergeLine, { timeout: 120_000 }).toMatch(/^Merged into main: main\.scad$/u);
      const mergeResult = await mergeLine();
      /* And the live tree follows the head reference: the merge lands in the
       * project folder without a second checkout. */
      await expect.poll(liveSource, { timeout: 120_000 }).toContain(candidateMarker);
      await session.capture('rev-branches-after-merge');

      /* Restore to the first revision: the live folder is the seed again. */
      await page.getByRole('button', { name: 'Restore to Revision 1', exact: true }).first().click();
      await expect.poll(liveSource, { timeout: 120_000 }).toBe(seededSource);
      await session.capture('rev-branches-after-restore');

      /* Discard the candidate's ref. The revisions it reached stay in the store;
       * only the name goes. */
      await branchRow(page, candidateBranch).getByRole('button', { name: 'Discard', exact: true }).click();
      await expectCount(branchRow(page, candidateBranch), 0, 60_000);
      await session.capture('rev-branches-after-discard');

      console.info(
        `[desktop-e2e] j-e ${JSON.stringify({
          project: projectRoot(),
          directChatId,
          candidateChatId,
          revisionsInOrder: [directRevision, candidateRevision, directSecondRevision].map((revision) => ({
            revisionId: revision.revisionId,
            baseRevisionId: revision.baseRevisionId,
            treeId: revision.treeId,
            branchName: revision.branchName,
            changedPaths: revision.changedPaths,
            actorId: revision.provenance.actorId,
          })),
          candidateBranch,
          mergeResult,
          midTurnSamples: samples.length,
          midTurnLeaks: leaked.length,
          branchesListed: listed,
        })}`,
      );
    } catch (error) {
      await session.capture('acp-revision-failure');
      throw error;
    }
  },
  900_000,
);
