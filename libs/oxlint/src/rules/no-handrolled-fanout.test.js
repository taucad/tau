import path from 'node:path';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noHandrolledFanoutRule } from './no-handrolled-fanout.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

const root = process.cwd();
const eventsTopicFile = path.join(root, 'libs/events/src/topic.ts');
const testFile = path.join(root, 'apps/libs/fs-client/src/example.test.ts');
const offendingFile = path.join(root, 'apps/libs/fs-client/src/example-service.ts');

describe('no-handrolled-fanout', () => {
  it('flags hand-rolled fan-out declarations; allows Topic and non-function containers', () => {
    ruleTester.run('no-handrolled-fanout', noHandrolledFanoutRule, {
      valid: [
        {
          name: 'allowlisted events package',
          code: 'class Foo { private readonly subs = new Set<(e: number) => void>(); }',
          filename: eventsTopicFile,
        },
        {
          name: 'allowlisted test file',
          code: 'class Foo { private readonly subs = new Set<(e: number) => void>(); }',
          filename: testFile,
        },
        {
          name: 'Topic composition',
          code: "import { Topic } from '@taucad/events'; class Foo { readonly #topic = new Topic<number>(); }",
          filename: offendingFile,
        },
        {
          name: 'non-function Set payload',
          code: 'class Foo { private readonly items = new Set<string>(); }',
          filename: offendingFile,
        },
        {
          name: 'resolver queue is not pubsub fan-out',
          code: 'const waiters: Array<(value: string) => void> = [];',
          filename: offendingFile,
        },
      ],
      invalid: [
        {
          name: 'flags Set of function handlers',
          code: 'class Foo { private readonly subs = new Set<(e: number) => void>(); }',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
        {
          name: 'flags Array of subscription objects',
          code: 'class Foo { private readonly arr: Array<{ handler: (e: number) => void }> = []; }',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
        {
          name: 'flags Set of listener objects',
          code: 'class Foo { private readonly listeners = new Set<{ callback(): void }>(); }',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
        {
          name: 'flags local variable declarations',
          code: 'const listeners = new Set<() => void>();',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
        {
          name: 'flags nested Map values',
          code: 'const listeners = new Map<string, Set<(value: string) => void>>();',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
        {
          name: 'flags named listener aliases',
          code: 'type StatusListener = () => void; class Foo { private listeners = new Set<StatusListener>(); }',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
        {
          name: 'flags named arrays of handlers',
          code: 'const handlers: Array<(value: string) => void> = [];',
          filename: offendingFile,
          errors: [{ messageId: 'noHandrolledFanout' }],
        },
      ],
    });
  });
});
