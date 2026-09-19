import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineConfiguration } from '#configuration/index.js';
import { defineJobCommand, defineJobProvider, defineJobQuery } from '#jobs/job-provider.js';

const configuration = defineConfiguration({
  id: 'type-test.configuration',
  version: '1.0.0',
  schema: z.object({ iterations: z.number() }),
  ui: { version: 1, rjsf: {} },
});

describe('heterogeneous job provider inference', () => {
  it('should contextually type every query and command from its own schemas', () => {
    const provider = defineJobProvider({
      id: 'type-test.provider',
      kind: 'type-test',
      version: '1.0.0',
      kindVersion: 1,
      configuration,
      resultSchema: z.object({ finished: z.boolean() }),
      recovery: { type: 'restart-from-input' },
      queries: [
        defineJobQuery({
          name: 'by-name',
          inputSchema: z.object({ name: z.string() }),
          resultSchema: z.object({ count: z.number() }),
          async query(input) {
            expectTypeOf(input).toEqualTypeOf<{ name: string }>();
            return { count: input.name.length };
          },
        }),
        defineJobQuery({
          name: 'by-index',
          inputSchema: z.object({ index: z.number() }),
          resultSchema: z.object({ label: z.string() }),
          async query(input) {
            expectTypeOf(input).toEqualTypeOf<{ index: number }>();
            return { label: input.index.toFixed(0) };
          },
        }),
      ],
      commands: [
        defineJobCommand({
          name: 'rename',
          inputSchema: z.object({ name: z.string() }),
          resultSchema: z.object({ revision: z.number() }),
          replayPolicy: 'replay-safe',
          async command(input) {
            expectTypeOf(input.value).toEqualTypeOf<{ name: string }>();
            return { revision: input.value.name.length };
          },
        }),
        defineJobCommand({
          name: 'resize',
          inputSchema: z.object({ size: z.number() }),
          resultSchema: z.object({ accepted: z.boolean() }),
          replayPolicy: 'reconcile-required',
          async command(input) {
            expectTypeOf(input.value).toEqualTypeOf<{ size: number }>();
            return { accepted: input.value.size > 0 };
          },
        }),
      ],
      async execute(input, services) {
        expectTypeOf(services.publishCheckpoint).toBeUndefined();
        // @ts-expect-error -- resume context is absent without checkpoint recovery.
        void input.resume;
        return { finished: input.configuration.iterations > 0 };
      },
    });

    const registration = provider();
    type QueryName = (typeof registration.queries)[number]['name'];
    type CommandName = (typeof registration.commands)[number]['name'];
    expectTypeOf<QueryName>().toEqualTypeOf<'by-name' | 'by-index'>();
    expectTypeOf<CommandName>().toEqualTypeOf<'rename' | 'resize'>();
  });

  it('should reject results and payload access from another extension schema', () => {
    defineJobQuery({
      name: 'query',
      inputSchema: z.object({ name: z.string() }),
      resultSchema: z.object({ count: z.number() }),
      // @ts-expect-error -- query result must be raw input for this result schema.
      async query(input) {
        // @ts-expect-error -- this query has no index input.
        void input.index;
        return { label: input.name };
      },
    });
    defineJobCommand({
      name: 'command',
      inputSchema: z.object({ size: z.number() }),
      resultSchema: z.object({ accepted: z.boolean() }),
      replayPolicy: 'replay-safe',
      // @ts-expect-error -- command result must be raw input for this result schema.
      async command(input) {
        // @ts-expect-error -- this command has no name input.
        void input.value.name;
        return { revision: input.value.size };
      },
    });
  });
});
