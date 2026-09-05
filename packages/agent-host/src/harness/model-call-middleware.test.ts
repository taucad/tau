import { describe, expect, it } from 'vitest';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { composeModelCallMiddleware } from '#harness/model-call-middleware.js';
import type { ModelCallMiddleware } from '#harness/model-call-middleware.js';
import { stubModel } from '#harness/harness.fixture.js';

describe('composeModelCallMiddleware', () => {
  it('ports SP-8 C5: first middleware is outermost and exits last', async () => {
    const trace: string[] = [];
    const stream = createAssistantMessageEventStream();
    const base: StreamFn = () => {
      trace.push('base');
      return stream;
    };
    const middleware =
      (name: string): ModelCallMiddleware =>
      async (request, next) => {
        trace.push(`${name}:in`);
        const result = await next(request);
        trace.push(`${name}:out`);
        return result;
      };
    const composed = composeModelCallMiddleware(base, [middleware('outer'), middleware('inner')]);

    await composed(stubModel, { messages: [] });

    expect(trace).toEqual(['outer:in', 'inner:in', 'base', 'inner:out', 'outer:out']);
  });
});
