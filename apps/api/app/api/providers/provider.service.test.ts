import { describe, it, expect } from 'vitest';
import { convertMessagesToResponsesInput } from '@langchain/openai';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { modelFamilySchema, providerIdSchema } from '#api/providers/provider.schema.js';

/**
 * Regression test for @langchain/openai Responses API converter.
 *
 * The converter's `phase` extraction calls `content.findIndex()` without
 * guarding for string content, crashing with "content.findIndex is not a
 * function" when an AIMessage has string content (the default shape).
 *
 * Patched in `patches/@langchain__openai@1.4.0.patch`. This test ensures
 * the fix holds across dependency updates.
 */
describe('OpenAI Responses API converter', () => {
  it('should handle AIMessage with string content without crashing', () => {
    const messages = [new HumanMessage('Hello'), new AIMessage('Here is my response.')];

    const result = convertMessagesToResponsesInput({
      messages,
      zdrEnabled: false,
      model: 'gpt-5.5',
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'message', role: 'user' }),
        expect.objectContaining({ type: 'message', role: 'assistant' }),
      ]),
    );
  });
});

/**
 * The `tau` provider existed only for the TAU_TEST_MODE replay model, which
 * left with the API agent plane (W3-CUT-2). An enum member no catalog row can
 * satisfy is a trap: it type-checks in every `Exclude<ProviderId, …>` alias and
 * resolves at runtime to a factory that throws.
 */
describe('provider identity catalog', () => {
  it('has no replay provider or model family', () => {
    expect(providerIdSchema.safeParse('tau').success).toBe(false);
    expect(modelFamilySchema.safeParse('tau').success).toBe(false);
    expect(providerIdSchema.safeParse('openai').success).toBe(true);
  });
});
