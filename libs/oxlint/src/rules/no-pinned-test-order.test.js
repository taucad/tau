import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noPinnedTestOrderRule } from './no-pinned-test-order.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

describe('no-pinned-test-order', () => {
  it('should flag shuffle: false in Vitest options and allow every other option and shape', () => {
    ruleTester.run('no-pinned-test-order', noPinnedTestOrderRule, {
      valid: [
        {
          name: 'a suite with no options',
          code: "describe('store', () => { it('should save', () => {}); });",
        },
        {
          name: 'other options on a suite and a test',
          code: "describe('store', { timeout: 10_000 }, () => { it('should save', { retry: 0 }, () => {}); });",
        },
        {
          name: 'a suite that asks for shuffle',
          code: "describe('store', { shuffle: true }, () => {});",
        },
        {
          name: 'a shuffle value that is not the literal false',
          code: "describe('store', { shuffle: isCi }, () => {});",
        },
        {
          name: 'a computed key that happens to be named shuffle',
          code: "describe('store', { [shuffle]: false }, () => {});",
        },
        {
          name: 'a table row with a shuffle field is data, not options',
          code: "it.each([{ shuffle: false, expected: 1 }])('should play $expected', ({ shuffle }) => {});",
        },
        {
          name: 'a product call that is not a Vitest API',
          code: "createPlaylist('queue', { shuffle: false });",
        },
        {
          name: 'a product method that shares a Vitest name',
          code: "runner.describe('queue', { shuffle: false });",
        },
        {
          name: 'a nested object inside the options',
          code: "describe('store', { meta: { shuffle: false } }, () => {});",
        },
      ],
      invalid: [
        {
          name: 'the options of describe',
          code: "describe('store', { shuffle: false }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'a string key',
          code: "describe('store', { 'shuffle': false }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'the incident shape: a conditional suite',
          code: 'describe.runIf(adapter.enabled)(adapter.name, { shuffle: false }, () => {});',
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'a parameterized suite',
          code: "describe.each(adapters)('$name', { shuffle: false, timeout: 60_000 }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'a tagged-template table',
          code: "describe.each`name`('$name', { shuffle: false }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'a chained modifier',
          code: "describe.sequential('store', { shuffle: false }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'the suite alias',
          code: "suite('store', { shuffle: false }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'suite' } }],
        },
        {
          name: 'options spread from a shared object',
          code: "describe('store', { ...slow, shuffle: false }, () => {});",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
        {
          name: 'the options of it and of test',
          code: "it('should save', { shuffle: false }, () => {}); test('should load', { shuffle: false }, () => {});",
          errors: [
            { messageId: 'violation', data: { api: 'it' } },
            { messageId: 'violation', data: { api: 'test' } },
          ],
        },
        {
          name: 'options after the body',
          code: "describe('store', () => {}, { shuffle: false });",
          errors: [{ messageId: 'violation', data: { api: 'describe' } }],
        },
      ],
    });
  });
});
