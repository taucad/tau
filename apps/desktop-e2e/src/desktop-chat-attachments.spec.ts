/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire is snake_case. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * W15's deterministic desktop attachment proof.
 *
 * A PDF attached in the renderer must reach the provider as bytes, and the
 * whole chain that carries it is only real on the desktop: the draft's blob is
 * written to Home by the renderer, the **services utility** reads it back at
 * materialisation (D15), the sentinel is rewritten in `onPayload` (D21) and the
 * API gateway admits the document block (D24). What the stub sees is the
 * finished Anthropic body, so a break anywhere on that chain fails here.
 *
 * The OpenAI Responses half of the blueprint's row is **not** covered: the
 * development provider seam (`billing.module.ts`, `providerUpstreamFetch`)
 * rewrites only `api.anthropic.com`, so an OpenAI-codec turn would leave this
 * machine for the real provider. Widening that host set is an `apps/api` change
 * and is reported rather than made here; the three provider wire shapes are
 * pinned at the unit level by `document-payload.test.ts` (W11).
 */

const fixturePdfPath = resolve(import.meta.dirname, '../fixtures/bracket-spec.pdf');
const seedPrompt = 'Create a cube with a centered cylindrical cutout and verify it.';
const attachmentPrompt = 'Read the attached specification and keep its dimensions.';
const sentinelMarker = 'tau:document:';

type WireBlock = {
  readonly type?: string;
  readonly source?: { readonly type?: string; readonly media_type?: string; readonly data?: string };
};
type WireRequest = { readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }> };

/** Every `document` block the request's user messages carry. */
const documentBlocks = (request: unknown): readonly WireBlock[] =>
  ((request as WireRequest).messages ?? [])
    .filter((message) => message.role === 'user')
    .flatMap((message) => (Array.isArray(message.content) ? (message.content as readonly WireBlock[]) : []))
    .filter((block) => block.type === 'document');

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

test('sends an attached PDF to the provider as a document block with no sentinel left', async () => {
  const account = tauTestAccount('attachments');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);
  const pdfBase64 = readFileSync(fixturePdfPath).toString('base64');

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, seedPrompt);
    /* Two requests is the seeding turn's own completion signal — the tool call
     * and the closing message — the same one the in-project spec waits on. */
    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
    await waitForProjectOnDisk(session.homeRoot, slug, { extension: '.scad' });
    const requestsBefore = fixture.gatewayRequests.length;
    const repliesBefore = await page.getByText(gatewayFixtureFinalText, { exact: true }).count();

    /* The composer's own picker input: its `accept` list carries the PDF type
     * only while the selected model reads PDFs (D20), so a model gate that
     * closed would fail here rather than silently attach nothing. */
    await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles(fixturePdfPath);
    await expectVisible(page.getByText(/^PDF · /u).first(), 60_000);
    await sendPrompt(page, attachmentPrompt);

    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 180_000 }).toBeGreaterThan(requestsBefore);
    const turnRequests = fixture.gatewayRequests.slice(requestsBefore);
    const blocks = turnRequests.flatMap((request) => documentBlocks(request));
    expect(blocks.length, 'the turn carried no provider document block').toBeGreaterThan(0);
    expect(blocks[0]?.source).toMatchObject({
      type: 'base64',
      media_type: 'application/pdf',
      data: pdfBase64,
    });
    for (const request of turnRequests) {
      expect(JSON.stringify(request)).not.toContain(sentinelMarker);
    }

    /* The bytes rode by reference: the durable row is a `file-ref`, and the
     * blob lives in the chat's own directory, named by its SHA-256 (D12/D13). */
    const chatId = activeChatId(page);
    const chatDirectory = join(session.homeRoot, slug, '.tau/chats', chatId);
    const pdfName = `${createHash('sha256').update(readFileSync(fixturePdfPath)).digest('hex')}.pdf`;
    await expect
      .poll(
        () => {
          const attachments = join(chatDirectory, 'attachments');
          return existsSync(attachments) ? readdirSync(attachments) : [];
        },
        { timeout: 60_000 },
      )
      .toEqual([pdfName]);
    expect(readFileSync(join(chatDirectory, 'events.jsonl'), 'utf8')).toContain('"file-ref"');
    await expectVisible(page.getByRole('link', { name: 'bracket-spec.pdf' }).first(), 60_000);

    await expect
      .poll(async () => page.getByText(gatewayFixtureFinalText, { exact: true }).count(), { timeout: 180_000 })
      .toBeGreaterThan(repliesBefore);
  } catch (error) {
    await session.capture('attachments-failure');
    throw error;
  }
});
