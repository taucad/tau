import { describe, expect, it } from 'vitest';
import { parseLogEvent } from '@taucad/agent-host';
import type { AgentLiveEvent } from '@taucad/agent-host';
import { readUIMessageStream } from 'ai';
import type { UIMessageChunk } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import { deriveChatTranscript } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { projectAgentHostEvent, projectAgentHostLiveEvent } from '#services/agent-host-event-projection.js';
import {
  activityFamily,
  classifyActivityPart,
  describeActivity,
  findLastMeaningfulPartIndex,
  groupAssistantParts,
} from '#utils/assistant-message-activity.js';
import { finalizeInterruptedToolParts } from '#utils/chat.utils.js';
import pingPongTurnLog from '#utils/__fixtures__/in-project-ping-pong-turn.jsonl?raw';

type Part = MyUIMessage['parts'][number];

const text = (value: string): Part => ({ type: 'text', text: value });
const reasoning = (value: string): Part => ({ type: 'reasoning', text: value });
const stepStart = (): Part => ({ type: 'step-start' });
const tool = (type: string, state = 'output-available'): Part =>
  ({ type, toolCallId: `${type}-${state}`, state, input: {}, output: {} }) as unknown as Part;
const dynamic = (
  options: {
    readonly kind?: string;
    readonly nativeName?: string;
    readonly preliminary?: boolean;
    readonly state?: string;
    readonly title?: string;
    readonly toolName?: string;
  } = {},
): Part =>
  ({
    type: 'dynamic-tool',
    toolCallId: 'dynamic-1',
    toolName: options.toolName ?? options.nativeName ?? 'vendor_tool',
    state: options.state ?? 'output-available',
    input: {},
    output: {},
    ...(options.preliminary === undefined ? {} : { preliminary: options.preliminary }),
    toolMetadata: {
      tau: {
        ...(options.kind === undefined ? {} : { kind: options.kind }),
        ...(options.nativeName === undefined ? {} : { nativeName: options.nativeName, presentation: 'tau-mcp' }),
        ...(options.title === undefined ? {} : { title: options.title }),
      },
    },
  }) as unknown as Part;

describe('assistant message activity', () => {
  it('skips empty text and reasoning but retains meaningful chronology', () => {
    const parts = [text(''), reasoning('  '), reasoning('Plan'), stepStart(), text('Answer')];

    expect(parts.map((part) => classifyActivityPart(part))).toEqual(['skip', 'skip', 'reasoning', 'skip', 'text']);
    expect(findLastMeaningfulPartIndex(parts)).toBe(4);
  });

  it('keeps reasoning beside tool calls inside one activity group without deduplicating equal text', () => {
    const first = reasoning('Check the result');
    const second = reasoning('Check the result');
    const groups = groupAssistantParts([
      first,
      second,
      tool('tool-read_file'),
      reasoning('Continue'),
      dynamic({ kind: 'execute' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: 'aggregated',
      category: 'research',
      partIndices: [0, 1, 2, 3, 4],
      summary: 'Read files, ran commands',
      families: ['read', 'execute'],
    });
    expect(groups[0]?.kind === 'aggregated' && groups[0].parts.slice(0, 2)).toEqual([first, second]);
  });

  it('keeps reasoning without tool calls as a standalone thought', () => {
    const groups = groupAssistantParts([reasoning('Plan'), text('Answer'), reasoning('Reflect')]);

    expect(groups.map((group) => (group.kind === 'aggregated' ? group.category : group.kind))).toEqual([
      'reasoning',
      'singleton',
      'reasoning',
    ]);
    expect(groups[0]).toMatchObject({ summary: '', families: [] });
  });

  it('groups adjacent tool families and treats prose as the only visible barrier', () => {
    const groups = groupAssistantParts([
      tool('tool-read_file'),
      stepStart(),
      dynamic({ kind: 'execute' }),
      text('Observed result'),
      tool('tool-get_kernel_result'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(['aggregated', 'singleton', 'aggregated']);
    expect(groups[0]).toMatchObject({ summary: 'Read files, ran commands', partIndices: [0, 2] });
    expect(groups[2]).toMatchObject({ summary: 'Rendered models' });
  });

  it('uses the same semantic families for Tau-native and qualified ACP tools', () => {
    expect(activityFamily(tool('tool-get_kernel_result'))).toBe('render');
    expect(activityFamily(dynamic({ nativeName: 'get_kernel_result' }))).toBe('render');
    expect(activityFamily(dynamic({ nativeName: 'screenshot' }))).toBe('screenshot');
    expect(activityFamily(dynamic({ nativeName: 'test_model' }))).toBe('test');
    expect(
      describeActivity([
        dynamic({ nativeName: 'get_kernel_result' }),
        dynamic({ nativeName: 'screenshot' }),
        dynamic({ nativeName: 'test_model' }),
      ]),
    ).toBe('Rendered models, captured images, ran tests');
  });

  it('describes active and preliminary calls from their live contents', () => {
    expect(describeActivity([tool('tool-read_file', 'input-available'), dynamic({ kind: 'execute' })])).toBe(
      'Reading files, ran commands',
    );
    expect(describeActivity([dynamic({ nativeName: 'get_kernel_result', preliminary: true })])).toBe(
      'Rendering models',
    );
  });

  it('keeps approvals, mixed failures, and denials truthful', () => {
    expect(describeActivity([tool('tool-edit_file', 'approval-requested')])).toBe('File edits awaiting approval');
    expect(describeActivity([tool('tool-read_file'), tool('tool-read_file', 'output-error')])).toBe(
      'Read files (some failed)',
    );
    expect(describeActivity([tool('tool-test_model', 'output-denied')])).toBe('Tests denied');
  });

  it('retains unknown ACP titles and never falls back to Activity or Working', () => {
    const active = describeActivity([
      dynamic({ kind: 'future-kind', state: 'input-available', title: 'Index dependency graph' }),
    ]);
    const completed = describeActivity([dynamic({ kind: 'future-kind', title: 'Index dependency graph' })]);

    expect(active).toBe('Index dependency graph — running');
    expect(completed).toBe('Index dependency graph');
    expect(`${active} ${completed}`).not.toMatch(/\b(?:Activity|Working|Stopped)\b/u);
  });

  it('keeps export artifacts standalone while ordinary edits stay in the activity stack', () => {
    const groups = groupAssistantParts([tool('tool-edit_file'), tool('tool-export_geometry'), tool('tool-read_file')]);

    expect(groups.map((group) => group.category)).toEqual(['research', 'write', 'research']);
  });
});

/*
 * The durable log of the desktop in-project run whose transcript rendered a
 * bare "File edits failed" over four `create_file`/`get_kernel_result` rounds
 * that every log row reports as `isError: false` (W11-diag, W11-fix section 7).
 * The chat is replayed the way `chat-file-storage.ts:169` loads one — through
 * `deriveChatTranscript` — and then finalized the way the store's
 * `applyFinishedRequest` finalizes a stream that ended cleanly
 * (`chat-session-store.ts:1659-1661`), which is the only site on this path that
 * can stamp `output-error` over a tool the host never failed.
 */
describe('desktop in-project turn replay', () => {
  const replayed = async (): Promise<readonly MyUIMessage[]> => {
    const events = pingPongTurnLog
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => parseLogEvent(JSON.parse(line)));
    const derived = await deriveChatTranscript(events);
    return finalizeInterruptedToolParts([...derived], 'chat_31RN18nUqDU3WBOn8v3Bn', 'success');
  };

  const secondRunId = 'req_VW4Q9O77Z8IOFHDu1VK98';
  const racedToolCallId = 'desktop-e2e-call-5';
  /* Verbatim shape of the live row the host emits for that call, as
   * `session.ts:573-580` composes it and `agent-host-client.ts` forwards it. */
  const lateToolInputEnd = {
    type: 'tool-input-end',
    chatId: 'chat_31RN18nUqDU3WBOn8v3Bn',
    runId: secondRunId,
    messageId: 'ad1ca7df08c1e464962bcf6f697aa3e4',
    contentIndex: 1,
    toolCallId: racedToolCallId,
    toolName: 'create_file',
    input: { targetFile: 'main.scad', content: '' },
  } satisfies Extract<AgentLiveEvent, { readonly type: 'tool-input-end' }>;

  it('should leave every tool part of the replayed turn settled, never output-error', async () => {
    const messages = await replayed();
    const states = messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type.startsWith('tool-') || part.type === 'dynamic-tool')
      .map((part): unknown => Reflect.get(part, 'state'));

    expect(states).toEqual(Array.from({ length: 6 }, () => 'output-available'));
  });

  it('should summarize the ping-pong turn as its four successful rounds, never as a failure', async () => {
    const messages = await replayed();
    const summaries = messages
      .filter((message) => message.role === 'assistant')
      .map((message) =>
        groupAssistantParts(message.parts).flatMap((group) => (group.kind === 'aggregated' ? [group.summary] : [])),
      );

    expect(summaries).toEqual([
      ['Edited files', 'Rendered models'],
      ['Edited files', 'Rendered models', 'Edited files', 'Edited files'],
    ]);
  });

  /*
   * Red pin for the mislabel itself. The durable log alone is innocent (above),
   * so the capture can only have come from the one interleaving the live store
   * produces: the host emits a live `tool-input-end` for every tool call
   * (`packages/agent-host/src/harness/session.ts:573-580`) on the `liveEvents`
   * stream while the tool's durable rows travel on `events`, and
   * `agent-host-client.ts:560-567` drains the two with two independent
   * `for await` loops — nothing orders one against the other. The transport
   * feeds both into one queue in arrival order and returns from `enqueueEvent`
   * for a live event *before* its `leaderEpoch:sequence` dedup
   * (`browser-agent-host-transport.ts:652-661`), so a live row is never
   * deduplicated or dropped on the native path. Projected late
   * (`agent-host-event-projection.ts:583-592`), `tool-input-end` becomes a
   * second `tool-input-available`, and the AI SDK rewinds the settled part to
   * `input-available` and drops its output — after which the clean-finish
   * finalize stamps `ORPHANED_TOOL_CALL` over a tool that succeeded. One tool
   * call loses the race, which is why only the third round was mislabelled.
   *
   * The projection fences every settled call, so the late row projects to nothing.
   */
  it('should ignore a live tool-input row that arrives after the tool settled', async () => {
    const blocks = new Map();
    const chunks: UIMessageChunk[] = [];
    for (const event of pingPongTurnLog
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => parseLogEvent(JSON.parse(line)))
      .filter((event) => event.runId === secondRunId)) {
      chunks.push(...projectAgentHostEvent(event, blocks));
      if (
        event.type === 'message.appended' &&
        event.message.role === 'tool-output' &&
        event.message.toolCallId === racedToolCallId
      ) {
        chunks.push(...projectAgentHostLiveEvent(lateToolInputEnd, blocks));
      }
    }
    const stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    let streamed: MyUIMessage | undefined;
    for await (const next of readUIMessageStream<MyUIMessage>({ stream })) {
      streamed = next;
    }
    const [message] = finalizeInterruptedToolParts([streamed!], 'chat_31RN18nUqDU3WBOn8v3Bn', 'success');

    expect(
      groupAssistantParts(message!.parts).flatMap((group) => (group.kind === 'aggregated' ? [group.summary] : [])),
    ).toEqual(['Edited files', 'Rendered models', 'Edited files', 'Edited files']);
  });
});
