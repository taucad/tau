import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';

/**
 * Agent questions (agent questions blueprint W3/W5) on the browser-host tier: a
 * scripted turn calls `ask_questions`; the card in the transcript answers it
 * through `.tau/chats/<chatId>/answers.yaml`, the tool returns the person's
 * choice, and a question nobody answered in time takes its recommendation and
 * can still be answered afterwards, as a message.
 */

const seedRoute = '/__e2e/project-file-tree';
const composer = '[aria-label="Ask Tau to build anything..."]';
const readyText = 'Ready to plan.';
const askingText = 'Before I model anything, one decision about the form.';
const answeredText = 'Going with the faceted gem.';
const defaultedText = 'No reply yet, so I went with the twisted ribbon.';
const lateText = 'Switching to the faceted gem.';
const usage = { inputTokens: 12, outputTokens: 6 };

const formQuestion = (chatId: string, waitSeconds: number): Readonly<Record<string, unknown>> => ({
  chatId,
  waitSeconds,
  questions: [
    {
      id: 'form',
      header: 'Form',
      question: 'Which form should the desk ornament take?',
      options: [
        { label: 'Twisted ribbon', description: 'Prints without supports.' },
        { label: 'Faceted gem', description: 'Crisp at 0.2 mm layers.' },
      ],
    },
  ],
});

/** Every text block the provider saw, newest request last. */
const requestTexts = (requests: readonly unknown[]): string[] =>
  requests.flatMap((request) =>
    ((request as { readonly messages?: ReadonlyArray<{ readonly content?: unknown }> }).messages ?? []).flatMap(
      (message) => {
        if (typeof message.content === 'string') {
          return [message.content];
        }
        return Array.isArray(message.content)
          ? (message.content as ReadonlyArray<Record<string, unknown>>).map((block) => {
              const content = block['content'] ?? block['text'];
              return Array.isArray(content)
                ? content.map((part) => (part as { readonly text?: string }).text ?? '').join('')
                : typeof content === 'string'
                  ? content
                  : '';
            })
          : [];
      },
    ),
  );

const sendMessage = async (text: string): Promise<void> => {
  await target.type(composer, text);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
};

/** Open the seeded project with its chat lane, and return the chat id after one plain turn. */
const openChat = async (): Promise<string> => {
  await target.installAgentHostGatewayFixture([{ text: readyText, usage }]);
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(seedRoute);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  /* Give hydration a moment to restore an open lane: toggling an open, not-yet-rendered lane closes it. */
  try {
    await target.expectVisible(selectors.getByCss(composer), 10_000);
  } catch {
    await target.click(selectors.getByCss('[aria-label="Toggle Chat lane"]'));
    await target.expectVisible(selectors.getByCss(composer), 60_000);
  }
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await sendMessage('Hello.');
  await target.expectVisible(selectors.getByText(readyText, { exact: true }), 120_000);
  await target.expectUrl(/[?&]chat=[^&]+/u, 60_000);
  const chatId = new URL(await target.currentUrl()).searchParams.get('chat') ?? '';
  expect(chatId).toMatch(/^[\w-]{1,128}$/u);
  return chatId;
};

test('answers an agent question from its card and returns the choice to the agent', async () => {
  const chatId = await openChat();
  const script: readonly GatewayScriptTurn[] = [
    { text: askingText, toolCalls: [{ name: 'ask_questions', args: formQuestion(chatId, 120) }], usage },
    { text: answeredText, usage },
  ];
  await target.installAgentHostGatewayFixture(script);
  await sendMessage('Design a desk ornament');

  const choice = selectors.getByRole('button', { name: 'B, Faceted gem. Crisp at 0.2 mm layers.' });
  await target.expectVisible(choice, 120_000);
  await target.expectVisible(
    selectors.getByRole('button', { name: 'A, Twisted ribbon, recommended. Prints without supports.' }),
    10_000,
  );
  await target.click(choice);

  await target.expectVisible(selectors.getByText(answeredText, { exact: true }), 120_000);
  await target.expectVisible(selectors.getByRole('group', { name: 'You answered' }), 60_000);
  const texts = requestTexts(await target.readAgentHostGatewayRequests());
  const result = texts.findLast((text) => text.includes(`questions.yaml`)) ?? '';
  expect(JSON.parse(result)).toMatchObject({
    status: 'answered',
    path: `.tau/chats/${chatId}/questions.yaml`,
    answers: [{ id: 'form', answer: 'Faceted gem', source: 'person' }],
  });
});

test('adopts the recommendation when nobody answers and delivers a late answer as a message', async () => {
  const chatId = await openChat();
  const script: readonly GatewayScriptTurn[] = [
    { text: askingText, toolCalls: [{ name: 'ask_questions', args: formQuestion(chatId, 0) }], usage },
    { text: defaultedText, usage },
    { text: lateText, usage },
  ];
  await target.installAgentHostGatewayFixture(script);
  await sendMessage('Design a desk ornament');

  await target.expectVisible(selectors.getByText(defaultedText, { exact: true }), 120_000);
  await target.expectVisible(selectors.getByRole('group', { name: 'Recommendation used' }), 60_000);
  const defaulted = requestTexts(await target.readAgentHostGatewayRequests()).findLast((text) =>
    text.includes('questions.yaml'),
  );
  expect(JSON.parse(defaulted ?? '')).toMatchObject({
    status: 'defaulted',
    answers: [{ id: 'form', answer: 'Twisted ribbon', source: 'recommended' }],
  });

  await target.click(selectors.getByRole('button', { name: 'Answer anyway' }));
  await target.click(selectors.getByRole('button', { name: 'B, Faceted gem. Crisp at 0.2 mm layers.' }));

  await target.expectVisible(selectors.getByText(lateText, { exact: true }), 120_000);
  const texts = requestTexts(await target.readAgentHostGatewayRequests());
  expect(texts.some((text) => text.includes('Answer to your earlier question') && text.includes('Faceted gem'))).toBe(
    true,
  );
});
