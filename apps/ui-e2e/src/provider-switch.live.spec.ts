/**
 * Switching provider mid-chat, through the real UI against real providers.
 *
 * The defect this covers: turn 2 on the target provider replays turn 1's tool
 * call and tool result as foreign history. Before W1/W2 that replay was refused
 * — a flat-schema violation came back as HTTP 400, and an unsigned Gemini tool
 * call cancelled the stream with 499 — so a switch looked like a dead chat.
 * Each row therefore forces a tool call on both sides of the switch and asserts
 * the second one consumed the first one's result.
 *
 * Opt-in: `apps/ui-e2e/vitest.config.ts` excludes this file unless
 * `TAU_E2E_LIVE_GEMINI=true`, alongside the live Gemini vertical.
 */
import { expect, inject, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { LiveModel } from '#support/live-chat-turn.js';
import {
  expandActivities,
  expectAssistantText,
  expectNoChatError,
  expectSettledReceipts,
  openLiveChat,
  readActiveProjectTree,
  selectModel,
  submitTurn,
} from '#support/live-chat-turn.js';

const models = {
  anthropic: { id: 'anthropic-claude-haiku-4.5', providerId: 'anthropic' },
  openai: { id: 'openai-gpt-5.6-sol', providerId: 'openai' },
  vertex: { id: 'google-gemini-3.7-flash', providerId: 'vertexai' },
} as const satisfies Record<string, LiveModel>;

const pairs: ReadonlyArray<readonly [string, LiveModel, LiveModel]> = [
  ['Vertex to Anthropic', models.vertex, models.anthropic],
  ['Anthropic to Vertex', models.anthropic, models.vertex],
  ['Vertex to OpenAI', models.vertex, models.openai],
  ['OpenAI to Vertex', models.openai, models.vertex],
];

const firstEdge = 7;
const secondEdge = firstEdge * 2;
const firstPrompt = `Write main.scad with a single OpenSCAD cube centred at the origin whose edge length is ${String(firstEdge)} mm, using your file-writing tool. Do not run the model, do not write any other file, and do not call any other tool. End your reply with the line EDGE-WRITTEN.`;
const secondPrompt = `Do not read any file. Using only the edge length you wrote to main.scad earlier in this conversation, write main.scad again with a single centred cube of exactly double that edge length. Do not run the model and do not call any other tool. End your reply with the line EDGE-DOUBLED.`;

/** A settled tool card rendered in the transcript, and none is still loading or failed. */
const expectToolCallsCompleted = async (minimumCount: number): Promise<void> => {
  await expandActivities();
  await target.expectCount(selectors.getByCss('[data-status="loading"]'), 0, 60_000);
  await target.expectCount(selectors.getByCss('[data-status="error"]'), 0);
  const ready = await target.read(selectors.getByCss('[data-status="ready"]'));
  expect(ready.count).toBeGreaterThanOrEqual(minimumCount);
};

const edgeLength = (tree: Readonly<Record<string, string>>): string => {
  const source = tree['/main.scad'];
  if (source === undefined) {
    throw new Error(`main.scad is absent; the turn wrote ${JSON.stringify(Object.keys(tree))}.`);
  }
  return source;
};

for (const [name, first, second] of pairs) {
  test(`${name}: the second turn replays the first turn's tool result`, async () => {
    const email = `switch-live-${String(Date.now())}@e2e.tau`;
    await openLiveChat({ email, modelId: first.id, projectName: `Provider Switch ${name}` });

    await submitTurn(firstPrompt);
    await expectAssistantText(/EDGE-WRITTEN/u);
    await expectToolCallsCompleted(1);
    expect(edgeLength(await readActiveProjectTree())).toMatch(new RegExp(String.raw`\b${String(firstEdge)}\b`, 'u'));

    await selectModel(second.id);
    await submitTurn(secondPrompt);
    await expectAssistantText(/EDGE-DOUBLED/u);
    // Two tool calls now: the first provider's write and the second's.
    await expectToolCallsCompleted(2);
    await expectNoChatError();
    // The doubled edge can only come from the first turn's tool call and its
    // result surviving the switch onto the second provider's wire.
    expect(edgeLength(await readActiveProjectTree())).toMatch(new RegExp(String.raw`\b${String(secondEdge)}\b`, 'u'));

    // Billing evidence last: the switch is proven by the transcript and the
    // file above, and a receipt assertion failing here names the metering
    // rather than the provider wire. A self-hosted API mounts no billing, so
    // there the evidence above is the whole proof.
    if (!inject('billingMetered')) {
      return;
    }
    const settled = await expectSettledReceipts(
      (receipt) => receipt.model.providerId === first.providerId || receipt.model.providerId === second.providerId,
      2,
    );
    expect(new Set(settled.map((receipt) => receipt.model.providerId))).toEqual(
      new Set([first.providerId, second.providerId]),
    );
    await target.writeArtifact(
      `provider-switch-live-${first.providerId}-to-${second.providerId}.json`,
      `${JSON.stringify({ from: first, to: second, settled }, null, 2)}\n`,
    );
  }, 900_000);
}
