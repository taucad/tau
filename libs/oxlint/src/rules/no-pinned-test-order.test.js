import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noPinnedTestOrderRule } from './no-pinned-test-order.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const testFile = 'packages/revisions/src/revision-port.conformance.test.ts';
const configFile = 'packages/revisions/vitest.config.ts';

/**
 * One `pinnedSuite` error whose suggestion yields `output`.
 *
 * @param {string} output - The code after the suggestion is applied.
 * @returns {object[]} The expected errors.
 */
const pinnedSuite = (output) => [{ messageId: 'pinnedSuite', suggestions: [{ messageId: 'remove', output }] }];

describe('no-pinned-test-order', () => {
  it('flags a pinned suite or config and allows every other option', () => {
    ruleTester.run('no-pinned-test-order', noPinnedTestOrderRule, {
      valid: [
        { name: 'a suite with no options', filename: testFile, code: "describe('port', () => {});" },
        {
          name: 'a suite that asks to be shuffled',
          filename: testFile,
          code: "describe('port', { shuffle: true }, () => {});",
        },
        {
          name: 'other options',
          filename: testFile,
          code: "describe.runIf(isNode)('port', { timeout: 1000, retry: 0 }, () => {});",
        },
        {
          name: 'a shuffle value that is not the literal false',
          filename: testFile,
          code: "describe('port', { shuffle: isBurnIn }, () => {});",
        },
        {
          name: 'a computed key',
          filename: testFile,
          code: "describe('port', { [shuffle]: false }, () => {});",
        },
        {
          name: 'an each table row is data, not options',
          filename: testFile,
          code: "it.each([{ shuffle: false }])('case', (row) => {});",
        },
        {
          name: 'an object that is not in an options position',
          filename: testFile,
          code: "it('builds the deck', () => { deal({ shuffle: false }); });",
        },
        {
          name: 'a function that is not a Vitest test function',
          filename: testFile,
          code: "deal('deck', { shuffle: false }, () => {});",
        },
        {
          name: 'a config that shuffles',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: true, groupOrder: 1 } } });',
        },
        {
          name: 'a config sequence without shuffle',
          filename: configFile,
          code: 'export default defineProject({ test: { sequence: { groupOrder: 2 } } });',
        },
      ],
      invalid: [
        {
          name: 'options as the second argument',
          filename: testFile,
          code: "describe('port', { shuffle: false }, () => {});",
          errors: pinnedSuite("describe('port', () => {});"),
        },
        {
          name: 'options as the third argument',
          filename: testFile,
          code: "describe('port', () => {}, { shuffle: false });",
          errors: pinnedSuite("describe('port', () => {});"),
        },
        {
          name: 'a runIf chain',
          filename: testFile,
          code: "describe.runIf(hasGit)('port', { shuffle: false }, () => {});",
          errors: pinnedSuite("describe.runIf(hasGit)('port', () => {});"),
        },
        {
          name: 'a skipIf chain with a modifier',
          filename: testFile,
          code: "describe.skipIf(isCi).concurrent('port', { shuffle: false }, () => {});",
          errors: pinnedSuite("describe.skipIf(isCi).concurrent('port', () => {});"),
        },
        {
          name: 'an each chain',
          filename: testFile,
          code: "describe.each([1, 2])('port %i', { shuffle: false }, () => {});",
          errors: pinnedSuite("describe.each([1, 2])('port %i', () => {});"),
        },
        {
          name: 'an each tagged template',
          filename: testFile,
          code: "describe.each`\n  a\n  1\n`('port $a', { shuffle: false }, () => {});",
          errors: pinnedSuite("describe.each`\n  a\n  1\n`('port $a', () => {});"),
        },
        {
          name: 'only, sequential and suite',
          filename: testFile,
          code: "describe.only('a', { shuffle: false }, () => {}); describe.sequential('b', { shuffle: false }, () => {}); suite('c', { shuffle: false }, () => {});",
          errors: [
            {
              messageId: 'pinnedSuite',
              suggestions: [
                {
                  messageId: 'remove',
                  output:
                    "describe.only('a', () => {}); describe.sequential('b', { shuffle: false }, () => {}); suite('c', { shuffle: false }, () => {});",
                },
              ],
            },
            {
              messageId: 'pinnedSuite',
              suggestions: [
                {
                  messageId: 'remove',
                  output:
                    "describe.only('a', { shuffle: false }, () => {}); describe.sequential('b', () => {}); suite('c', { shuffle: false }, () => {});",
                },
              ],
            },
            {
              messageId: 'pinnedSuite',
              suggestions: [
                {
                  messageId: 'remove',
                  output:
                    "describe.only('a', { shuffle: false }, () => {}); describe.sequential('b', { shuffle: false }, () => {}); suite('c', () => {});",
                },
              ],
            },
          ],
        },
        {
          name: 'it and test',
          filename: testFile,
          code: "it('a', { shuffle: false }, () => {});",
          errors: pinnedSuite("it('a', () => {});"),
        },
        {
          name: 'a string key beside other options keeps the others',
          filename: testFile,
          code: "test('a', { timeout: 1000, 'shuffle': false, retry: 0 }, () => {});",
          errors: pinnedSuite("test('a', { timeout: 1000, retry: 0 }, () => {});"),
        },
        {
          name: 'the last of several options',
          filename: testFile,
          code: "describe('a', { timeout: 1000, shuffle: false }, () => {});",
          errors: pinnedSuite("describe('a', { timeout: 1000 }, () => {});"),
        },
        {
          name: 'a config that pins the sequence',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: false, groupOrder: 1 } } });',
          errors: [
            {
              messageId: 'pinnedConfig',
              suggestions: [
                {
                  messageId: 'remove',
                  output: 'export default defineConfig({ test: { sequence: { groupOrder: 1 } } });',
                },
              ],
            },
          ],
        },
        {
          name: 'a project entry that pins the sequence',
          filename: configFile,
          code: "export default defineConfig({ test: { projects: [{ test: { name: 'node', sequence: { shuffle: false } } }] } });",
          errors: [
            {
              messageId: 'pinnedConfig',
              suggestions: [
                {
                  messageId: 'remove',
                  output:
                    "export default defineConfig({ test: { projects: [{ test: { name: 'node', sequence: {  } } }] } });",
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
