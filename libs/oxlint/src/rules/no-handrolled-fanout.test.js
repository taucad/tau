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
const eventsTopicFile = path.join(root, 'packages/events/src/topic.ts');
const testFile = path.join(root, 'packages/fs-client/src/example.test.ts');
const offendingFile = path.join(root, 'packages/fs-client/src/example-service.ts');

describe('no-handrolled-fanout', () => {
  it('flags hand-rolled Set/Array fan-out; allows Topic and non-function Sets', () => {
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
      ],
    });
  });
});
