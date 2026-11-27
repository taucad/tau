import { describe, expect, it } from 'vitest';
import { readUIMessageStream } from 'ai';
import type { UIMessage, UIMessageChunk } from 'ai';
import { reduceChunks } from '#services/ui-message-reducer.js';

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const opening: UIMessageChunk[] = [
  { type: 'start', messageId: 'm1', messageMetadata: { status: 'pending' } },
  { type: 'start-step' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'Reading' },
  { type: 'tool-input-available', toolCallId: 'c1', toolName: 'use_skill', input: { name: 'cad-replicad' } },
];

describe('reduceChunks', () => {
  it('should leave its input reduction and chunks unchanged', () => {
    const chunks = deepFreeze(structuredClone(opening));
    const first = deepFreeze(reduceChunks(chunks));
    const snapshot = structuredClone(first.message);

    const next = reduceChunks(
      deepFreeze<UIMessageChunk[]>([
        { type: 'text-delta', id: 't1', delta: ' the skill' },
        { type: 'tool-output-available', toolCallId: 'c1', output: 'instructions' },
      ]),
      first,
    );

    expect(first.message).toEqual(snapshot);
    expect(next.message).not.toBe(first.message);
    expect(next.message?.parts.map((part) => ('state' in part ? part.state : part.type))).toEqual([
      'step-start',
      'streaming',
      'output-available',
    ]);
  });

  it('should keep the identity of every part a suffix does not change', () => {
    const first = reduceChunks(opening);

    const next = reduceChunks([{ type: 'tool-output-available', toolCallId: 'c1', output: 'instructions' }], first);

    expect(next.message?.parts[0]).toBe(first.message?.parts[0]);
    expect(next.message?.parts[1]).toBe(first.message?.parts[1]);
    expect(next.message?.parts[2]).not.toBe(first.message?.parts[2]);
    expect(next.message?.parts[2]).toMatchObject({ state: 'output-available', output: 'instructions' });
  });

  it('should reduce a sequence split anywhere to the message it reduces to whole', () => {
    const chunks: UIMessageChunk[] = [
      ...opening,
      { type: 'tool-input-start', toolCallId: 'c2', toolName: 'create_file' },
      { type: 'tool-input-delta', toolCallId: 'c2', inputTextDelta: '{"targetFile":"ma' },
      { type: 'tool-input-delta', toolCallId: 'c2', inputTextDelta: 'in.ts"}' },
      { type: 'text-end', id: 't1' },
      { type: 'finish-step' },
      { type: 'finish', messageMetadata: { status: 'success' } },
    ];
    const whole = reduceChunks(chunks);

    for (let cut = 0; cut <= chunks.length; cut++) {
      expect(reduceChunks(chunks.slice(cut), reduceChunks(chunks.slice(0, cut))).message).toEqual(whole.message);
    }
    expect(whole.message?.metadata).toEqual({ status: 'success' });
    expect(whole.message?.parts.find((part) => part.type === 'tool-create_file')).toMatchObject({
      state: 'input-streaming',
      input: { targetFile: 'main.ts' },
      rawInput: '{"targetFile":"main.ts"}',
    });
  });

  it("should merge a run's end time as the SDK does, a later null taking it back", async () => {
    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: 'm1', messageMetadata: { createdAt: 1000 } },
      { type: 'start-step' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Working' },
      { type: 'message-metadata', messageMetadata: { endedAt: 39_000 } },
      { type: 'abort' },
      { type: 'message-metadata', messageMetadata: { endedAt: null } },
    ];
    let sdk: UIMessage | undefined;
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    for await (const message of readUIMessageStream({ stream })) {
      sdk = message;
    }

    expect(reduceChunks(chunks.slice(0, 5)).message?.metadata).toEqual({ createdAt: 1000, endedAt: 39_000 });
    expect(reduceChunks(chunks).message?.metadata).toEqual({ createdAt: 1000, endedAt: null });
    expect(reduceChunks(chunks).message?.metadata).toEqual(sdk?.metadata);
  });

  it('should return the same reduction for no chunks and the same message when only unfitting chunks follow', () => {
    const first = reduceChunks(opening);

    expect(reduceChunks([], first)).toBe(first);
    const skipped = reduceChunks([{ type: 'text-delta', id: 'never-started', delta: 'x' }], first);
    expect(skipped.message).toBe(first.message);
    expect(skipped.skipped).toBe(1);
  });

  it('should show a step boundary with the next change, as the SDK publishes it', () => {
    const opened = reduceChunks([{ type: 'start', messageId: 'm1' }, { type: 'start-step' }]);
    expect(opened.message?.parts).toEqual([]);

    const written = reduceChunks([{ type: 'text-start', id: 't1' }], opened);
    expect(written.message?.parts.map((part) => part.type)).toEqual(['step-start', 'text']);
  });

  it('should show nothing until a chunk changes what the message shows', () => {
    expect(reduceChunks([{ type: 'start-step' }, { type: 'finish-step' }]).message).toBeUndefined();
  });
});
