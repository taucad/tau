/**
 * Compaction, in the real browser agent host.
 *
 * The blueprint's tier two had never once succeeded against a live provider, so
 * every unit proof of it ran on a summariser the host does not use. These rows
 * drive the whole seam: a scripted turn reports usage over the model's window,
 * the host compacts mid-run, its summariser call goes out over the same gateway
 * (the one request it sends with no tools) and is answered by the fixture, and
 * the turn then finishes. The second row fails that summariser and asserts the
 * placeholder still lets the turn finish — the chat survives a summariser that
 * cannot answer, which is the invariant the fix was for.
 *
 * Why the numbers work (`packages/agent-host/src/harness/compaction.ts`):
 * compaction triggers when the anchored estimate exceeds
 * `contextWindow - 20 %`, and the anchor is the last assistant's own reported
 * usage plus everything after it. With a 20 000-token window the threshold is
 * 16 000, the scripted turn reports 18 000, and its three `create_file` calls
 * put ~8 000 tokens of arguments in the message estimate — enough history for
 * tier two to evict, and small enough per tool result that tier one's
 * clearing pass has nothing to select (`create_file` is not a compactable tool
 * and no result is oversized), so the pass that runs is summarization.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';
import type { GatewayScriptToolCall, GatewayScriptTurn } from '#support/agent-host-gateway-script.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const seedRoute = '/__e2e/project-file-tree';
const contextWindow = 20_000;
const summaryText = 'The assistant wrote three specification notes for the bracket.';
const firstTurnText = 'Writing the three specification notes.';
const finalText = 'The specification notes are written.';

/** One note file, ~10 500 characters, so three of them are ~8 000 estimated tokens. */
const noteBody = 'The bracket note keeps this history large enough to be worth evicting. '.repeat(150);

const noteCall = (index: number): GatewayScriptToolCall => ({
  name: 'create_file',
  args: { targetFile: `compaction-note-${String(index)}.md`, content: noteBody },
});

/**
 * The multi-tool-call turn that overflows, then the turn that closes the run.
 *
 * The reported usage is the whole trigger: 18 000 against a 20 000 window is
 * over the 16 000 threshold, and the host's own estimate of the three tool
 * calls is what compaction then has to evict.
 */
const compactionScript: readonly GatewayScriptTurn[] = [
  {
    text: firstTurnText,
    toolCalls: [noteCall(1), noteCall(2), noteCall(3)],
    usage: { inputTokens: 17_400, outputTokens: 600 },
  },
  {
    text: finalText,
    usage: { inputTokens: 200, outputTokens: 20 },
  },
];

type LogEvent = {
  readonly type: string;
  readonly state?: string;
  readonly evictedMessageIds?: readonly string[];
  readonly details?: {
    readonly lane?: string;
    readonly tier?: string;
    readonly summary?: string;
    readonly summarizerAttempts?: number;
    readonly summarizerError?: string;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
  };
};

const projectTree = async (): Promise<Readonly<Record<string, string>>> => {
  const state = await readProjectStorageState();
  const project = state.configs.find((config) => config.backend !== 'webaccess');
  return project ? readProjectTree(project) : {};
};

/** The chat's durable log, which is the authority on what compaction did. */
const eventLog = async (): Promise<readonly LogEvent[]> => {
  const tree = await projectTree();
  const logPath = Object.keys(tree).find((path) => /^\/\.tau\/chats\/[^/]+\/events\.jsonl$/u.test(path));
  return logPath === undefined
    ? []
    : tree[logPath]!.trim()
        .split('\n')
        .map((line) => JSON.parse(line) as LogEvent);
};

/** Every provider call the fixture captured, split by whether it carried tools. */
const gatewayRequests = async (): Promise<{ readonly agent: number; readonly summary: number }> => {
  const requests = (await target.readAgentHostGatewayRequests()) as ReadonlyArray<{
    readonly tools?: readonly unknown[];
  }>;
  const summary = requests.filter((request) => (request.tools?.length ?? 0) === 0).length;
  return { agent: requests.length - summary, summary };
};

const openSeededChat = async (summary: string): Promise<void> => {
  await target.installAgentHostGatewayFixture(compactionScript, { contextWindow, summary });
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(seedRoute);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.expectVisible(selectors.getByCss('[aria-label="Toggle Chat lane"]'), 60_000);
  await target.click(selectors.getByCss('[aria-label="Toggle Chat lane"]'));
  await target.expectVisible(selectors.getByCss(composer), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const runCompactedTurn = async (summary: string): Promise<readonly LogEvent[]> => {
  await openSeededChat(summary);
  await target.type(composer, 'Write the three specification notes.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());

  // The turn continues *through* the compaction: the closing text only exists
  // on the model call the host makes after it has compacted.
  await target.expectVisible(selectors.getByText(finalText, { exact: true }), 180_000);
  await expect
    .poll(
      async () => {
        const events = await eventLog();
        return events.some((event) => event.type === 'run.lifecycle' && event.state === 'completed');
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return eventLog();
};

/** No error card was rendered: a failed compaction ends the turn on one. */
const expectNoErrorCard = async (): Promise<void> => {
  expect(await target.isVisible(selectors.getByRole('button', { name: 'Try again' }))).toBe(false);
  expect(await target.isVisible(selectors.getByText('Compaction failed', { exact: false }))).toBe(false);
};

test('compacts a turn in flight, is summarized over the same gateway, and finishes the turn', async ({ annotate }) => {
  const events = await runCompactedTurn(summaryText);

  const compacted = events.filter((event) => event.type === 'history.compacted');
  // The one line that says what this run's compaction actually measured.
  await annotate(`compaction trace: ${JSON.stringify(compacted[0]?.details ?? null)}`);
  expect(compacted).toHaveLength(1);
  expect(compacted[0]?.details).toMatchObject({
    lane: 'between_turn',
    tier: 'summarization',
    summary: 'generated',
    summarizerAttempts: 1,
  });
  expect(compacted[0]?.details?.tokensBefore ?? 0).toBeGreaterThan(contextWindow * 0.8);
  expect(compacted[0]?.details?.tokensAfter ?? 0).toBeLessThan(compacted[0]?.details?.tokensBefore ?? 0);
  expect((compacted[0]?.evictedMessageIds ?? []).length).toBeGreaterThan(0);

  // One summariser call, made by the host over the same wire as the turn, and
  // exactly two agent calls — the one that overflowed and the one after it.
  expect(await gatewayRequests()).toEqual({ agent: 2, summary: 1 });

  expect(events.filter((event) => event.type === 'run.lifecycle').map(({ state }) => state)).toEqual([
    'admitted',
    'running',
    'completed',
  ]);
  // The evicted messages left the provider's view, not the transcript.
  await target.expectVisible(selectors.getByText('Write the three specification notes.', { exact: false }), 30_000);
  await target.expectVisible(selectors.getByText(firstTurnText, { exact: true }), 30_000);
  await expectNoErrorCard();
});

test('finishes the turn when the summarizer answers nothing', async () => {
  const events = await runCompactedTurn('');

  const compacted = events.filter((event) => event.type === 'history.compacted');
  expect(compacted).toHaveLength(1);
  // Placeholder eviction: the summary could not be written, the history was
  // still evicted, and the turn still completed.
  expect(compacted[0]?.details).toMatchObject({ tier: 'summarization', summary: 'placeholder' });
  expect(compacted[0]?.details?.summarizerError).toBeTruthy();
  expect(await gatewayRequests()).toEqual({ agent: 2, summary: 1 });
  expect(events.filter((event) => event.type === 'run.lifecycle').map(({ state }) => state)).toEqual([
    'admitted',
    'running',
    'completed',
  ]);
  await expectNoErrorCard();
});
