import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  declineCookieBanner,
  expectSignedIn,
  expectVisible,
  openExecutionPicker,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * The desktop's own MCP endpoint (V7), on a deterministic tier.
 *
 * `desktop-chat-acp.spec.ts` proves the *real* adapters resolve and answer, and
 * spends the operator's Codex quota to do it. This one proves the half no
 * vendor CLI is needed for and no unit test can reach: that the services
 * utility — an Electron `utilityProcess`, not a plain Node daemon — binds a
 * loopback HTTP listener inside the `agentHost` concern, and that an agent
 * child spawned by that utility reaches it with a real MCP request whose result
 * lands in the durable log.
 *
 * The agent is the repository's fake ACP adapter, admitted through
 * `TAU_ACP_ADAPTER_OVERRIDE` — which `discoverAcpAgents` honours only under
 * `NODE_ENV=test`, so nothing here can arm a shipped app. `noask` skips the
 * fixture's permission round trip (there is no approval under test here) and
 * `mcp` is what makes it call `test_model` through the `tau` server it was
 * handed.
 */

const seedPrompt = 'Create a cube with a centered cylindrical cutout and verify it.';
const externalPrompt = 'noask mcp';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const fakeAcpAgent = join(workspaceRoot, 'packages/host/src/acp/fixtures/fake-agent.ts');

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

test('serves the utility MCP endpoint to an agent it spawned', async () => {
  const account = tauTestAccount('mcp');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({
    token,
    /* Last spread in `launchDesktopApp`, so this deliberately replaces the
     * suite's own `NODE_ENV=production`: the override is refused otherwise. */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    env: { NODE_ENV: 'test', TAU_ACP_ADAPTER_OVERRIDE: `${fakeAcpAgent}:codex` },
  });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    /* The seeding turn is an ordinary Tau turn: it creates the project, its
     * chat and the workspace root the utility's launcher is scoped to. */
    const slug = await submitPrompt(page, seedPrompt);
    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
    const projectRoot = join(session.pickedDirectory, slug);
    await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
    const chatId = activeChatId(page);

    const rows = await openExecutionPicker(page);
    expect(rows.join('\n')).toMatch(/Codex · This computer/u);
    await page
      .getByRole('option', { name: /Codex · This computer/u })
      .first()
      .click();

    const gatewayCallsBefore = fixture.gatewayRequests.length;
    await sendPrompt(page, externalPrompt);

    /* 1. The Electron utility bound a loopback listener — the runtime claim the
     * charter names as unverified. Written by the utility process itself. */
    await expect
      .poll(() => (existsSync(session!.logPath) ? readFileSync(session!.logPath, 'utf8') : ''), { timeout: 300_000 })
      .toMatch(/services\.mcp-listening.*"origin":"http:\/\/127\.0\.0\.1:\d+"/u);

    /* 2. The agent child reached it, and the request was answered by *this*
     * utility's tool registry: the durable log carries GeoSpec's own structured
     * verdict, which only the host runner behind the endpoint can produce. (The
     * verdict is `missing_geospec_file` because the project tree this turn
     * ran in holds the seeded `.scad` and no spec — a real answer, and the one
     * thing an unreachable endpoint could never return.) */
    const eventsPath = join(projectRoot, '.tau/chats', chatId, 'events.jsonl');
    await expect
      .poll(() => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8') : ''), { timeout: 300_000 })
      .toMatch(/"role":"tool-output","toolCallId":"[^"]+","toolName":"test_model"/u);
    const evidence = readFileSync(eventsPath, 'utf8')
      .split('\n')
      .findLast((line) => line.includes('"role":"tool-output"') && line.includes('"toolName":"test_model"'));
    expect(evidence).toMatch(/"structuredContent":\{"failures":.*"total":\d+\}/u);
    expect(evidence).toMatch(/"agentId":"codex"/u);

    /* 3. Still an external turn: the gateway saw nothing. */
    expect(fixture.gatewayRequests.length).toBe(gatewayCallsBefore);

    console.info(`[desktop-e2e] mcp chat=${chatId} project=${projectRoot}`);
  } catch (error) {
    await session.capture('mcp-fixture-failure');
    throw error;
  }
});
