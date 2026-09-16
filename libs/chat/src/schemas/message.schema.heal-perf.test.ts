import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as ToolInputRegistry from '#schemas/tool-input.registry.js';

vi.mock('#schemas/tool-input.registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ToolInputRegistry>();
  return {
    ...actual,
    getToolInputSchema: vi.fn(actual.getToolInputSchema),
  };
});

const { getToolInputSchema } = await import('#schemas/tool-input.registry.js');
const { _normalizeToolLifecyclePartsForTesting: normalize } = await import('#schemas/message.schema.js');

const getToolInputSchemaSpy = vi.mocked(getToolInputSchema);

type Role = 'user' | 'assistant';

type MessageFixture = {
  id: string;
  role: Role;
  parts: unknown[];
};

const userMessage = (id: string): MessageFixture => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
});

const assistantMessage = (id: string, parts: unknown[]): MessageFixture => ({
  id,
  role: 'assistant',
  parts,
});

const textPart = (text: string) => ({ type: 'text', text });

const reasoningPart = (): { type: 'reasoning'; text: string; state: 'done' } => ({
  type: 'reasoning',
  text: 'thinking',
  state: 'done',
});

const validReadFileToolPart = (callId: string) => ({
  type: 'tool-read_file',
  toolCallId: callId,
  state: 'output-available',
  input: { targetFile: 'main.ts' },
  output: { content: '...', totalLines: 1 },
});

const interruptedReadFilePart = (callId: string) => ({
  type: 'tool-read_file',
  toolCallId: callId,
  state: 'output-error',
  input: { limit: 15 },
  errorText: 'interrupted',
});

const alreadyHealedReadFilePart = (callId: string) => ({
  type: 'tool-read_file',
  toolCallId: callId,
  state: 'output-error',
  input: undefined,
  rawInput: { limit: 15 },
  errorText: 'interrupted',
});

const dynamicToolOutputErrorPart = (callId: string) => ({
  type: 'dynamic-tool',
  toolName: 'experimental_tool',
  toolCallId: callId,
  state: 'output-error',
  input: { partial: true },
  errorText: 'interrupted',
});

const staleReadFileInputAvailablePart = (callId: string) => ({
  type: 'tool-read_file',
  toolCallId: callId,
  state: 'input-available',
  input: { limit: 15 },
});

const staleDynamicInputAvailablePart = (callId: string) => ({
  type: 'dynamic-tool',
  toolName: 'experimental_tool',
  toolCallId: callId,
  state: 'input-available',
  input: { partial: true },
});

/** A conversation on the hot path: prose and settled tool parts, nothing to heal. */
const hotParts = (count: number): unknown[] =>
  Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? textPart(`prose ${index}`) : validReadFileToolPart(`call_${index}`),
  );

/** Milliseconds for twenty passes over `partCount` parts, so the number is measurable. */
const timeNormalize = (partCount: number): number => {
  const messages = [userMessage('m0'), assistantMessage('m1', hotParts(partCount))];
  const start = performance.now();
  for (let pass = 0; pass < 20; pass++) {
    normalize(messages);
  }
  return performance.now() - start;
};

beforeEach(() => {
  getToolInputSchemaSpy.mockClear();
});

describe('normalizeToolLifecycleParts performance contract', () => {
  describe('reference identity (no allocation when no part needs healing)', () => {
    it('should return the same array reference when input is not an array', () => {
      const input = { not: 'an array' };
      expect(normalize(input)).toBe(input);
    });

    it('should return the same array and message references when no part needs normalization', () => {
      const messages = [
        userMessage('m0'),
        assistantMessage('m1', [textPart('hello'), reasoningPart()]),
        assistantMessage('m2', [validReadFileToolPart('call_1'), validReadFileToolPart('call_2')]),
      ];

      const healed = normalize(messages) as typeof messages;

      expect(healed).toBe(messages);
      expect(healed.length).toBe(messages.length);
      for (const [i, original] of messages.entries()) {
        expect(healed[i]).toBe(original);
      }
    });

    it('should return the same message reference when output-error parts are already healed', () => {
      const message = assistantMessage('m1', [
        alreadyHealedReadFilePart('call_1'),
        textPart('and some prose'),
        alreadyHealedReadFilePart('call_2'),
      ]);

      const healed = normalize([message]) as [typeof message];

      expect(healed[0]).toBe(message);
    });

    it('should return the same message reference when output-error parts are dynamic-tool', () => {
      const message = assistantMessage('m1', [dynamicToolOutputErrorPart('call_dyn_1')]);

      const healed = normalize([message]) as [typeof message];

      expect(healed[0]).toBe(message);
    });

    it('should return the same message reference when output-error input already satisfies the registry schema', () => {
      const message = assistantMessage('m1', [
        {
          type: 'tool-read_file',
          toolCallId: 'call_valid_error',
          state: 'output-error',
          input: { targetFile: 'main.ts' },
          errorText: 'tool execution failed cleanly',
        },
      ]);

      const healed = normalize([message]) as [typeof message];

      expect(healed[0]).toBe(message);
    });

    it('should preserve active current-tail in-progress tool parts', () => {
      const message = assistantMessage('m1', [staleReadFileInputAvailablePart('call_live')]);

      const healed = normalize([userMessage('m0'), message]) as [MessageFixture, typeof message];

      expect(healed[1]).toBe(message);
      expect(getToolInputSchemaSpy).not.toHaveBeenCalled();
    });
  });

  describe('copy-on-write (preserves untouched references when healing)', () => {
    it('should preserve untouched message references when only one message contains a healable part', () => {
      const m0 = userMessage('m0');
      const m1 = assistantMessage('m1', [textPart('reply 1')]);
      const m2 = assistantMessage('m2', [interruptedReadFilePart('call_interrupted')]);
      const m3 = assistantMessage('m3', [textPart('reply 3')]);
      const messages = [m0, m1, m2, m3];

      const healed = normalize(messages) as typeof messages;

      expect(healed[0]).toBe(m0);
      expect(healed[1]).toBe(m1);
      expect(healed[2]).not.toBe(m2);
      expect(healed[3]).toBe(m3);
    });

    it('should preserve untouched part references inside a message that needs partial healing', () => {
      const sharedTextPart = textPart('untouched');
      const sharedReasoningPart = reasoningPart();
      const interrupted = interruptedReadFilePart('call_interrupted');
      const message = assistantMessage('m1', [sharedTextPart, interrupted, sharedReasoningPart]);

      const healed = normalize([message]) as [typeof message];
      const healedMessage = healed[0];

      expect(healedMessage).not.toBe(message);
      expect(healedMessage.parts).not.toBe(message.parts);
      expect(healedMessage.parts[0]).toBe(sharedTextPart);
      expect(healedMessage.parts[2]).toBe(sharedReasoningPart);

      const healedToolPart = healedMessage.parts[1] as Record<string, unknown>;
      expect(healedToolPart['input']).toBeUndefined();
      expect(healedToolPart['rawInput']).toEqual({ limit: 15 });
    });

    it('should be idempotent (a second pass returns the same reference as the first)', () => {
      const messages = [userMessage('m0'), assistantMessage('m1', [interruptedReadFilePart('call_interrupted')])];

      const firstPass = normalize(messages) as typeof messages;
      const secondPass = normalize(firstPass) as typeof messages;

      expect(secondPass).not.toBe(messages);
      for (const [i, part] of firstPass.entries()) {
        expect(secondPass[i]).toBe(part);
      }
    });

    it('should terminalize stale historical static tool parts before a later user message', () => {
      const m0 = userMessage('m0');
      const m1 = assistantMessage('m1', [staleReadFileInputAvailablePart('call_stale')]);
      const m2 = userMessage('m2');

      const normalized = normalize([m0, m1, m2]) as MessageFixture[];

      expect(normalized[0]).toBe(m0);
      expect(normalized[1]).not.toBe(m1);
      expect(normalized[2]).toBe(m2);
      expect(normalized[1]?.parts[0]).toMatchObject({
        type: 'tool-read_file',
        toolCallId: 'call_stale',
        state: 'output-error',
        input: undefined,
        rawInput: { limit: 15 },
      });
    });

    it('should terminalize stale historical dynamic tool parts without consulting the static registry', () => {
      const m0 = userMessage('m0');
      const m1 = assistantMessage('m1', [staleDynamicInputAvailablePart('call_dynamic_stale')]);
      const m2 = userMessage('m2');

      const normalized = normalize([m0, m1, m2]) as MessageFixture[];

      expect(normalized[1]).not.toBe(m1);
      expect(normalized[1]?.parts[0]).toMatchObject({
        type: 'dynamic-tool',
        toolName: 'experimental_tool',
        toolCallId: 'call_dynamic_stale',
        state: 'output-error',
        input: { partial: true },
      });
      expect(getToolInputSchemaSpy).not.toHaveBeenCalled();
    });
  });

  describe('registry short-circuiting (no double-parse on the hot path)', () => {
    it('should NOT call getToolInputSchema when no static part needs validation', () => {
      const messages = [
        userMessage('m0'),
        assistantMessage('m1', [
          validReadFileToolPart('call_1'),
          validReadFileToolPart('call_2'),
          textPart('reply'),
          reasoningPart(),
        ]),
      ];

      normalize(messages);

      expect(getToolInputSchemaSpy).not.toHaveBeenCalled();
    });

    it('should NOT call getToolInputSchema when output-error parts are already healed (input === undefined)', () => {
      const messages = [
        userMessage('m0'),
        assistantMessage('m1', [alreadyHealedReadFilePart('call_1'), alreadyHealedReadFilePart('call_2')]),
      ];

      normalize(messages);

      expect(getToolInputSchemaSpy).not.toHaveBeenCalled();
    });

    it('should NOT call getToolInputSchema for dynamic-tool output-error parts', () => {
      const messages = [userMessage('m0'), assistantMessage('m1', [dynamicToolOutputErrorPart('call_dyn')])];

      normalize(messages);

      expect(getToolInputSchemaSpy).not.toHaveBeenCalled();
    });

    it('should call getToolInputSchema exactly once per static output-error part with non-undefined input', () => {
      const messages = [
        userMessage('m0'),
        assistantMessage('m1', [interruptedReadFilePart('call_a'), interruptedReadFilePart('call_b')]),
      ];

      normalize(messages);

      expect(getToolInputSchemaSpy).toHaveBeenCalledTimes(2);
    });

    it('should call getToolInputSchema exactly once for each stale historical static input part', () => {
      const messages = [
        userMessage('m0'),
        assistantMessage('m1', [staleReadFileInputAvailablePart('call_a'), staleReadFileInputAvailablePart('call_b')]),
        userMessage('m2'),
      ];

      normalize(messages);

      expect(getToolInputSchemaSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('stress smoke test', () => {
    it('should heal a 1000-part conversation without allocating or consulting the registry', () => {
      const messages = [userMessage('m0'), assistantMessage('m1', hotParts(1000))];

      const healed = normalize(messages) as typeof messages;

      expect(healed[0]).toBe(messages[0]);
      expect(healed[1]).toBe(messages[1]);
      expect(getToolInputSchemaSpy).not.toHaveBeenCalled();
    });

    /*
     * A *ratio*, not a wall clock (W14 sweep): the old 5 ms budget measured the
     * machine, so it went red beside other suites and green alone. Ten times the
     * input costs about ten times the work when the pass is linear and about a
     * hundred when it is not, and both halves pay the same load, so the shape is
     * what the bound reads. Still off in CI, where a shared runner can stall
     * either half.
     */
    it.skipIf(process.env['CI'])('should stay linear in the number of parts', () => {
      const small = timeNormalize(200);
      const large = timeNormalize(2000);

      expect(large / Math.max(small, 0.1)).toBeLessThan(30);
    });
  });
});
