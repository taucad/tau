import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { desktopE2EApiUrl } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  gatewayFixtureModelName,
  gatewayFixtureSupplierModelId,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauCreditBalanceAtoms, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectGeometryFramed,
  expectLauncher2Turn,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * Launcher 2 end to end, through the real Tau gateway (charter C3, D16/D19).
 *
 * Every desktop turn is launcher 2 now — D18 removed the browser placement row,
 * so there is no row to pick and no browser-host phase to switch out of. What
 * makes this spec distinct from the two disk-focused chat specs is the *funded
 * path*: the services utility calls the API's own `/v1/llm/anthropic/v1/messages`
 * with Node `fetch` and the API admits, qualifies, meters and forwards it, with
 * only the last hop landing on this suite's provider stub.
 *
 * D16 is asserted in both directions:
 *
 * - **Forwarded.** The stub refuses anything but the supplier id
 *   `claude-haiku-4-5-20251001`, so a served turn is proof the gateway rewrote
 *   the catalog route id the client sent.
 * - **Inbound.** The gateway is asked directly for the *supplier* id and refuses
 *   it, so the catalog vocabulary is the only one it accepts.
 *
 * The receipt is the account's own credit balance, priced by the development
 * policy from the usage the stub emits.
 */

const prompt = 'Create a cube with a centered cylindrical cutout and verify it.';
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

/**
 * Fastify's own request ids for the gateway route, in the suite's API log.
 *
 * The one witness that the turn crossed the real API rather than any fixture:
 * it is written by the API process, before the billing owner runs.
 */
const gatewayRequestIds = (): readonly string[] => {
  const log = existsSync(apiLogPath) ? readFileSync(apiLogPath, 'utf8') : '';
  const matches = log.matchAll(/"id":"(req_[^"]+)","method":"POST","url":"\/v1\/llm\/anthropic\/v1\/messages"/gu);
  return [...new Set([...matches].map((match) => match[1]!))];
};

test('runs a turn in the services utility through the real Tau gateway', async () => {
  const account = tauTestAccount('launcher-2');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  const creditsBefore = await tauCreditBalanceAtoms(token);
  /* Before the launch: the API learned the stub's fixed origin at boot, and the
   * utility's first turn dispatches itself as soon as the project's chat loads. */
  fixture = await startGatewayFixture();
  session = await launchDesktopApp({ token });
  const { page } = session;
  await fixture.routeThrough(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
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
    const chatId = activeChatId(page);

    const seedRequests = fixture.gatewayRequests.length;
    await sendPrompt(page, prompt);

    /* 1 & 2. The utility served the channel and its durable log is on real disk. */
    await expectLauncher2Turn(session.logPath, projectRoot, chatId);

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

    /* 4. D16 admission: the turn crossed the API's funded gateway, not a mock.
     * Written by the API process itself, so no fixture can forge it. */
    const requestIds = gatewayRequestIds();
    expect(requestIds.length, 'the API log recorded no /v1/llm/anthropic gateway request').toBeGreaterThanOrEqual(
      fixture.gatewayRequests.length,
    );

    /* 5. D16 forwarded: one vocabulary, translated exactly once. */
    expect([...new Set(fixture.supplierModels)]).toStrictEqual([gatewayFixtureSupplierModelId]);
    /* The admitted beta feature reaches the supplier normalized, never dropped:
     * the one value pi sends on this wire today. */
    expect([...new Set(fixture.supplierBetas)]).toStrictEqual(['interleaved-thinking-2025-05-14']);

    /* 6. D16 inbound: the gateway takes catalog route ids and refuses the
     * supplier id it forwards. No `origin` header — this is a node caller,
     * admitted by the same bearer the utility uses. */
    const refused = await fetch(`${desktopE2EApiUrl}/v1/llm/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-tau-attempt-id': `desktop-e2e-${chatId}-vocabulary`,
      },
      body: JSON.stringify({
        model: gatewayFixtureSupplierModelId,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic's provider wire is snake_case.
        max_tokens: 8,
        stream: true,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    /* `stream: true` keeps the body inside the wire schema, so the 400 can only
     * be the route lookup refusing the supplier id. */
    expect([refused.status, await refused.text()]).toStrictEqual([
      400,
      expect.stringContaining('Model route is not qualified'),
    ]);

    /* 7. The receipt. The stub's `message_start`/`message_delta` usage is priced
     * through the published development policy, so a funded turn is the only
     * thing that can move this balance. Polled: settlement is asynchronous. */
    await expect.poll(async () => tauCreditBalanceAtoms(token), { timeout: 120_000 }).toBeLessThan(creditsBefore);

    console.info(
      `[desktop-e2e] launcher-2 chat=${chatId} gateway request ids=${requestIds.join(',')} ` +
        `supplier=${[...new Set(fixture.supplierModels)].join(',')} ` +
        `events=${String(readdirSync(join(projectRoot, '.tau/chats')).length)} chats on disk`,
    );
  } catch (error) {
    await session.capture('launcher-2-failure');
    throw error;
  }
});
