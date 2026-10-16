import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { RecordFile } from '#support/chat-attachments.js';
import {
  chooseAttachment,
  composerSelector,
  expectRail,
  fixtureFile,
  homeFileNames,
  pdfModelName,
  readHomeJson,
  recordDraftText,
  recordPaths,
  selectModel,
  sha256OfBase64,
} from '#support/chat-attachments.js';
import { readProjectStorageState } from '#support/project-storage-state.js';

test('should hydrate the normal app route beyond the Home storage bootstrap shell', async () => {
  await target.navigate('/');

  await target.expectVisible(selectors.getByRole('main'), 30_000);
  await target.expectHidden(selectors.getByRole('status', { name: 'Opening Home' }));
});

test('should retain the app home after a confirmed anonymous session', async () => {
  await target.addInitScript(() => {
    const fetchFromNetwork = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl = input instanceof Request ? input.url : input.toString();
      if (new URL(requestUrl, location.href).pathname === '/v1/auth/get-session') {
        return Response.json(null);
      }
      return fetchFromNetwork(input, init);
    };
  });
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('heading', { name: 'What can I help you build?' }), 30_000);
  await target.expectVisible(selectors.getByRole('heading', { name: 'Projects', level: 2 }));
});

test('keeps a Home draft with an image and a PDF across a reload and hands both to the new project', async () => {
  const replyText = 'Home attachments received.';
  const script: readonly GatewayScriptTurn[] = [{ text: replyText, usage: { inputTokens: 20, outputTokens: 4 } }];
  await target.installAgentHostGatewayFixture(script);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('main'), 30_000);
  const composer = selectors.getByCss(composerSelector).first();
  await target.expectVisible(composer, 60_000);
  await selectModel(pdfModelName);

  const jpeg = await fixtureFile('bracket-photo.jpg');
  const pdf = await fixtureFile('bracket-spec.pdf');
  const names = [`${await sha256OfBase64(jpeg.base64)}.jpg`, `${await sha256OfBase64(pdf.base64)}.pdf`];
  const draftText = 'Model the bracket from this Home draft.';
  await chooseAttachment(jpeg);
  await chooseAttachment(pdf);
  await expectRail({ images: 1, pdfs: 1 });
  await target.type(composer, draftText);

  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.newProject);
        return {
          text: recordDraftText(record),
          files: record?.draft?.parts.filter((part) => part.type === 'file').length ?? 0,
          stored: await homeFileNames(recordPaths.newProjectAttachments),
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({ text: draftText, files: 2, stored: [...names].sort() });

  // D7: no loader; the composer hydrates in place.
  await target.reload();
  await target.expectVisible(composer, 60_000);
  await target.expectHidden(selectors.getByRole('status', { name: 'Opening Home' }));
  await expectRail({ images: 1, pdfs: 1 });
  await target.expectContainingText(composer, draftText, 30_000);

  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?(?:.*&)?chat=/u, 120_000);
  const chatId = new URL(await target.currentUrl()).searchParams.get('chat')!;
  const { configs } = await readProjectStorageState();
  expect(configs).toHaveLength(1);

  // Promoted before the startup request was written (D18), then cleared from Home.
  await expect
    .poll(async () => homeFileNames(recordPaths.chatAttachments(chatId)), {
      timeout: 60_000,
    })
    .toEqual([...names].sort());
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByRole('button', { name: 'Open image bracket-photo.jpg' }), 30_000);
  await target.expectVisible(selectors.getByCss('[aria-label="Attached files"]').getByText('bracket-spec.pdf'));
  await expect.poll(async () => homeFileNames(recordPaths.newProjectAttachments), { timeout: 30_000 }).toEqual([]);
  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.newProject);
        return record?.draft;
      },
      { timeout: 30_000 },
    )
    .toBeUndefined();

  const [request] = await target.readAgentHostGatewayRequests();
  const body = JSON.stringify(request);
  expect(body).toContain(jpeg.base64);
  expect(body).toContain(pdf.base64);
  expect(body).not.toContain('tau:document:');
});
