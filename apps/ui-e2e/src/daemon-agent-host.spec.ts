/**
 * AV-4: a Tau turn placed on a daemon, from a page the daemon itself served.
 *
 * This is rung 1 of the transport ladder end to end, and it cannot be faked
 * with a route interception: the browser loads the document from the daemon's
 * own origin, discovers it at `/.well-known/tau-host`, and upgrades `/agent`
 * same-origin so the daemon's `HttpOnly` cookie rides along. No token is ever
 * written into the page (W4 ruling 2).
 *
 * What it proves, in order: discovery names the daemon and its workspace; the
 * turn's tool call writes a file on the *daemon's* disk, not in the browser;
 * the durable log is a file in that workspace; the page survives losing its
 * client mid-run and rebuilds the transcript from the daemon's log; and the API
 * never appears in the data path.
 *
 * Chromium only. The firefox and webkit legs are residue: the fixture spawns a
 * real daemon per session, and one browser is enough to prove the wire.
 */

import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const partialText = 'Tau Host started the workspace change.';
const finalText = 'Tau Host completed the workspace change.';
const proofFile = 'main.scad';
const proofContent = 'cube(10);\n';

const ensureChatOpen = async (): Promise<void> => {
  try {
    await target.expectVisible(selectors.getByCss(composer), 10_000);
    return;
  } catch {
    // Lane genuinely closed — open it.
  }
  await target.expectVisible(selectors.getByCss('[aria-label="Toggle Chat lane"]'), 60_000);
  await target.click(selectors.getByCss('[aria-label="Toggle Chat lane"]'));
  await target.expectVisible(selectors.getByCss(composer), 60_000);
};

/**
 * Create a project through the real UI.
 *
 * The `__e2e` seed routes carry server loaders and are excluded from the serve
 * build (`apps/ui/serve/app/routes.ts`), so there is nothing to seed with —
 * which is the point: this drives what a user actually does.
 */
const createProject = async (origin: string): Promise<void> => {
  await target.navigate(`${origin}/projects/new`);
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 90_000);
  await target.fill(selectors.getByLabelText('Project Name *'), 'Tau Host Project');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
  await ensureChatOpen();
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const selectTauHost = async (workspace: string): Promise<void> => {
  await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Tau' }), 60_000);
  await target.click(selectors.getByRole('button', { name: 'Select agent: Tau' }));
  // The row names the daemon, and its secondary line names the directory the
  // turn will write to — the one fact a user needs before placing a turn there.
  const row = selectors.getByRole('option', { name: /Tau Host · /u });
  await target.expectVisible(row, 60_000);
  await target.expectVisible(selectors.getByText(workspace, { exact: true }), 10_000);
  await target.click(row);
  await target.expectVisible(selectors.getByRole('button', { name: /Select agent: Tau Host · / }), 30_000);
};

const durableLog = async (): Promise<string> => {
  const chats = await target.listTauServeChats();
  expect(chats).toHaveLength(1);
  return (await target.readTauServeFile(`.tau/chats/${chats[0]!}/events.jsonl`)) ?? '';
};

/**
 * How many times the page renders one exact sentence.
 *
 * `innerText` is what a reader sees: nodes the transcript has not rendered, or
 * hid, do not count. Scrolled-out ones do — a duplicate below the fold is still
 * a duplicate.
 */
const renderedCount = async (sentence: string): Promise<number> =>
  target.evaluate(
    // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `textContent` would also count text the transcript never rendered.
    (needle: string) => document.body.innerText.split(needle).length - 1,
    sentence,
  );

/** The cookie banner is fixed to the bottom edge, over the composer's controls. */
const dismissCookieBanner = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

/** Send the visible composer's first prompt, waiting for the send control to arm. */
const sendFirstPrompt = async (prompt: string): Promise<void> => {
  const editor = selectors.getByCss(composer).first();
  await target.type(editor, prompt);
  const submit = selectors.getByCss('button:has(svg.lucide-arrow-up)').first();
  // `isSubmitDisabled` also tracks the project-creation location, which resolves
  // asynchronously — clicking early would drop the click, not queue it.
  await expect.poll(async () => target.getAttribute(submit, 'disabled'), { timeout: 60_000 }).toBeNull();
  await target.click(submit);
};

describe('daemon agent host (AV-4, rung 1)', () => {
  test('places a Tau turn on the daemon that served the page, and survives losing its client', async () => {
    const { origin, workspace } = await target.startTauServeFixture();
    await target.setViewport({ width: 1440, height: 900 });
    await createProject(origin);
    await selectTauHost(workspace);

    await target.type(composer, 'Create the Tau Host proof file.');
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    try {
      // The daemon admitted the run: its log directory exists before any pixel does.
      await expect
        .poll(
          async () => {
            const chats = await target.listTauServeChats();
            return chats.length;
          },
          { timeout: 60_000 },
        )
        .toBe(1);
      await target.expectVisible(selectors.getByText(partialText, { exact: true }), 120_000);
    } catch (error) {
      const { consoleMessages, pageErrors } = await target.events();
      // eslint-disable-next-line no-console -- the failure is only diagnosable from the page's own log.
      console.error(
        '[AV-4] page errors:',
        pageErrors,
        '\n[AV-4] daemon chats:',
        await target.listTauServeChats(),
        '\n[AV-4] console tail:',
        consoleMessages
          .map(({ type, text }) => `${type}: ${text.slice(0, 300)}`)
          .filter((line) => !line.includes('get-session') && !line.includes('ERR_FAILED'))
          .slice(-30),
      );
      throw error;
    }

    // The tool call ran on the daemon: the file is on *its* disk, in the
    // directory the row named — not in this browser's OPFS.
    await expect.poll(async () => target.readTauServeFile(proofFile), { timeout: 120_000 }).toBe(proofContent);

    /* Lose the client mid-run: the second turn is still held at the gateway, so
     * the daemon is mid-flight when the page's channel dies. A reload is the
     * strongest drop this harness can stage and still reattach — closing the
     * browser context would take the project's OPFS with it, and there would be
     * no chat left to reattach to. */
    await target.reload();
    await target.releaseTauServeGateway();
    await ensureChatOpen();

    /* The transcript is back. On its own this proves little — the pre-drop text
     * was already persisted in this browser's own chat row before the reload. */
    await target.expectVisible(selectors.getByText(partialText).first(), 120_000);

    /* This is the reattach. The released turn's text was appended to the
     * daemon's log while the page had no client at all, so it exists nowhere in
     * this browser: rendering it means the reloaded page attached to the
     * daemon's log from cursor 0 and projected what it had missed. A chat placed
     * on a daemon writes no browser workspace claim, so nothing reload discovery
     * reads substantiates its run — the reattach rides the host registration. */
    await target.expectVisible(selectors.getByText(finalText).first(), 120_000);

    /* FIX-REATTACH-DUP: once each, not twice. The replay rebuilds the run's own
     * message rather than being appended to the copy this browser had already
     * persisted — the AI SDK continues a trailing assistant message on a
     * resume, and it keys tool and data parts but not text ones, so the replay
     * used to render every assistant paragraph of the turn a second time. The
     * pre-drop sentence is the sharp one: it is the part both copies hold, and
     * the replay emits its duplicate before it reaches the released text this
     * page has already waited for. */
    expect(await renderedCount(partialText)).toBe(1);
    expect(await renderedCount(finalText)).toBe(1);

    /* The run itself settled on the daemon, unattended, while the page was
     * reloading — always-on is the property under test, and the daemon's own
     * log is its authority. Four appended messages: the user turn, the
     * assistant's text-plus-tool-call, the tool result, and the final text. */
    await expect.poll(durableLog, { timeout: 120_000 }).toContain('"state":"completed"');
    const settledLog = await durableLog();
    const events = settledLog
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { readonly type: string; readonly state?: string });
    expect(events.filter(({ type }) => type === 'message.appended')).toHaveLength(4);
    expect(events.filter(({ type }) => type === 'run.lifecycle').map(({ state }) => state)).toEqual([
      'admitted',
      'running',
      'completed',
    ]);

    /* A second run, then a second reload: the reattach must rebuild *every* run
     * the log names, not only the one its attach snapshot points at. The first
     * fix rebuilt the trailing run alone, which left every earlier turn holding
     * whatever the reloads before it had appended — the operator measured a
     * four-run chat rendering its third turn four times. The stub gateway
     * answers every request after the first with `finalText`, so a second turn
     * needs no fixture change and the sentence count is the assertion: once per
     * run, twice in all. */
    const submit = selectors.getByCss('button:has(svg.lucide-arrow-up)').last();
    await target.type(composer, 'Describe the model.');
    // The reattach has to settle before the composer arms; clicking early drops.
    await expect.poll(async () => target.getAttribute(submit, 'disabled'), { timeout: 120_000 }).toBeNull();
    await target.click(submit);
    await expect.poll(async () => renderedCount(finalText), { timeout: 120_000 }).toBe(2);
    await target.reload();
    await ensureChatOpen();
    await expect.poll(async () => renderedCount(finalText), { timeout: 120_000 }).toBe(2);
    /* The count above is already 2 from local persistence the moment the
     * transcript renders, so it is the *settled* count that discriminates: a
     * replay appended to a stale copy reaches 3 within a socket round trip.
     * ponytail: a fixed settle because nothing the reattach does is observable
     * from the page once it is idempotent — replace it with a signal if the
     * transport ever publishes one. */
    await target.delay(3000);
    expect(await renderedCount(finalText)).toBe(2);
    expect(await renderedCount(partialText)).toBe(1);

    /* PH19: the API is absent from the *data path*. The only `/v1/chat/*` calls
     * this page makes are `runs/active` — the project-level "is anything
     * running?" probe `ProjectChatRpcBindings` polls for every project
     * regardless of placement, and which answers 503 here because no API is
     * running. Nothing carrying a turn, a run stream or a transcript goes near
     * it: the run was admitted, executed and replayed over the daemon socket. */
    const apiRequests = await target.readAgentHostApiRequests();
    expect(apiRequests.filter((path) => !path.endsWith('/runs/active'))).toEqual([]);

    await target.stopTauServeFixture();
  }, 300_000);

  /**
   * The same placement, chosen one step earlier — before the project exists.
   *
   * The leg above selects the daemon *inside* a project, which is why the ladder
   * verticals never caught FIX-SEEDED-PLACEMENT: the home composer creates the
   * chat itself, and it rebuilt the seed from the model alone, so the `hostId`
   * the chip was showing never reached `Chat.activeExecution`. The project was
   * created, the chip claimed the daemon, and the first turn ran in the browser.
   */
  test('places the first turn of a project created from the home composer on the daemon', async () => {
    const { origin, workspace } = await target.startTauServeFixture();
    await target.setViewport({ width: 1440, height: 900 });

    /* Nothing stubs the AI project name here: `createProject` folds a rejected
     * suggestion into the same default an empty one gets, so a daemon-served
     * page creates its project with no API at all — which is the claim. */
    await target.navigate(`${origin}/`);
    await target.expectVisible(selectors.getByCss(composer).first(), 90_000);
    await dismissCookieBanner();
    await selectTauHost(workspace);
    await sendFirstPrompt('Create the Tau Host proof file.');

    // The composer created the project and navigated into it.
    try {
      await target.expectUrl(/\/w\/home\/[^/]+$/u, 90_000);
    } catch (error) {
      // The composer swallows a creation failure into a toast, so the page's own
      // log is the only place the reason appears.
      const { consoleMessages, pageErrors } = await target.events();
      // eslint-disable-next-line no-console -- see above.
      console.error(
        '[FIX-SEEDED-PLACEMENT] page errors:',
        pageErrors,
        '\n[FIX-SEEDED-PLACEMENT] console tail:',
        consoleMessages
          .map(({ type, text }) => `${type}: ${text.slice(0, 200)}`)
          .filter((line) => !line.includes('get-session') && !line.includes('ERR_FAILED'))
          .slice(-20),
      );
      throw error;
    }
    await ensureChatOpen();
    await dismissCookieBanner();

    // The seed carried the chip's promise into the chat that now owns the turn.
    await target.expectVisible(selectors.getByRole('button', { name: /^Select agent: Tau Host · /u }), 60_000);

    /* And the daemon really ran it: the log directory and the tool call's file
     * are both on the daemon's disk, in the directory the row named — the run
     * exists nowhere in this browser. */
    await expect
      .poll(
        async () => {
          const chats = await target.listTauServeChats();
          return chats.length;
        },
        { timeout: 120_000 },
      )
      .toBe(1);
    await expect.poll(async () => target.readTauServeFile(proofFile), { timeout: 120_000 }).toBe(proofContent);
    await expect.poll(durableLog, { timeout: 120_000 }).toContain('"state":"running"');
    await target.expectVisible(selectors.getByText(partialText, { exact: true }), 120_000);

    await target.releaseTauServeGateway();
    await target.stopTauServeFixture();
  }, 300_000);
});
