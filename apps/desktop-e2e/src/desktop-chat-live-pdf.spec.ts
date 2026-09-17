import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauCreditBalanceAtoms, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
  waitForRunToSettle,
} from '#support/scenario.js';

/**
 * W15's live proof that **the model reads the PDF** (blueprint §Test Plan,
 * desktop row 2).
 *
 * `bracket-spec.pdf` states a 7.3 mm hole diameter and a 4.5 mm plate thickness
 * that appear nowhere in the prompt, and the prompt carries a decoy 12 mm
 * dimension that the model must not use for the hole. A run that never opened
 * the document cannot produce 7.3 and 4.5, so this is the one assertion the
 * deterministic tier cannot make.
 *
 * Gated exactly like `desktop-chat-live.spec.ts`: on the explicit
 * `TAU_E2E_LIVE_LLM` flag and **never** on key presence, because
 * `apps/api/.env.test` ships non-empty mock provider keys. The seeding turn runs
 * on the stubbed Anthropic host; the live turn's own wire (`TAU_E2E_LIVE_MODEL`,
 * OpenAI by default) reaches the real provider and earns the credit delta.
 */

const live = process.env['TAU_E2E_LIVE_LLM'] === 'true';
const modelName = process.env['TAU_E2E_LIVE_MODEL'] ?? 'GPT-5.6 Luna';
const fixturePdfPath = resolve(import.meta.dirname, '../fixtures/bracket-spec.pdf');
const seedPrompt = 'Create a 20 mm cube in main.scad.';
/** The decoy lives only here; the two real numbers live only in the PDF. */
const livePrompt =
  'Model the mounting bracket described in the attached specification. ' +
  'Use exactly the hole diameter and plate thickness it gives. ' +
  'Ignore the 12 mm envelope note someone left on the ticket.';

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

test.skipIf(!live)('models the bracket from the attached specification on a live model', async () => {
  const account = tauTestAccount('live-pdf');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);

    // Create the project on the mocked wire, then switch to the live one.
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, seedPrompt);
    await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
    await waitForRunToSettle(page, 300_000);
    await selectChatModel(page, modelName);
    /** Milliseconds (`mtimeMs`): the seed's own bytes must not satisfy the wait below. */
    const seedWritten = statSync(
      await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' }),
    ).mtimeMs;

    await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles(fixturePdfPath);
    await expectVisible(page.getByText(/^PDF · /u).first(), 60_000);

    const creditsBefore = await tauCreditBalanceAtoms(token);
    const liveStart = Date.now();
    await sendPrompt(page, livePrompt);
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, {
      extension: '.scad',
      writtenAfter: seedWritten,
    });
    await waitForRunToSettle(page, 480_000);
    const creditsAfter = await tauCreditBalanceAtoms(token);
    const spentAtoms = creditsBefore - creditsAfter;
    console.info(
      `[desktop-e2e] live PDF spend: ${String(spentAtoms)} credit atoms ` +
        `(${String(creditsBefore)} → ${String(creditsAfter)}) over ${String(Date.now() - liveStart)} ms`,
    );
    expect(spentAtoms, 'the live run metered no credits — no provider call was made').toBeGreaterThan(0);

    const source = readFileSync(sourcePath, 'utf8');
    const reply = await page.locator('article').last().textContent();
    const answer = `${source}\n${reply ?? ''}`;
    console.info(`[desktop-e2e] live PDF model=${modelName} wrote ${sourcePath} (${String(source.length)} bytes)`);

    /* The two numbers exist only inside the PDF: a turn that did not read the
     * document cannot write either of them. */
    expect(answer, 'the reply and the source name no 7.3 mm hole from the spec').toContain('7.3');
    expect(answer, 'the reply and the source name no 4.5 mm plate thickness from the spec').toContain('4.5');
    /* The prompt's decoy must not become the hole: 12 (or its radius, 6) as the
     * bore would mean the model followed the text over the document. */
    expect(source, 'the decoy 12 mm was used for the hole').not.toMatch(
      /(?:hole|bore|diameter|d)\s*(?:_?(?:diameter|dia))?\s*=\s*12(?:\.0+)?\b/iu,
    );
    expect(source, 'the decoy 12 mm was used as the hole radius').not.toMatch(
      /(?:hole|bore|r)\s*(?:_?radius)?\s*=\s*6(?:\.0+)?\b/iu,
    );
  } catch (error) {
    await session.capture('live-pdf-failure');
    throw error;
  }
});
