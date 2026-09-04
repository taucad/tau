import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  declineCookieBanner,
  expectGeometryFramed,
  expectSignedIn,
  expectVisible,
  parkPointer,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * Launcher 2 — the Node agent launcher in the services utility (charter C3).
 *
 * **Dark until the agent-host program's W4-ACP lane lands the renderer's
 * "This computer" execution row.** The selectors below are theirs,
 * pre-committed so this spec can be written against them: the placement
 * trigger `aria-label="Select agent: This computer"` and the row
 * `data-testid="chat-execution-desktop-row"`. Everything *behind* the row is
 * already in the shell — `desktopBridge().agentHost.connect(workspaceRoot)` in
 * the renderer, `serveAgentChannel` per trusted root in the utility — so when
 * the row appears this should light up with no further harness work.
 *
 * Run it with `TAU_E2E_LAUNCHER_2=1`. It is deliberately **not** in the nx
 * deterministic target: the two browser-host specs are that tier.
 *
 * What makes this vertical different from the browser-host ones, and why each
 * assertion is here rather than borrowed:
 *
 * - The gateway caller is the **utility process**, not the page. Its requests
 *   are Node `fetch`, so a Playwright route cannot see them and there is no
 *   CORS in play at all — the mock has to exist before `electron.launch` and
 *   be named to the utility through `TAU_DESKTOP_AGENT_GATEWAY_URL`. The page
 *   routes stay installed anyway, because the *seeding* turn still runs in the
 *   renderer's browser host.
 * - The durable log has to be the launcher's, on real disk under the project
 *   root — an OPFS or renderer-side artefact would mean the turn never left
 *   the browser host.
 */

const prompt = 'Create a cube with a centered cylindrical cutout and verify it.';
const launcherEnabled = process.env['TAU_E2E_LAUNCHER_2'] !== undefined;
/** W4-ACP's pre-committed selectors. */
const placementTrigger = 'Select agent: This computer';
const desktopRowTestId = 'chat-execution-desktop-row';
const apiLogPath = resolve(import.meta.dirname, '../../../out/test-results/desktop-e2e/api.log');

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

/** The chat id the project route carries, which names the durable log's directory. */
const activeChatId = (url: string): string => {
  const chatId = new URL(url).searchParams.get('chat');
  expect(chatId, `the project route carries no chat id: ${url}`).toBeTruthy();
  return chatId!;
};

test.skipIf(!launcherEnabled)('runs a turn in the services utility and writes its durable log to disk', async () => {
  const account = tauTestAccount('launcher-2');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  /* Before the launch, not after: the utility reads the gateway URL at fork
   * time and calls it with Node `fetch`. */
  fixture = await startGatewayFixture();
  session = await launchDesktopApp({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
    env: { TAU_DESKTOP_AGENT_GATEWAY_URL: `http://127.0.0.1:${String(fixture.port)}` },
    token,
  });
  const { page } = session;
  /* The seeding turn still runs in the renderer's browser host, so the page
   * needs the same routes the deterministic tier installs. */
  await fixture.routeThrough(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, prompt);
    const scriptedRequestsPerTurn = 2;
    await expect
      .poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 })
      .toBeGreaterThanOrEqual(scriptedRequestsPerTurn);
    const projectRoot = join(session.pickedDirectory, slug);
    /** Milliseconds (`mtimeMs`). */
    const seedWritten = statSync(
      await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' }),
    ).mtimeMs;
    const chatId = activeChatId(page.url());

    /* --- the launcher-2 switch: everything above is the browser host --- */
    await parkPointer(page);
    /* The composer names its trigger after the *current* placement
     * (`Select agent: Tau` until the row is picked), so open it by the prefix
     * and take the desktop name as the confirmation that the row took. */
    await page
      .getByRole('button', { name: /^Select agent: /u })
      .first()
      .click();
    await page.getByTestId(desktopRowTestId).first().click();
    await expectVisible(page.getByRole('button', { name: placementTrigger }), 30_000);

    const seedRequests = fixture.gatewayRequests.length;
    await sendPrompt(page, prompt);

    /* 1. The utility served the channel. Produced inside the process that ran
     * the agent, so it cannot come from the renderer. */
    await expect
      .poll(() => (existsSync(session!.logPath) ? readFileSync(session!.logPath, 'utf8') : ''), { timeout: 180_000 })
      .toContain('services.agent-host-served');

    /* 2. The launcher's durable log, on real disk under the project root. A
     * browser-host turn would leave this in OPFS or IndexedDB instead. */
    const eventsPath = join(projectRoot, '.tau/chats', chatId, 'events.jsonl');
    await expect.poll(() => existsSync(eventsPath), { timeout: 180_000 }).toBe(true);
    expect(readFileSync(eventsPath, 'utf8').trim().length).toBeGreaterThan(0);

    /* 3. The utility's `create_file` reached real disk — written after the
     * seed, so the seed's bytes cannot satisfy it — and the renderer's own
     * watcher rendered it. */
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, {
      extension: '.scad',
      writtenAfter: seedWritten,
    });
    expect(readFileSync(sourcePath, 'utf8').length).toBeGreaterThan(0);
    await expectGeometryFramed(page);
    expect(fixture.gatewayRequests.length).toBeGreaterThan(seedRequests);

    /* 4. No run row. The API holds the chat *record* and nothing else: every
     * `POST /v1/chat` it served is a create, and no gateway traffic reached it
     * — the utility talks to the mock directly, the renderer through a route. */
    const apiLog = readFileSync(apiLogPath, 'utf8');
    expect(apiLog).not.toMatch(/v1\/llm/u);
    expect((apiLog.match(/"method":"POST","url":"\/v1\/chat"/gu) ?? []).length).toBe(
      (apiLog.match(/Creating chat: chat_/gu) ?? []).length,
    );

    console.info(
      `[desktop-e2e] launcher-2 chat=${chatId} events=${String(readdirSync(join(projectRoot, '.tau/chats')).length)} chats on disk`,
    );
  } catch (error) {
    await session.capture('launcher-2-failure');
    throw error;
  }
});
