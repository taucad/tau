/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire is snake_case. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import { base64ToUint8Array, concatUint8Arrays, uint8ArrayToBase64 } from 'uint8array-extras';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import { waitForCaptureAttachments, waitForRenderedGeometry } from '#support/headless-capture.js';
import type { AnthropicRequest, FixtureFile, RecordFile, StoredFile } from '#support/chat-attachments.js';
import {
  chooseAttachment,
  composerSelector,
  dismissCookies,
  dropAttachment,
  dropOverCapPdf,
  expectRail,
  expectToast,
  fixtureFile,
  homeFileNames,
  imageOnlyModelName,
  lastUserMediaBlocks,
  listHomeDirectory,
  pasteAttachment,
  pdfModelName,
  prepareComposerPage,
  readHomeJson,
  recordDraftText,
  recordPaths,
  seededChatIds,
  selectModel,
  sendDraft,
  sha256OfBase64,
  toastTexts,
} from '#support/chat-attachments.js';

/**
 * The blueprint's browser proof for attachments (W15): every ingest path lands
 * one content-addressed file beside the chat's composer record, a send moves the
 * bytes into the chat's own directory and puts them on the wire as base64, and
 * nothing is written twice. Storage is read from OPFS directly.
 */

const replyText = 'Attachments received.';
const replyScript: readonly GatewayScriptTurn[] = [{ text: replyText, usage: { inputTokens: 20, outputTokens: 4 } }];
const sentText = 'Model the bracket per the attached spec.';
const sentinelMarker = 'tau:document:';

/**
 * The same JPEG with `marker` appended after its end-of-image marker, which
 * decoders ignore: distinct bytes, so each ingest path names its own file.
 */
const jpegVariant = (file: FixtureFile, marker: number): FixtureFile => ({
  ...file,
  base64: uint8ArrayToBase64(concatUint8Arrays([base64ToUint8Array(file.base64), Uint8Array.of(marker)])),
  name: `bracket-photo-${String(marker)}.jpg`,
});

const openSeededChat = async (query = ''): Promise<{ projectId: string; chatIds: readonly string[] }> => {
  await prepareComposerPage();
  await target.installAgentHostGatewayFixture(replyScript);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate(`/__e2e/chat-attachments${query}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await dismissCookies();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await selectModel(pdfModelName);
  return seededChatIds();
};

const expectFiles = async (directory: string, expected: readonly string[]): Promise<readonly StoredFile[]> => {
  let files: readonly StoredFile[] = [];
  await expect
    .poll(
      async () => {
        files = await listHomeDirectory(directory);
        return files.map(({ name }) => name);
      },
      { timeout: 30_000 },
    )
    .toEqual([...expected].sort());
  return files;
};

const gatewayRequests = async (): Promise<readonly AnthropicRequest[]> => {
  const requests = await target.readAgentHostGatewayRequests();
  return requests as AnthropicRequest[];
};

const gatewayRequestCount = async (): Promise<number> => {
  const requests = await gatewayRequests();
  return requests.length;
};

test('stores each ingest path as one file beside the chat record and restores the draft on reload', async () => {
  const { projectId, chatIds } = await openSeededChat();
  const chatId = chatIds[0]!;
  const draftDirectory = recordPaths.chatDraftAttachments(projectId, chatId);
  const jpeg = await fixtureFile('bracket-photo.jpg');
  const pdf = await fixtureFile('bracket-spec.pdf');
  const pdfName = `${await sha256OfBase64(pdf.base64)}.pdf`;

  const pasted = jpegVariant(jpeg, 1);
  const dropped = jpegVariant(jpeg, 2);
  const expected: string[] = [];

  await pasteAttachment(pasted);
  await expectRail({ images: 1, pdfs: 0 });
  expected.push(`${await sha256OfBase64(pasted.base64)}.jpg`);
  await expectFiles(draftDirectory, expected);

  await dropAttachment(dropped);
  await expectRail({ images: 2, pdfs: 0 });
  expected.push(`${await sha256OfBase64(dropped.base64)}.jpg`);
  await expectFiles(draftDirectory, expected);

  await chooseAttachment(jpeg);
  await expectRail({ images: 3, pdfs: 0 });
  expected.push(`${await sha256OfBase64(jpeg.base64)}.jpg`);
  const stored = await expectFiles(draftDirectory, expected);
  // Stored as given: a JPEG within the limits is never re-encoded.
  expect(stored.find(({ name }) => name === expected[2])?.size).toBe(base64ToUint8Array(jpeg.base64).length);

  await waitForRenderedGeometry('gltf');
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(4);
  await expect
    .poll(
      async () => {
        const files = await homeFileNames(draftDirectory);
        return files.length;
      },
      { timeout: 30_000 },
    )
    .toBe(4);
  const afterCapture = await listHomeDirectory(draftDirectory);
  const capture = afterCapture.find(({ name }) => !expected.includes(name));
  expect(capture?.name).toMatch(/^[\da-f]{64}\.(?:webp|png)$/u);
  expect(capture?.name.slice(0, 64)).toBe(capture?.sha256);

  // A PDF by picker, then the same bytes by drop: two chips, one file (D12).
  await chooseAttachment(pdf);
  await expectRail({ images: 4, pdfs: 1 });
  await dropAttachment(pdf);
  await expectRail({ images: 4, pdfs: 2 });
  const withPdf = await listHomeDirectory(draftDirectory);
  expect(withPdf.filter(({ name }) => name.endsWith('.pdf')).map(({ name }) => name)).toEqual([pdfName]);
  expect(withPdf).toHaveLength(5);

  const draftText = 'Keep this bracket draft across a reload.';
  await target.type(selectors.getByCss(composerSelector).first(), draftText);
  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatId));
        return {
          text: recordDraftText(record),
          files: record?.draft?.parts.filter((part) => part.type === 'file').length ?? 0,
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({ text: draftText, files: 6 });

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await expectRail({ images: 4, pdfs: 2 });
  await target.expectContainingText(selectors.getByCss(composerSelector).first(), draftText, 30_000);
});

test('refuses an over-cap PDF and a PDF the selected model cannot read without writing a file', async () => {
  const { projectId, chatIds } = await openSeededChat();
  const draftDirectory = recordPaths.chatDraftAttachments(projectId, chatIds[0]!);
  const pdf = await fixtureFile('bracket-spec.pdf');

  // D17: one byte over 16 MiB is a toast and no draft change.
  await dropOverCapPdf();
  await expectToast("Couldn't attach file");
  await expectRail({ images: 0, pdfs: 0 });
  expect(await listHomeDirectory(draftDirectory)).toEqual([]);

  // D20: a model without `pdf` refuses the PDF before any byte is written, and names itself.
  await selectModel(imageOnlyModelName);
  await chooseAttachment(pdf);
  await expectToast(`${imageOnlyModelName} can't read PDFs`);
  await expectRail({ images: 0, pdfs: 0 });
  expect(await listHomeDirectory(draftDirectory)).toEqual([]);

  // A PDF already in the draft disables Send and states why once the model changes.
  await selectModel(pdfModelName);
  await chooseAttachment(pdf);
  await expectRail({ images: 0, pdfs: 1 });
  await selectModel(imageOnlyModelName);
  await target.expectVisible(
    selectors.getByText(`${imageOnlyModelName} can't read PDFs. Remove the PDF or pick another model.`),
  );
  const { length: toastsBefore } = await toastTexts();
  // Enter, not the Send button: a disabled button never becomes clickable.
  await target.type(selectors.getByCss(composerSelector).first(), 'This must not send.');
  await target.press(selectors.getByCss(composerSelector).first(), 'Enter');
  await target.delay(1000);
  expect(await target.readAgentHostGatewayRequests()).toEqual([]);
  const toastsAfter = await toastTexts();
  expect(toastsAfter).toHaveLength(toastsBefore);
});

test('sends from the chat directory, renders and downloads both attachments, and retries or edits without copying', async () => {
  const { projectId, chatIds } = await openSeededChat();
  const chatId = chatIds[0]!;
  const draftDirectory = recordPaths.chatDraftAttachments(projectId, chatId);
  const chatDirectory = recordPaths.chatAttachments(chatId);
  const jpeg = await fixtureFile('bracket-photo.jpg');
  const pdf = await fixtureFile('bracket-spec.pdf');
  const sentNames = [`${await sha256OfBase64(jpeg.base64)}.jpg`, `${await sha256OfBase64(pdf.base64)}.pdf`];

  await chooseAttachment(jpeg);
  await chooseAttachment(pdf);
  await expectRail({ images: 1, pdfs: 1 });

  // The first attempt is refused by the provider, so the send and its retry are both observed.
  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused once for the retry proof.' });
  await sendDraft(sentText);
  await target.expectVisible(selectors.getByRole('button', { name: 'Try again' }), 120_000);

  // D18: the bytes moved before the message was sent; the draft stage is emptied behind them.
  await expectFiles(chatDirectory, sentNames);
  await expectFiles(draftDirectory, []);
  const record = await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatId));
  expect(record?.draft).toBeUndefined();

  await target.setAgentHostGatewayFailure();
  await target.click(selectors.getByRole('button', { name: 'Try again' }));
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);

  const requests = await gatewayRequests();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  for (const request of requests) {
    const blocks = lastUserMediaBlocks(request);
    expect(blocks.map(({ type }) => type)).toEqual(['image', 'document']);
    expect(blocks[0]?.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: jpeg.base64 });
    expect(blocks[1]?.source).toMatchObject({ type: 'base64', media_type: 'application/pdf', data: pdf.base64 });
    expect(JSON.stringify(request)).not.toContain(sentinelMarker);
  }
  await expectFiles(chatDirectory, sentNames);

  // The transcript resolves both from the chat directory.
  const transcriptImage = selectors.getByRole('button', { name: 'Open image bracket-photo.jpg' });
  await target.expectVisible(transcriptImage, 30_000);
  await expect.poll(async () => target.getAttribute(transcriptImage.getByRole('img'), 'src')).toMatch(/^blob:/u);
  const chip = selectors.getByCss('[aria-label="Attached files"]').getByRole('link', { name: 'bracket-spec.pdf' });
  await target.expectVisible(chip);

  const pdfDownload = await target.download(chip);
  expect(pdfDownload.suggestedFilename).toBe('bracket-spec.pdf');
  expect(pdfDownload.base64).toBe(pdf.base64);

  await target.click(transcriptImage);
  const imageDownload = await target.download(selectors.getByRole('link', { name: 'Download bracket-photo.jpg' }));
  expect(imageDownload.suggestedFilename).toBe('bracket-photo.jpg');
  expect(imageDownload.base64).toBe(jpeg.base64);
  await target.click(selectors.getByRole('button', { name: 'Close image preview' }));

  // An edit re-references the chat's attachments: a new request, no new bytes anywhere.
  const requestsBeforeEdit = requests.length;
  await target.click(selectors.getByRole('button', { name: new RegExp(sentText, 'u') }).first());
  const editComposer = selectors.getByCss(`article ${composerSelector}`).first();
  await target.expectVisible(editComposer);
  // F5: the edit's rail finds the sent image in the chat directory, not the emptied draft stage.
  const editRailImage = selectors.getByCss('article').getByRole('button', { name: 'Open uploaded image 1' });
  await target.expectVisible(editRailImage, 30_000);
  await expect.poll(async () => target.getAttribute(editRailImage.getByRole('img'), 'src')).toMatch(/^blob:/u);
  await target.type(editComposer, ' Use the photo too.');
  await target.press(editComposer, 'Enter');
  await expect.poll(gatewayRequestCount, { timeout: 120_000 }).toBeGreaterThan(requestsBeforeEdit);
  const afterEdit = await gatewayRequests();
  const edited = afterEdit[requestsBeforeEdit]!;
  expect(lastUserMediaBlocks(edited).map(({ type }) => type)).toEqual(['image', 'document']);
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);
  await expectFiles(chatDirectory, sentNames);
  expect(await listHomeDirectory(draftDirectory)).toEqual([]);
});

test('writes a CAD capture as an attachment and sends it to the provider as base64', async () => {
  const { projectId, chatIds } = await openSeededChat();
  const chatId = chatIds[0]!;
  await waitForRenderedGeometry('gltf');
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const draftDirectory = recordPaths.chatDraftAttachments(projectId, chatId);
  await expect
    .poll(
      async () => {
        const files = await homeFileNames(draftDirectory);
        return files.length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  const [capture] = await listHomeDirectory(draftDirectory);
  expect(capture?.name).toMatch(/^[\da-f]{64}\.(?:webp|png)$/u);

  await sendDraft('Check the captured view.');
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);
  await expectFiles(recordPaths.chatAttachments(chatId), [capture!.name]);
  const [request] = await gatewayRequests();
  const [image] = lastUserMediaBlocks(request!);
  expect(image?.type).toBe('image');
  expect(await sha256OfBase64(image?.source?.data ?? '')).toBe(capture!.sha256);
});

test('deletes the chat record and its draft stage and keeps the tombstoned chat attachments (D11, corrected)', async () => {
  const { projectId, chatIds } = await openSeededChat('?chats=2');
  const chatId = chatIds[0]!;
  const jpeg = await fixtureFile('bracket-photo.jpg');
  const pdf = await fixtureFile('bracket-spec.pdf');
  const pdfName = `${await sha256OfBase64(pdf.base64)}.pdf`;

  await chooseAttachment(pdf);
  await expectRail({ images: 0, pdfs: 1 });
  await sendDraft(sentText);
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);
  await expectFiles(recordPaths.chatAttachments(chatId), [pdfName]);

  // A draft left behind: a record and a draft-stage file to remove.
  await chooseAttachment(jpeg);
  await expectRail({ images: 1, pdfs: 0 });
  await expectFiles(recordPaths.chatDraftAttachments(projectId, chatId), [`${await sha256OfBase64(jpeg.base64)}.jpg`]);
  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatId));
        return record?.draft !== undefined;
      },
      {
        timeout: 30_000,
      },
    )
    .toBe(true);

  const row = selectors.getByCss('[data-slot="chat-trigger"]').filter({ hasText: 'Attachments chat' });
  await target.hover(row);
  await target.click(selectors.getByRole('button', { name: 'More actions for Attachments chat' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Delete' }));

  await expect.poll(async () => readHomeJson(recordPaths.chat(projectId, chatId)), { timeout: 30_000 }).toBeUndefined();
  await expectFiles(recordPaths.chatDraftAttachments(projectId, chatId), []);
  /* Blueprint §GC (D11, corrected): chat delete writes a tombstone and nothing
   * else, so the log's own attachment bytes stay behind it. §Test Plan's older
   * "delete chat removes both directories" is superseded by that correction. */
  await expectFiles(recordPaths.chatAttachments(chatId), [pdfName]);
});
