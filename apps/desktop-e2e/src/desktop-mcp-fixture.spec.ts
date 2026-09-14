import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectSignedIn,
  expectVisible,
  openExecutionPicker,
  selectKernel,
  submitPrompt,
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
 * `NODE_ENV=test`, so nothing here can arm a shipped app. `skill-names` proves
 * that the same utility exposed packaged Tau skills through the adapter's native
 * root, and `mcp` makes it call `test_model` through the `tau` server it was
 * handed. A second turn exercises the desktop approval UI and exact ACP option
 * round trip without pretending Tau owns the downstream standing-grant store.
 */

const externalPrompt = 'noask skill-names mcp';

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
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    const rows = await openExecutionPicker(page);
    expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
    await page
      .getByRole('option', { name: /^Codex/u })
      .first()
      .click();

    /* Run the first project turn through the fake ACP adapter. This fixture
     * tests the desktop utility boundary, so it must not depend on a separate
     * Tau-provider seed succeeding before the ACP path can start. */
    const gatewayCallsBefore = fixture.gatewayRequests.length;
    await submitPrompt(page, externalPrompt);
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
    const chatId = activeChatId(page);
    const projectRootNow = (): string => {
      const { pathname } = new URL(page.url());
      return join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1));
    };

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
    const eventsPathNow = (): string => join(projectRootNow(), '.tau/chats', chatId, 'events.jsonl');
    await expect
      .poll(() => (existsSync(eventsPathNow()) ? readFileSync(eventsPathNow(), 'utf8') : ''), { timeout: 300_000 })
      .toMatch(/"role":"tool-output","toolCallId":"[^"]+","toolName":"test_model"/u);
    const eventsPath = eventsPathNow();
    const evidence = readFileSync(eventsPath, 'utf8')
      .split('\n')
      .findLast((line) => line.includes('"role":"tool-output"') && line.includes('"toolName":"test_model"'));
    expect(evidence).toMatch(/"content":\{"failures":.*"total":\d+\}/u);
    expect(evidence).toMatch(/"agentId":"codex"/u);
    const durableLog = readFileSync(eventsPath, 'utf8');
    expect(durableLog).toMatch(/native-skill-names:.*cad-openscad/u);
    expect(durableLog).toMatch(/"name":"\$cad-openscad"/u);

    /* 3. The normalized ACP call uses the same native CAD card as a Tau turn,
     * instead of the generic external-tool disclosure. */
    await expectVisible(page.getByText('Tested 1 requirement', { exact: true }), 60_000);

    /* 4. The real desktop banner returns the exact standing option the user
     * chose. The fixture echoes that id from the ACP response, while the durable
     * interrupt proves the UI did not merely dismiss itself locally. */
    const priorLog = readFileSync(eventsPath, 'utf8');
    await submitPrompt(page, 'approval round trip');
    await expectVisible(page.getByRole('region', { name: 'Approval required' }), 60_000);
    await page.getByRole('button', { name: 'Always allow', exact: true }).click();
    await expect
      .poll(() => readFileSync(eventsPath, 'utf8').slice(priorLog.length), { timeout: 60_000 })
      .toMatch(/"phase":"resolved".*"optionId":"allow-always"/u);
    await expect
      .poll(() => readFileSync(eventsPath, 'utf8').slice(priorLog.length), { timeout: 60_000 })
      .toMatch(/"role":"tool-output".*"optionId":"allow-always"/u);
    await expect.poll(async () => page.getByRole('region', { name: 'Approval required' }).count()).toBe(0);

    /* 5. Still an external turn: the gateway saw nothing. */
    expect(fixture.gatewayRequests.length).toBe(gatewayCallsBefore);

    console.info(`[desktop-e2e] mcp chat=${chatId} project=${projectRootNow()}`);
  } catch (error) {
    await session.capture('mcp-fixture-failure');
    throw error;
  }
});
