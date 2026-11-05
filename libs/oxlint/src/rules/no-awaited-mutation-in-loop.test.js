import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noAwaitedMutationInLoopRule } from './no-awaited-mutation-in-loop.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

describe('no-awaited-mutation-in-loop', () => {
  it('flags an awaited mutation convenience per iteration; allows batching, reads and once-per-loop awaits', () => {
    ruleTester.run('no-awaited-mutation-in-loop', noAwaitedMutationInLoopRule, {
      valid: [
        {
          name: 'one changeset for the whole loop',
          code: 'async function f(fs, files) { const entries = files.map((path) => ({ op: "delete", path })); await fs.apply({ entries }); }',
        },
        {
          name: 'calls started together coalesce',
          code: 'async function f(fs, files) { await Promise.all(files.map(async (path) => fs.unlink(path))); }',
        },
        {
          name: 'an awaited read in a loop is not a mutation',
          code: 'async function f(fs, files) { for (const path of files) { await fs.readFile(path); } }',
        },
        {
          name: 'a mutation outside any loop',
          code: 'async function f(fs) { await fs.writeFile("a", "b"); }',
        },
        {
          name: 'the iterable of a for-of runs once',
          code: 'async function f(fs) { for (const x of await fs.mkdir("a")) { void x; } }',
        },
        {
          name: 'a function defined in a loop body is its own scope',
          code: 'function f(fs, files) { const tasks = []; for (const path of files) { tasks.push(async () => { await fs.unlink(path); }); } return tasks; }',
        },
      ],
      invalid: [
        {
          name: 'awaited unlink in a for-of',
          code: 'async function f(fs, files) { for (const path of files) { await fs.unlink(path); } }',
          errors: [{ messageId: 'awaitedMutationInLoop', data: { method: 'unlink' } }],
        },
        {
          name: 'awaited writeFile in a while loop',
          code: 'async function f(fs) { let i = 0; while (i < 3) { await fs.writeFile(String(i), ""); i += 1; } }',
          errors: [{ messageId: 'awaitedMutationInLoop', data: { method: 'writeFile' } }],
        },
        {
          name: 'awaited pipeline convenience in a classic for',
          code: 'async function f(p, xs) { for (let i = 0; i < xs.length; i += 1) { await p.moveResolved(xs[i]); } }',
          errors: [{ messageId: 'awaitedMutationInLoop', data: { method: 'moveResolved' } }],
        },
        {
          name: 'awaited rename nested in a conditional',
          code: 'async function f(fs, xs) { for (const x of xs) { if (x) { await this.fs.rename(x, `${x}.bak`); } } }',
          errors: [{ messageId: 'awaitedMutationInLoop', data: { method: 'rename' } }],
        },
      ],
    });
  });
});
