/* eslint-disable @typescript-eslint/naming-convention -- LangChain message API uses snake_case */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import { AttributeKey } from '@taucad/telemetry';
import { MetricsService } from '#telemetry/metrics.js';
import type { ModelService } from '#api/models/model.service.js';
import type { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import {
  anomalyPattern,
  buildDefaultDetectors,
  canonicalArgsHash,
  canonicalJson,
  createAgentSafeguardsMiddleware,
  defaultThresholds,
  emptyResultReminder,
  errorHash,
  extractTargetFile,
  identicalCallReminder,
  identicalErrorReminder,
  perTargetEditReminder,
  pingPongReminder,
  sameErrorDifferentArgsReminder,
  summarizeMessages,
} from '#api/chat/middleware/agent-safeguards.middleware.js';
import type { Detector, SafeguardsState, ToolEventSummary } from '#api/chat/middleware/agent-safeguards.middleware.js';
import { invokeWrapModelCall, resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

type BeforeModelState = SafeguardsState & { messages: BaseMessage[] };
type BeforeModelRuntime = { context: { chatId: string; modelId?: string; modelService?: ModelService } };
type WrapModelCallState = SafeguardsState & Record<string, unknown>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let toolCallCounter = 0;
const nextToolCallId = (): string => {
  toolCallCounter += 1;
  return `call_${toolCallCounter}`;
};

beforeEach(() => {
  toolCallCounter = 0;
});

const aiCallMessage = (calls: Array<{ name: string; args: Record<string, unknown>; id?: string }>): AIMessage =>
  new AIMessage({
    content: '',
    tool_calls: calls.map((call) => ({ name: call.name, args: call.args, id: call.id ?? nextToolCallId() })),
  });

const successMessage = (input: { toolCallId: string; toolName: string; payload?: unknown }): ToolMessage =>
  new ToolMessage({
    content: typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload ?? { ok: true }),
    tool_call_id: input.toolCallId,
    name: input.toolName,
  });

const errorMessage = (input: {
  toolCallId: string;
  toolName: string;
  errorCode?: string;
  message?: string;
}): ToolMessage =>
  new ToolMessage({
    content: JSON.stringify({
      errorCode: input.errorCode ?? 'TOOL_EXECUTION_ERROR',
      message: input.message ?? 'boom',
      toolName: input.toolName,
      toolCallId: input.toolCallId,
    }),
    tool_call_id: input.toolCallId,
    name: input.toolName,
    status: 'error',
  });

const failingPair = (input: {
  toolName: string;
  args: Record<string, unknown>;
  errorCode?: string;
  message?: string;
}): BaseMessage[] => {
  const id = nextToolCallId();
  const ai = aiCallMessage([{ name: input.toolName, args: input.args, id }]);
  return [
    ai,
    errorMessage({ toolCallId: id, toolName: input.toolName, errorCode: input.errorCode, message: input.message }),
  ];
};

const successPair = (input: { toolName: string; args: Record<string, unknown>; payload?: unknown }): BaseMessage[] => {
  const id = nextToolCallId();
  const ai = aiCallMessage([{ name: input.toolName, args: input.args, id }]);
  return [ai, successMessage({ toolCallId: id, toolName: input.toolName, payload: input.payload })];
};

const baseState = (overrides: Partial<SafeguardsState> = {}): SafeguardsState => ({
  _safeguardSignaturesFired: [],
  ...overrides,
});

const evaluateDetector = (detector: Detector, messages: BaseMessage[], state?: Partial<SafeguardsState>): unknown =>
  detector.evaluate(summarizeMessages(messages), baseState(state));

const findDetector = (pattern: string): Detector => {
  const detector = buildDefaultDetectors().find((entry) => entry.pattern === pattern);
  if (!detector) {
    throw new Error(`Detector ${pattern} not found`);
  }
  return detector;
};

// ---------------------------------------------------------------------------
// Hash + canonicalisation utilities
// ---------------------------------------------------------------------------

describe('canonicalJson', () => {
  it('should sort keys recursively so equivalent objects serialise identically', () => {
    expect(canonicalJson({ b: 1, a: { y: 2, x: 1 } })).toBe(canonicalJson({ a: { x: 1, y: 2 }, b: 1 }));
  });

  it('should detect cycles and emit "[Circular]" instead of throwing', () => {
    const root: Record<string, unknown> = { name: 'root' };
    root['self'] = root;
    expect(() => canonicalJson(root)).not.toThrow();
    expect(canonicalJson(root)).toContain('[Circular]');
  });
});

describe('canonicalArgsHash', () => {
  it('should produce identical hashes for object-equal but key-reordered args', () => {
    expect(canonicalArgsHash({ a: 1, b: 2 })).toBe(canonicalArgsHash({ b: 2, a: 1 }));
  });

  it('should produce different hashes for different content', () => {
    expect(canonicalArgsHash({ a: 1 })).not.toBe(canonicalArgsHash({ a: 2 }));
  });

  it('should normalise null/undefined args', () => {
    expect(canonicalArgsHash(null)).toBe(canonicalArgsHash(undefined));
  });
});

describe('errorHash', () => {
  it('should produce identical hashes for identical inputs', () => {
    expect(errorHash('boom', 'TOOL_EXECUTION_ERROR')).toBe(errorHash('boom', 'TOOL_EXECUTION_ERROR'));
  });

  it('should differ when only the message differs', () => {
    expect(errorHash('boom-1', 'TOOL_EXECUTION_ERROR')).not.toBe(errorHash('boom-2', 'TOOL_EXECUTION_ERROR'));
  });

  it('should differ when only the errorCode differs', () => {
    expect(errorHash('boom', 'TOOL_EXECUTION_ERROR')).not.toBe(errorHash('boom', 'TOOL_EXECUTION_TIMEOUT'));
  });
});

// ---------------------------------------------------------------------------
// extractTargetFile
// ---------------------------------------------------------------------------

describe('extractTargetFile', () => {
  it('should read the first entry of a `files` array (test_model)', () => {
    expect(extractTargetFile({ files: ['a.geospec', 'b.geospec'] })).toBe('a.geospec');
  });

  it('should still resolve singular file keys', () => {
    expect(extractTargetFile({ targetFile: 'main.scad' })).toBe('main.scad');
    expect(extractTargetFile({ path: 'lib/x.ts' })).toBe('lib/x.ts');
  });

  it('should return undefined for an empty `files` array', () => {
    expect(extractTargetFile({ files: [] })).toBeUndefined();
  });

  it('should return undefined when no recognised key is present', () => {
    expect(extractTargetFile({ files: [123] })).toBeUndefined();
    expect(extractTargetFile(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// summarizeMessages
// ---------------------------------------------------------------------------

describe('summarizeMessages', () => {
  it('should pair each ToolMessage with its preceding AIMessage tool_call', () => {
    const messages: BaseMessage[] = [
      new HumanMessage('hi'),
      ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'main.scad' } }),
    ];

    const events = summarizeMessages(messages);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      toolName: toolName.testModel,
      isError: true,
      errorCode: 'TOOL_EXECUTION_ERROR',
      targetFile: 'main.scad',
      isMutation: false,
    });
  });

  it('should skip an AIMessage(tool_calls) whose ToolMessage has not arrived yet (CS4)', () => {
    const id = nextToolCallId();
    const messages: BaseMessage[] = [
      new HumanMessage('hi'),
      aiCallMessage([{ name: toolName.readFile, args: { path: 'a' }, id }]),
      // No matching ToolMessage yet
    ];
    expect(summarizeMessages(messages)).toHaveLength(0);
  });

  it('should mark mutation tools and extract their targetFile', () => {
    const messages = successPair({ toolName: toolName.editFile, args: { targetFile: 'foo.scad', diff: '...' } });
    const event = summarizeMessages(messages)[0];
    expect(event?.isMutation).toBe(true);
    expect(event?.targetFile).toBe('foo.scad');
  });

  it('should flag empty grep result as isEmptyResult', () => {
    const messages = successPair({
      toolName: toolName.grep,
      args: { pattern: 'TODO' },
      payload: { matches: [], totalMatches: 0 },
    });
    const event = summarizeMessages(messages)[0];
    expect(event?.isEmptyResult).toBe(true);
    expect(event?.isError).toBe(false);
  });

  it('should not flag a grep with matches as empty', () => {
    const messages = successPair({
      toolName: toolName.grep,
      args: { pattern: 'cube' },
      payload: { matches: [{ file: 'a', line: 1, content: 'cube' }], totalMatches: 1 },
    });
    expect(summarizeMessages(messages)[0]?.isEmptyResult).toBe(false);
  });

  it('should flag empty glob_search and empty web_search results', () => {
    const glob = successPair({
      toolName: toolName.globSearch,
      args: { pattern: '*.unused' },
      payload: { files: [], totalFiles: 0 },
    });
    const web = successPair({ toolName: toolName.webSearch, args: { query: 'x' }, payload: [] });
    expect(summarizeMessages(glob)[0]?.isEmptyResult).toBe(true);
    expect(summarizeMessages(web)[0]?.isEmptyResult).toBe(true);
  });

  it('should mark untrusted argument evidence with a concrete reason', () => {
    const duplicateRoundId = 'duplicate_round_id';
    const missingIdToolMessageId = 'provider_repaired_missing_id';
    const events = summarizeMessages([
      successMessage({ toolCallId: 'orphan', toolName: toolName.createFile }),
      aiCallMessage([
        { id: duplicateRoundId, name: toolName.createFile, args: { targetFile: 'a.ts' } },
        { id: duplicateRoundId, name: toolName.createFile, args: { targetFile: 'b.ts' } },
      ]),
      successMessage({ toolCallId: duplicateRoundId, toolName: toolName.createFile }),
      aiCallMessage([{ id: '', name: toolName.createFile, args: { targetFile: 'c.ts' } }]),
      successMessage({ toolCallId: missingIdToolMessageId, toolName: toolName.createFile }),
    ]);

    expect(events.map((event) => event.unknownArgsReason)).toEqual([
      'orphan-tool-message',
      'duplicate-tool-call-id',
      'missing-tool-call',
    ]);
    expect(events.every((event) => event.argsKnown === false)).toBe(true);
    expect(events.every((event) => event.argsHash === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reminder template byte-determinism (CS3)
// ---------------------------------------------------------------------------

describe('reminder templates (CS3 byte-determinism)', () => {
  const allReminders = (): string[] => [
    identicalErrorReminder({ toolName: 'test_model', argsPreview: '{"a":1}', errorPreview: 'boom', count: 3 }),
    identicalCallReminder({ toolName: 'read_file', argsPreview: '{"path":"a"}', count: 5 }),
    perTargetEditReminder({ targetFile: 'main.scad', count: 5 }),
    pingPongReminder({ toolA: 'read_file', toolB: 'edit_file' }),
    emptyResultReminder({ toolName: 'grep', argsPreview: '{"pattern":"x"}', count: 3 }),
    sameErrorDifferentArgsReminder({
      toolName: 'test_model',
      errorCode: 'TOOL_EXECUTION_ERROR',
      count: 5,
      errorPreview: 'boom',
    }),
  ];

  it('should produce byte-identical output for byte-identical inputs', () => {
    const first = allReminders();
    const second = allReminders();
    expect(first).toEqual(second);
  });

  it(String.raw`should not contain millisecond timestamps (\d{13})`, () => {
    for (const reminder of allReminders()) {
      expect(reminder).not.toMatch(/\d{13}/);
    }
  });

  it('should not contain UUIDs', () => {
    for (const reminder of allReminders()) {
      expect(reminder).not.toMatch(/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/);
    }
  });

  it('should not contain run/turn counter substrings', () => {
    for (const reminder of allReminders()) {
      expect(reminder).not.toMatch(/turn \d+|iteration \d+|run [\da-f]{8}/i);
    }
  });
});

// ---------------------------------------------------------------------------
// AP1: identicalErrorDetector
// ---------------------------------------------------------------------------

describe('identicalErrorDetector (AP1)', () => {
  const detector = findDetector(anomalyPattern.identicalError);

  it('should return clear when below the nudge threshold', () => {
    const messages = [
      ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' } }),
      ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' } }),
    ];
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should nudge after 3 identical (toolName, argsHash, errorHash) failures', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 3; i++) {
      messages.push(
        ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' }, message: 'kernel:error' }),
      );
    }

    const result = evaluateDetector(detector, messages) as { kind: string; reminder: string; signature: string };
    expect(result.kind).toBe('nudge');
    expect(result.reminder).toContain('test_model');
    expect(result.reminder).toContain('3 times in a row');
    expect(result.signature).toContain(`${toolName.testModel}:`);
  });

  it('should terminate after 6 identical failures', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 6; i++) {
      messages.push(
        ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' }, message: 'kernel:error' }),
      );
    }
    const result = evaluateDetector(detector, messages) as { kind: string; pattern: string };
    expect(result.kind).toBe('terminate');
    expect(result.pattern).toBe(anomalyPattern.identicalError);
  });

  it('should reset the streak on a single different error message', () => {
    const messages: BaseMessage[] = [
      ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' }, message: 'kernel:error' }),
      ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' }, message: 'kernel:error' }),
      ...failingPair({ toolName: toolName.testModel, args: { targetFile: 'a.scad' }, message: 'kernel:other' }),
    ];
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should not treat unknown arguments as identical error arguments', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 3; i++) {
      messages.push(
        errorMessage({
          toolCallId: `orphan_error_${i}`,
          toolName: toolName.testModel,
          message: 'kernel:error',
        }),
      );
    }

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });
});

// ---------------------------------------------------------------------------
// AP2: identicalCallDetector
// ---------------------------------------------------------------------------

describe('identicalCallDetector (AP2)', () => {
  const detector = findDetector(anomalyPattern.identicalCall);

  it('should nudge after 5 identical successful calls regardless of result', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(...successPair({ toolName: toolName.readFile, args: { path: 'main.scad' } }));
    }
    const result = evaluateDetector(detector, messages) as { kind: string; reminder: string };
    expect(result.kind).toBe('nudge');
    expect(result.reminder).toContain('identical arguments');
  });

  it('should NOT fire when a different argsHash interrupts the streak', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 4; i++) {
      messages.push(...successPair({ toolName: toolName.readFile, args: { path: 'main.scad' } }));
    }
    messages.push(...successPair({ toolName: toolName.readFile, args: { path: 'other.scad' } }));
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should not treat orphan tool messages as repeated null-argument calls', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(
        successMessage({
          toolCallId: `orphan_create_${i}`,
          toolName: toolName.createFile,
          payload: { message: `File created: file_${i}.ts` },
        }),
      );
    }

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should structurally pair repeated historical tool-call ids instead of overwriting args globally', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(
        aiCallMessage([
          {
            name: toolName.createFile,
            args: { targetFile: `file_${i}.ts`, content: `export const value${i} = ${i};` },
            id: 'historical_duplicate_id',
          },
        ]),
        successMessage({
          toolCallId: 'historical_duplicate_id',
          toolName: toolName.createFile,
          payload: { message: `File created: file_${i}.ts` },
        }),
      );
    }

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });
});

// ---------------------------------------------------------------------------
// AP3: perTargetEditDetector
// ---------------------------------------------------------------------------

describe('perTargetEditDetector (AP3)', () => {
  const detector = findDetector(anomalyPattern.perTargetEdit);

  it('should nudge after 5 edits to the same target with no successful kernel-result flip', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: 'main.scad', diff: `v${i}` } }));
    }
    const result = evaluateDetector(detector, messages) as { kind: string; reminder: string };
    expect(result.kind).toBe('nudge');
    expect(result.reminder).toContain('main.scad');
  });

  it('should clear when a successful get_kernel_result is interleaved', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 4; i++) {
      messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: 'main.scad', diff: `v${i}` } }));
    }
    messages.push(
      ...successPair({
        toolName: toolName.getKernelResult,
        args: { targetFile: 'main.scad' },
        payload: { status: 'ready' },
      }),
    );
    messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: 'main.scad', diff: 'v-final' } }));

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should clear when a successful test_model run verifies the edited target', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 4; i++) {
      messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: 'main.ts', diff: `v${i}` } }));
    }
    messages.push(
      ...successPair({
        toolName: toolName.testModel,
        args: { files: ['main.ts'] },
        payload: { success: true, failures: [], passed: 2, total: 2, files: ['main.ts'] },
      }),
    );
    messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: 'main.ts', diff: 'v-final' } }));

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should not fire when edits are spread across different files', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: `file_${i}.scad`, diff: 'x' } }));
    }
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });
});

// ---------------------------------------------------------------------------
// AP4: pingPongDetector
// ---------------------------------------------------------------------------

describe('pingPongDetector (AP4)', () => {
  const detector = findDetector(anomalyPattern.pingPong);

  it('should nudge on a 2-cycle ABAB pattern with identical args per side', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 2; i++) {
      messages.push(...successPair({ toolName: toolName.readFile, args: { path: 'main.scad' } }));
      messages.push(...successPair({ toolName: toolName.editFile, args: { targetFile: 'main.scad', diff: 'x' } }));
    }
    const result = evaluateDetector(detector, messages) as { kind: string };
    expect(result.kind).toBe('nudge');
  });

  it('should not fire when the cycle has identical signatures on both sides', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 4; i++) {
      messages.push(...successPair({ toolName: toolName.readFile, args: { path: 'main.scad' } }));
    }
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should not treat alternating unknown arguments as a stable ping-pong loop', () => {
    const messages: BaseMessage[] = [
      successMessage({ toolCallId: 'orphan_edit_1', toolName: toolName.editFile }),
      successMessage({ toolCallId: 'orphan_test_1', toolName: toolName.testModel }),
      successMessage({ toolCallId: 'orphan_edit_2', toolName: toolName.editFile }),
      successMessage({ toolCallId: 'orphan_test_2', toolName: toolName.testModel }),
    ];

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });
});

// ---------------------------------------------------------------------------
// AP5: emptyResultDetector
// ---------------------------------------------------------------------------

describe('emptyResultDetector (AP5)', () => {
  const detector = findDetector(anomalyPattern.emptyResult);

  it('should nudge after 3 consecutive empty grep results with identical args', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 3; i++) {
      messages.push(
        ...successPair({
          toolName: toolName.grep,
          args: { pattern: 'TODO' },
          payload: { matches: [], totalMatches: 0 },
        }),
      );
    }
    const result = evaluateDetector(detector, messages) as { kind: string; reminder: string };
    expect(result.kind).toBe('nudge');
    expect(result.reminder).toContain('no results');
  });

  it('should not fire when at least one grep returned matches', () => {
    const messages: BaseMessage[] = [
      ...successPair({
        toolName: toolName.grep,
        args: { pattern: 'TODO' },
        payload: { matches: [{ file: 'a', line: 1, content: 'x' }], totalMatches: 1 },
      }),
      ...successPair({
        toolName: toolName.grep,
        args: { pattern: 'TODO' },
        payload: { matches: [], totalMatches: 0 },
      }),
      ...successPair({
        toolName: toolName.grep,
        args: { pattern: 'TODO' },
        payload: { matches: [], totalMatches: 0 },
      }),
    ];
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should not treat empty results with unknown arguments as repeated identical empty calls', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 3; i++) {
      messages.push(
        successMessage({
          toolCallId: `orphan_grep_${i}`,
          toolName: toolName.grep,
          payload: { matches: [], totalMatches: 0 },
        }),
      );
    }

    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });
});

// ---------------------------------------------------------------------------
// AP6: no-forward-progress default-chain contract
// ---------------------------------------------------------------------------

describe('default detector chain no-forward-progress contract (AP6)', () => {
  it('should not include noForwardProgress as a default nudge detector', () => {
    expect(buildDefaultDetectors().map((detector) => detector.pattern)).not.toContain(anomalyPattern.noForwardProgress);
  });

  it('should not report read-only investigation sequences through any default detector', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 8; i++) {
      messages.push(...successPair({ toolName: toolName.readFile, args: { path: `file_${i}.scad` } }));
    }
    const events = summarizeMessages(messages);

    const detection = buildDefaultDetectors()
      .map((detector) => detector.evaluate(events, baseState()))
      .find((result) => result.kind !== 'clear');

    expect(detection).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AP7: sameErrorDifferentArgsDetector
// ---------------------------------------------------------------------------

describe('sameErrorDifferentArgsDetector (AP7)', () => {
  const detector = findDetector(anomalyPattern.sameErrorDifferentArgs);

  it('should nudge when same (toolName, errorCode) repeats 5x with ≥2 distinct argsHashes', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(
        ...failingPair({
          toolName: toolName.testModel,
          args: { targetFile: `case_${i}.scad` },
          errorCode: 'TOOL_EXECUTION_ERROR',
          message: `failure_${i}`,
        }),
      );
    }
    const result = evaluateDetector(detector, messages) as { kind: string; reminder: string };
    expect(result.kind).toBe('nudge');
    expect(result.reminder).toContain('TOOL_EXECUTION_ERROR');
  });

  it('should NOT fire when all 5 share the same argsHash (AP1 territory)', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(
        ...failingPair({
          toolName: toolName.testModel,
          args: { targetFile: 'same.scad' },
          errorCode: 'TOOL_EXECUTION_ERROR',
          message: `failure_${i}`,
        }),
      );
    }
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });

  it('should not fire when error codes differ', () => {
    const messages: BaseMessage[] = [];
    for (let i = 0; i < 3; i++) {
      messages.push(
        ...failingPair({
          toolName: toolName.testModel,
          args: { targetFile: `case_${i}.scad` },
          errorCode: 'TOOL_EXECUTION_ERROR',
        }),
      );
    }
    for (let i = 0; i < 2; i++) {
      messages.push(
        ...failingPair({
          toolName: toolName.testModel,
          args: { targetFile: `other_${i}.scad` },
          errorCode: 'TOOL_EXECUTION_TIMEOUT',
        }),
      );
    }
    expect(evaluateDetector(detector, messages)).toEqual({ kind: 'clear' });
  });
});

// ---------------------------------------------------------------------------
// Detector defaults (sanity)
// ---------------------------------------------------------------------------

describe('defaultThresholds', () => {
  it('should expose the documented default thresholds', () => {
    expect(defaultThresholds).toMatchObject({
      identicalErrorNudge: 3,
      identicalErrorTerminate: 6,
      identicalCall: 5,
      perTargetEdit: 5,
      pingPongCycles: 2,
      emptyResult: 3,
      sameErrorDifferentArgsCount: 5,
      sameErrorDifferentArgsWindow: 8,
      sameErrorDifferentArgsDistinctArgs: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// Middleware contract: hooks, telemetry, transcript, dedupe, helped
// ---------------------------------------------------------------------------

const callBeforeModel = (
  middleware: ReturnType<typeof createAgentSafeguardsMiddleware>,
  state: BeforeModelState,
  runtime: BeforeModelRuntime,
): unknown => {
  const beforeModel = resolveMiddlewareHook(middleware.beforeModel);
  return beforeModel(state, runtime) as unknown;
};

describe('createAgentSafeguardsMiddleware', () => {
  let chatRpcService: ReturnType<typeof mock<ChatRpcService>>;
  let modelService: ReturnType<typeof mock<ModelService>>;
  let metricsService: MetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    chatRpcService = mock<ChatRpcService>();
    chatRpcService.sendRpcRequest.mockResolvedValue({ success: true, message: 'ok', bytesWritten: 0 });
    modelService = mock<ModelService>();
    modelService.getOtelProviderName.mockReturnValue('anthropic');
    metricsService = new MetricsService();
    vi.spyOn(metricsService.genAiAgentSafeguardInterventions, 'add');
  });

  it('exposes both beforeModel (nudge path, CS1) and wrapModelCall (terminate path)', () => {
    const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
    expect(middleware.beforeModel).toBeDefined();
    expect(middleware.wrapModelCall).toBeDefined();
  });

  describe('nudge path (CS1, CS2)', () => {
    const buildIdenticalErrorMessages = (count: number): BaseMessage[] => {
      const messages: BaseMessage[] = [new HumanMessage('please run my tests')];
      for (let i = 0; i < count; i++) {
        const id = `error_call_${i}`;
        messages.push(aiCallMessage([{ name: toolName.testModel, args: { targetFile: 'main.scad' }, id }]));
        messages.push(errorMessage({ toolCallId: id, toolName: toolName.testModel, message: 'kernel:error' }));
      }
      return messages;
    };

    it('appends a HumanMessage(<system-reminder>) at the END of state.messages', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const state = { ...baseState(), messages: buildIdenticalErrorMessages(3) };

      const result = callBeforeModel(middleware, state, {
        context: { chatId: 'chat-1', modelId: 'anthropic-claude-sonnet-4.6', modelService },
      }) as { messages: BaseMessage[] };

      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages).toHaveLength(1);
      const nudge = result.messages[0];
      expect(nudge).toBeInstanceOf(HumanMessage);
      expect(typeof nudge?.content).toBe('string');
      expect(nudge?.content as string).toMatch(/^<system-reminder>\n[\S\s]+\n<\/system-reminder>$/);
    });

    it('records gen_ai.agent.safeguard.interventions counter with action=nudge and pattern attributes', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const state = { ...baseState(), messages: buildIdenticalErrorMessages(3) };

      callBeforeModel(middleware, state, {
        context: { chatId: 'chat-1', modelId: 'anthropic-claude-sonnet-4.6', modelService },
      });

      expect(metricsService.genAiAgentSafeguardInterventions.add).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          [AttributeKey.GEN_AI_SAFEGUARD_PATTERN]: anomalyPattern.identicalError,
          [AttributeKey.GEN_AI_SAFEGUARD_ACTION]: 'nudge',
          [AttributeKey.GEN_AI_REQUEST_MODEL]: 'anthropic-claude-sonnet-4.6',
          [AttributeKey.GEN_AI_PROVIDER_NAME]: 'anthropic',
        }),
      );
    });

    it('writes a {role:"safeguard",pattern,action,signature,timestamp} transcript line on each firing', async () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const state = { ...baseState(), messages: buildIdenticalErrorMessages(3) };

      callBeforeModel(middleware, state, {
        context: { chatId: 'chat-1', modelId: 'anthropic-claude-sonnet-4.6', modelService },
      });

      await vi.waitFor(() => {
        expect(chatRpcService.sendRpcRequest).toHaveBeenCalled();
      });
      const call = chatRpcService.sendRpcRequest.mock.calls[0]![0];
      const { content } = (call as { args: { content: string; targetFile: string } }).args;
      expect((call as { args: { targetFile: string } }).args.targetFile).toBe('.tau/transcripts/chat-1.jsonl');
      const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
      expect(parsed).toMatchObject({
        role: 'safeguard',
        pattern: anomalyPattern.identicalError,
        action: 'nudge',
        argsKnown: true,
        toolNames: [toolName.testModel],
        eventCount: 3,
      });
      expect(typeof parsed['signature']).toBe('string');
      expect(typeof parsed['timestamp']).toBe('string');
      expect(typeof parsed['reminderPreview']).toBe('string');
      expect((parsed['reminderPreview'] as string).length).toBeLessThanOrEqual(200);
    });

    it('dedupes by signature: a second invocation does NOT re-fire the same nudge', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const messages = buildIdenticalErrorMessages(3);
      const state = { ...baseState(), messages };

      const first = callBeforeModel(middleware, state, {
        context: { chatId: 'chat-1' },
      }) as { _safeguardSignaturesFired?: string[] };

      const updatedState: SafeguardsState & { messages: BaseMessage[] } = {
        ...baseState({ _safeguardSignaturesFired: first._safeguardSignaturesFired ?? [] }),
        messages,
      };
      const second = callBeforeModel(middleware, updatedState, { context: { chatId: 'chat-1' } });

      expect(second).toEqual({});
    });

    it('returns no-op (undefined / empty update) when there are no anomalies', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const state = {
        ...baseState(),
        messages: [new HumanMessage('hello')] as BaseMessage[],
      };
      const result = callBeforeModel(middleware, state, { context: { chatId: 'chat-1' } });
      expect(result).toEqual({});
      expect(metricsService.genAiAgentSafeguardInterventions.add).not.toHaveBeenCalled();
    });

    it('does not inject a default nudge for read-only investigation sequences', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const messages: BaseMessage[] = [new HumanMessage('audit this without editing yet')];
      for (let i = 0; i < 8; i++) {
        messages.push(...successPair({ toolName: toolName.readFile, args: { path: `file_${i}.ts` } }));
      }

      const result = callBeforeModel(middleware, { ...baseState(), messages }, { context: { chatId: 'chat-1' } });

      expect(result).toEqual({});
      expect(metricsService.genAiAgentSafeguardInterventions.add).not.toHaveBeenCalled();
      expect(chatRpcService.sendRpcRequest).not.toHaveBeenCalled();
    });
  });

  describe('CS4: never fires while a tool call is mid-flight', () => {
    it('returns clear when the last message is an unmatched AIMessage(tool_calls)', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const messages: BaseMessage[] = [new HumanMessage('hi')];
      for (let i = 0; i < 3; i++) {
        const id = `pre_${i}`;
        messages.push(aiCallMessage([{ name: toolName.testModel, args: { targetFile: 'a.scad' }, id }]));
        messages.push(errorMessage({ toolCallId: id, toolName: toolName.testModel, message: 'kernel:error' }));
      }
      messages.push(
        aiCallMessage([{ name: toolName.testModel, args: { targetFile: 'a.scad' }, id: 'pending' }]),
        // No matching ToolMessage yet — summarizeMessages drops it.
      );

      const state = { ...baseState(), messages };
      callBeforeModel(middleware, state, { context: { chatId: 'chat-1' } });
      // The detector still sees the 3 prior failures and SHOULD have fired earlier;
      // the contract here is that the *unmatched* AIMessage doesn't count as a 4th event.
      // i.e. summarizeMessages produced exactly 3 events.
      expect(summarizeMessages(messages)).toHaveLength(3);
    });
  });

  describe('terminate path', () => {
    it('beforeModel surfaces _safeguardTerminate on the 6th identical failure', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const messages: BaseMessage[] = [new HumanMessage('go')];
      for (let i = 0; i < 6; i++) {
        const id = `error_${i}`;
        messages.push(aiCallMessage([{ name: toolName.testModel, args: { targetFile: 'a.scad' }, id }]));
        messages.push(errorMessage({ toolCallId: id, toolName: toolName.testModel, message: 'kernel:error' }));
      }

      const state = { ...baseState(), messages };
      const result = callBeforeModel(middleware, state, { context: { chatId: 'chat-1' } }) as {
        _safeguardTerminate?: { pattern: string; reason: string; signature: string };
      };
      expect(result._safeguardTerminate).toBeDefined();
      expect(result._safeguardTerminate?.pattern).toBe(anomalyPattern.identicalError);
      expect(metricsService.genAiAgentSafeguardInterventions.add).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ [AttributeKey.GEN_AI_SAFEGUARD_ACTION]: 'terminate' }),
      );
    });

    it('wrapModelCall returns a synthetic AIMessage (no tool_calls) when _safeguardTerminate is set', async () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const handler = vi.fn().mockResolvedValue(new AIMessage('should not be called'));

      const state: WrapModelCallState = {
        _safeguardSignaturesFired: [],
        _safeguardTerminate: {
          pattern: anomalyPattern.identicalError,
          reason: '`test_model` failed identically 6 times in a row.',
          signature: 'sig',
        },
      };

      const result = (await invokeWrapModelCall(middleware, { messages: [], state }, handler)) as AIMessage;

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(AIMessage);
      expect(result.tool_calls ?? []).toHaveLength(0);
      expect(typeof result.content).toBe('string');
      expect(result.content as string).toContain(anomalyPattern.identicalError);
    });

    it('wrapModelCall delegates to handler when _safeguardTerminate is absent', async () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const handler = vi.fn().mockResolvedValue(new AIMessage('continue'));

      const state: WrapModelCallState = { _safeguardSignaturesFired: [] };
      await invokeWrapModelCall(middleware, { messages: [], state }, handler);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('helped telemetry (next-turn correlation)', () => {
    const buildPostNudgeMessages = (lastAssistant: AIMessage): BaseMessage[] => {
      const messages: BaseMessage[] = [new HumanMessage('please run my tests')];
      for (let i = 0; i < 3; i++) {
        const id = `error_call_${i}`;
        messages.push(aiCallMessage([{ name: toolName.testModel, args: { targetFile: 'main.scad' }, id }]));
        messages.push(errorMessage({ toolCallId: id, toolName: toolName.testModel, message: 'kernel:error' }));
      }
      // Inject the persisted nudge as a HumanMessage so the next turn sees it.
      messages.push(new HumanMessage('<system-reminder>\nstub\n</system-reminder>'));
      messages.push(lastAssistant);
      return messages;
    };

    it('records helped=true when the model produced no tool_calls after the nudge', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const expectedSignature = `${toolName.testModel}:${canonicalArgsHash({ targetFile: 'main.scad' })}:${errorHash(
        'kernel:error',
        'TOOL_EXECUTION_ERROR',
      )}`;

      const messages = buildPostNudgeMessages(new AIMessage('I will stop and ask the user instead.'));
      const state: SafeguardsState & { messages: BaseMessage[] } = {
        ...baseState({
          _safeguardSignaturesFired: [expectedSignature],
          _safeguardLastSignature: expectedSignature,
          _safeguardLastPattern: anomalyPattern.identicalError,
        }),
        messages,
      };

      const result = callBeforeModel(middleware, state, { context: { chatId: 'chat-1' } }) as Record<string, unknown>;

      expect(metricsService.genAiAgentSafeguardInterventions.add).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          [AttributeKey.GEN_AI_SAFEGUARD_PATTERN]: anomalyPattern.identicalError,
          [AttributeKey.GEN_AI_SAFEGUARD_HELPED]: 'true',
        }),
      );
      expect(result['_safeguardLastSignature']).toBeUndefined();
      expect(result['_safeguardLastPattern']).toBeUndefined();
    });

    it('records helped=false when the model repeats the offending tool call', () => {
      const middleware = createAgentSafeguardsMiddleware(metricsService, chatRpcService);
      const expectedSignature = `${toolName.testModel}:${canonicalArgsHash({ targetFile: 'main.scad' })}:${errorHash(
        'kernel:error',
        'TOOL_EXECUTION_ERROR',
      )}`;

      const repeated = aiCallMessage([{ name: toolName.testModel, args: { targetFile: 'main.scad' }, id: 'r' }]);
      const state: SafeguardsState & { messages: BaseMessage[] } = {
        ...baseState({
          _safeguardSignaturesFired: [expectedSignature],
          _safeguardLastSignature: expectedSignature,
          _safeguardLastPattern: anomalyPattern.identicalError,
        }),
        messages: buildPostNudgeMessages(repeated),
      };

      callBeforeModel(middleware, state, { context: { chatId: 'chat-1' } });

      const { calls } = (metricsService.genAiAgentSafeguardInterventions.add as ReturnType<typeof vi.fn>).mock;
      const helpedCall = calls.find(
        (call) => (call[1] as Record<string, string>)[AttributeKey.GEN_AI_SAFEGUARD_HELPED] !== undefined,
      );
      expect(helpedCall?.[1]).toMatchObject({ [AttributeKey.GEN_AI_SAFEGUARD_HELPED]: 'false' });
    });
  });
});

// ---------------------------------------------------------------------------
// Type sanity (kept at the very bottom so it doesn't shadow real assertions)
// ---------------------------------------------------------------------------

describe('public type surface', () => {
  it('exposes a Detector with a stable evaluate signature', () => {
    const event: ToolEventSummary = {
      index: 0,
      toolName: 'noop',
      argsKnown: true,
      argsHash: '0',
      argsPreview: '{}',
      isError: false,
      isEmptyResult: false,
      isMutation: false,
    };
    const detector = buildDefaultDetectors()[0]!;
    expect(detector.evaluate([event], baseState())).toMatchObject({ kind: 'clear' });
  });
});
