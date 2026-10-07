import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';

/**
 * Chat task list (design-to-print blueprint D8, V08) on the browser-host tier: a
 * scripted turn calls `update_todos` twice; the list above the composer follows
 * `.tau/chats/<chatId>/todo.yaml`, expands by keyboard, and the transcript keeps
 * one folded tool card per write.
 */

const seedRoute = '/__e2e/project-file-tree';
const composer = '[aria-label="Ask Tau to build anything..."]';
const readyText = 'Ready to plan.';
const openingText = 'Planning the pyramid print.';
const advancingText = 'The pyramid is modelled.';
const finalText = 'The task list is up to date.';
const usage = { inputTokens: 12, outputTokens: 6 };

type Status = 'pending' | 'in_progress' | 'done';
const todos = (chatId: string, statuses: readonly [Status, Status, Status]): Readonly<Record<string, unknown>> => ({
  chatId,
  items: [
    { id: 'model-pyramid', title: 'Model the pyramid', status: statuses[0] },
    { id: 'slice-pyramid', title: 'Slice for the X1C', status: statuses[1] },
    { id: 'request-print', title: 'Request the print', status: statuses[2] },
  ],
});

/** The newest `tool_result` the provider saw, flattened to its text. */
const latestToolResult = (requests: readonly unknown[]): { readonly isError: boolean; readonly text: string } => {
  const blocks = requests.flatMap((request) =>
    ((request as { readonly messages?: ReadonlyArray<{ readonly content?: unknown }> }).messages ?? []).flatMap(
      (message) => (Array.isArray(message.content) ? (message.content as ReadonlyArray<Record<string, unknown>>) : []),
    ),
  );
  const result = blocks.findLast((block) => block['type'] === 'tool_result');
  const content = result?.['content'];
  const text = Array.isArray(content)
    ? content.map((part) => (part as { readonly text?: string }).text ?? '').join('')
    : typeof content === 'string'
      ? content
      : '';
  return { isError: result?.['is_error'] === true, text };
};

const sendMessage = async (text: string): Promise<void> => {
  await target.type(composer, text);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
};

test('keeps the task list above the composer in step with update_todos', async () => {
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

  /* One plain turn first, so the chat id the tool writes under is on the route. */
  await sendMessage('Hello.');
  await target.expectVisible(selectors.getByText(readyText, { exact: true }), 120_000);
  await target.expectUrl(/[?&]chat=[^&]+/u, 60_000);
  const chatId = new URL(await target.currentUrl()).searchParams.get('chat') ?? '';
  expect(chatId).toMatch(/^[\w-]{1,128}$/u);

  const script: readonly GatewayScriptTurn[] = [
    {
      text: openingText,
      toolCalls: [{ name: 'update_todos', args: todos(chatId, ['in_progress', 'pending', 'pending']) }],
      usage,
    },
    {
      text: advancingText,
      gated: true,
      toolCalls: [{ name: 'update_todos', args: todos(chatId, ['done', 'in_progress', 'pending']) }],
      usage,
    },
    { text: finalText, usage },
  ];
  await target.installAgentHostGatewayFixture(script);
  await sendMessage('I want a pyramid, print it');

  /* First write: the tool answered before the gated second response streams. */
  await target.waitForAgentHostGatewayGate({ kind: 'stream' }, 120_000);
  const firstResult = latestToolResult(await target.readAgentHostGatewayRequests());
  expect(firstResult.text).toBe(
    `{"success":true,"path":".tau/chats/${chatId}/todo.yaml","counts":{"pending":2,"in_progress":1,"done":0}}`,
  );
  expect(firstResult.isError).toBe(false);
  /* Nothing done yet; the model is the current item. */
  const firstSummary = selectors.getByRole('button', { name: 'Tasks: 0 of 3 done · Model the pyramid' });
  await target.expectVisible(firstSummary, 60_000);

  /* Second write, released: the same list moves on. */
  await target.releaseAgentHostGatewayFixture();
  await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
  const summary = selectors.getByRole('button', { name: 'Tasks: 1 of 3 done · Slice for the X1C' });
  await target.expectVisible(summary, 60_000);
  await target.expectCount(firstSummary, 0);
  /* The list starts folded to its one line; Enter discloses it. */
  expect(await target.getAttribute(summary, 'aria-expanded')).toBe('false');
  await target.focus(summary);
  await target.keyboardPress('Enter');
  expect(await target.getAttribute(summary, 'aria-expanded')).toBe('true');
  const rows = selectors.getByRole('list', { name: 'Tasks', exact: true }).getByRole('listitem');
  await target.expectCount(rows, 3);
  expect(await target.textContent(rows.nth(0))).toBe('done: Model the pyramid');
  expect(await target.textContent(rows.nth(1))).toBe('in progress: Slice for the X1C');
  expect(await target.textContent(rows.nth(2))).toBe('pending: Request the print');

  /* Keyboard: Enter folds the list, Space opens it again. */
  await target.keyboardPress('Enter');
  expect(await target.getAttribute(summary, 'aria-expanded')).toBe('false');
  await target.expectCount(rows, 0);
  await target.keyboardPress(' ');
  expect(await target.getAttribute(summary, 'aria-expanded')).toBe('true');
  await target.expectCount(rows, 3);

  /* Transcript: one folded card per write, each naming its own summary. */
  const firstCard = selectors.getByRole('button', { name: 'Tasks · 0 of 3 done · Model the pyramid' });
  const latestCard = selectors.getByRole('button', { name: 'Tasks · 1 of 3 done · Slice for the X1C' });
  await target.expectCount(firstCard, 1);
  await target.expectCount(latestCard, 1);
  expect(await target.getAttribute(latestCard, 'aria-expanded')).toBe('false');
  await target.focus(latestCard);
  await target.keyboardPress('Enter');
  expect(await target.getAttribute(latestCard, 'aria-expanded')).toBe('true');

  const requests = await target.readAgentHostGatewayRequests();
  expect(requests).toHaveLength(3);
});
