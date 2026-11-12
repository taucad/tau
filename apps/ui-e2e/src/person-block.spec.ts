/**
 * The setup answers reach Tau's own agent only while Settings → Agents → "Use my setup answers" is on.
 *
 * With onboarding on and setup answered, an admitted turn carries a `<person>` block in two places: the system prompt
 * of the model request, and the turn context the chat log records (`context.systemPrompt` on
 * `turn.history-projection-committed`). With the switch off neither carries it, and after Clear the next turn does
 * not. The spec puts itself in the state where onboarding is on and setup does not open by itself, whatever the run's
 * state, so the composer is the first thing it meets.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, pdfModelName, selectModel, sendDraft } from '#support/chat-attachments.js';
import { chatLog, completeFirstTurn, gatewayRequestCount, openChat, reply } from '#support/chat-admission.js';
import { useFlagState } from '#support/flag-state-test.js';

/** What the person answered in setup: they print, and read TypeScript. */
const storedProfile = JSON.stringify({ value: { version: 1, goals: ['printing'], languages: ['typescript'] } });
const personOpen = '<person>';
const makesLine = 'Makes: 3D printing.';

/**
 * Store the setup answers once, before the app first reads them. A later navigation in the same test keeps whatever
 * the app has written since, so a Clear is not undone by the next page load.
 *
 * @param switchOn - The stored value of "Use my setup answers"; `undefined` leaves the default (on).
 */
const seedSetupAnswers = async (switchOn?: boolean): Promise<void> => {
  await target.addInitScript(
    ({ profile, isSwitchOn }) => {
      const marker = 'tau-e2e-person-seeded';
      if (localStorage.getItem(marker) !== null) {
        return;
      }
      localStorage.setItem('tau-person-profile', profile);
      if (isSwitchOn !== undefined) {
        localStorage.setItem('tau-chat-ctx-person', JSON.stringify(isSwitchOn));
      }
      localStorage.setItem(marker, '1');
    },
    { profile: storedProfile, isSwitchOn: switchOn },
  );
};

/**
 * The system prompt of each model request, oldest first.
 *
 * @returns One string per request.
 */
const requestSystemPrompts = async (): Promise<readonly string[]> => {
  const requests = (await target.readAgentHostGatewayRequests()) as ReadonlyArray<Readonly<{ system?: unknown }>>;
  return requests.map((request) => JSON.stringify(request.system ?? null));
};

/**
 * The system prompt each committed turn recorded in the chat log, oldest first.
 *
 * @param chatId - The chat.
 * @returns One string per committed turn.
 */
const loggedSystemPrompts = async (chatId: string): Promise<readonly string[]> => {
  const records = (await chatLog(chatId)) as ReadonlyArray<
    Readonly<{ type: string; context?: Readonly<{ systemPrompt?: string }> }>
  >;
  return records
    .filter((record) => record.type === 'turn.history-projection-committed')
    .map((record) => record.context?.systemPrompt ?? '');
};

/**
 * Open Settings → Agents over the chat, act there, and come back to the chat. Opening the dialog by its address loads
 * the page again, so the fixture's model is picked again afterwards.
 *
 * @param act - What to do in the dialog.
 */
const inAgentSettings = async (act: () => Promise<void>): Promise<void> => {
  const url = new URL(await target.currentUrl());
  url.searchParams.set('settings', 'agents');
  await target.navigate(`${url.pathname}${url.search}`);
  await target.expectVisible(selectors.getByRole('dialog', { name: 'Settings' }), 60_000);
  await act();
  await target.keyboardPress('Escape');
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await selectModel(pdfModelName);
};

test('sends the person block with each turn while the switch is on', async () => {
  await useFlagState('viewer-controls-onboarding');
  await seedSetupAnswers();
  const [chatId] = await openChat([reply('Reply one.')]);

  await completeFirstTurn(chatId!);

  const [system] = await requestSystemPrompts();
  expect(system).toContain(personOpen);
  expect(system).toContain(makesLine);
  expect(system).toContain('Reads: TypeScript.');
  await expect.poll(async () => loggedSystemPrompts(chatId!), { timeout: 60_000 }).toHaveLength(1);
  const [logged] = await loggedSystemPrompts(chatId!);
  expect(logged).toContain(personOpen);
  expect(logged).toContain(makesLine);
});

test('sends no person block while the switch is off', async () => {
  await useFlagState('viewer-controls-onboarding');
  await seedSetupAnswers(true);
  const [chatId] = await openChat([reply('Reply one.')]);

  await inAgentSettings(async () => {
    const toggle = selectors.getByRole('switch', { name: 'Use my setup answers', exact: true });
    await target.expectVisible(toggle, 30_000);
    expect(await target.getAttribute(toggle, 'aria-checked')).toBe('true');
    await target.click(toggle);
    await expect.poll(async () => target.getAttribute(toggle, 'aria-checked')).toBe('false');
  });
  await completeFirstTurn(chatId!);

  const [system] = await requestSystemPrompts();
  expect(system).not.toContain(personOpen);
  expect(system).not.toContain('Makes:');
  await expect.poll(async () => loggedSystemPrompts(chatId!), { timeout: 60_000 }).toHaveLength(1);
  const [logged] = await loggedSystemPrompts(chatId!);
  expect(logged).not.toContain(personOpen);
  expect(logged).not.toContain('Makes:');
});

test('drops the person block from the next turn after Clear', async () => {
  await useFlagState('viewer-controls-onboarding');
  await seedSetupAnswers();
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.')]);

  await completeFirstTurn(chatId!);
  const [beforeClear] = await requestSystemPrompts();
  expect(beforeClear).toContain(personOpen);

  await inAgentSettings(async () => {
    const clear = selectors.getByRole('button', { name: 'Clear', exact: true });
    await target.expectVisible(clear, 30_000);
    await target.click(clear);
    await target.expectVisible(selectors.getByText('Not answered').first(), 30_000);
  });
  await sendDraft('Second plain message.');
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);

  const [first, second] = await requestSystemPrompts();
  expect(first).toContain(personOpen);
  expect(second).not.toContain(personOpen);
  await expect.poll(async () => loggedSystemPrompts(chatId!), { timeout: 60_000 }).toHaveLength(2);
  const [loggedFirst, loggedSecond] = await loggedSystemPrompts(chatId!);
  expect(loggedFirst).toContain(personOpen);
  expect(loggedSecond).not.toContain(personOpen);
});
