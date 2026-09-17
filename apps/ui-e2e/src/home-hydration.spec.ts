import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { RecordFile } from '#support/chat-attachments.js';
import {
  chooseAttachment,
  composerSelector,
  dismissCookies,
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

const fieldUnit = async (input: Locator): Promise<string> =>
  target.evaluateLocator(input, (element) => {
    const adornment = element
      .closest<HTMLElement>('[data-slot="slider-input"]')
      ?.querySelector<HTMLElement>('[data-slot="slider-input-adornment"]');
    return adornment?.textContent.trim() ?? '';
  });

const fieldValue = async (input: Locator): Promise<string | undefined> => {
  const field = await target.read(input);
  return field.value;
};

test('should hydrate the normal app route beyond the Home storage bootstrap shell', async () => {
  await target.navigate('/');

  await target.expectVisible(selectors.getByRole('main'), 30_000);
  await target.expectHidden(selectors.getByRole('status', { name: 'Opening Home' }));
});

test('renders inferred units from the homepage gear runtime manifest', async () => {
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ marketingLanding: true }));
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

  await target.scrollIntoView(selectors.getByRole('region', { name: 'Live CAD demo' }));
  const liveDemo = selectors.getByRole('heading', { name: 'See it in action' });
  await target.expectVisible(liveDemo, 30_000);
  await target.scrollIntoView(liveDemo);
  const thickness = selectors.getByLabelText('Input for Thickness').first();
  const pressureAngle = selectors.getByLabelText('Input for Pressure angle').first();
  await target.expectVisible(thickness, 60_000);
  expect(await fieldUnit(thickness)).toBe('mm');
  expect(await fieldUnit(pressureAngle)).toBe('°');
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Thickness' }).first());
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Pressure angle' }).first());

  const teeth = selectors.getByLabelText('Input for Number Teeth').first();
  await target.fill(teeth, '2');
  await target.press(teeth, 'Enter');
  await target.expectVisible(selectors.getByText('Value must be at least 3.').first());
  expect(await fieldValue(teeth)).toBe('2');
  await target.press(teeth, 'Escape');
  await target.fill(teeth, '13');
  await target.press(teeth, 'Enter');
  await expect.poll(async () => fieldValue(teeth)).toBe('13');
});

test('keeps a Home draft with an image and a PDF across a reload and hands both to the new project', async () => {
  const replyText = 'Home attachments received.';
  const script: readonly GatewayScriptTurn[] = [{ text: replyText, usage: { inputTokens: 20, outputTokens: 4 } }];
  await target.installAgentHostGatewayFixture(script);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('main'), 30_000);
  await dismissCookies();
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
  const { projectId } = configs[0]!;

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
