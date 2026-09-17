import { describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import {
  activityFamily,
  classifyActivityPart,
  describeActivity,
  findLastMeaningfulPartIndex,
  groupAssistantParts,
} from '#utils/assistant-message-activity.js';

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
