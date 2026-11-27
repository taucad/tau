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
const sourceFile = 'packages/revisions/src/deck.ts';

/**
 * One `pinnedSuite` error whose suggestion yields `output`.
 *
 * @param {string} output - The code after the suggestion is applied.
 * @returns {object[]} The expected errors.
 */
const pinnedSuite = (output) => [{ messageId: 'pinnedSuite', suggestions: [{ messageId: 'remove', output }] }];

/**
 * One `pinnedConfig` error whose suggestion yields `output`.
 *
 * @param {string} output - The code after the suggestion is applied.
 * @param {string} [option] - The pinned option the message names.
 * @returns {object[]} The expected errors.
 */
const pinnedConfig = (output, option = 'sequence.shuffle: false') => [
  { messageId: 'pinnedConfig', data: { option }, suggestions: [{ messageId: 'remove', output }] },
];

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
        {
          name: 'an unrelated object with a sequence key',
          filename: sourceFile,
          code: 'const payload = { sequence: { shuffle: false } };',
        },
        {
          name: 'an unrelated object under a test key outside a config',
          filename: sourceFile,
          code: 'const payload = { test: { sequence: { shuffle: false } } }; send(payload);',
        },
        {
          name: 'a sequence key in a config file that is not under a test key',
          filename: configFile,
          code: 'const deck = { sequence: { shuffle: false } }; export default defineConfig({ test: {} });',
        },
        {
          name: 'an argument of a function that is not a config function',
          filename: sourceFile,
          code: 'deal({ test: { sequence: { shuffle: false } } });',
        },
        {
          name: 'an object inside a plugin call of a config',
          filename: sourceFile,
          code: 'defineConfig({ plugins: [deal({ test: { sequence: { shuffle: false } } })] });',
        },
        {
          name: 'the object form that shuffles tests',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: { files: true, tests: true } } } });',
        },
        {
          name: 'the object form that pins file order only',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: { files: false } } } });',
        },
        {
          name: 'the object form in suite options, which Vitest reads as truthy',
          filename: testFile,
          code: "describe('port', { shuffle: { tests: false } }, () => {});",
        },
        {
          name: 'a local function named describe',
          filename: sourceFile,
          code: "function describe(name, options, run) {} describe('deck', { shuffle: false }, () => {});",
        },
        {
          name: 'a local variable named suite',
          filename: testFile,
          code: "const suite = load(); suite('deck', { shuffle: false }, () => {});",
        },
        {
          name: 'a parameter named it',
          filename: sourceFile,
          code: "const run = (it) => it('deck', { shuffle: false }, () => {});",
        },
        {
          name: 'describe imported from another module',
          filename: testFile,
          code: "import { describe } from 'geospec'; describe('part', { shuffle: false }, () => {});",
        },
        {
          name: 'a namespace import of another module',
          filename: testFile,
          code: "import * as deck from './deck.js'; deck.describe('part', { shuffle: false }, () => {});",
        },
        {
          name: 'a vitest import that is not a test function',
          filename: testFile,
          code: "import { vi as describe } from 'vitest'; describe('part', { shuffle: false }, () => {});",
        },
        {
          name: 'a vitest namespace member that is not a test function',
          filename: testFile,
          code: "import * as v from 'vitest'; v.expect('part', { shuffle: false }, () => {});",
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
          name: 'a trailing comma after the only option',
          filename: testFile,
          code: "describe('a', { shuffle: false, }, () => {});",
          errors: pinnedSuite("describe('a', () => {});"),
        },
        {
          name: 'the whole options argument on its own lines',
          filename: testFile,
          code: "describe(\n  'a',\n  {\n    shuffle: false,\n  },\n  () => {},\n);",
          errors: pinnedSuite("describe(\n  'a',\n  () => {},\n);"),
        },
        {
          name: 'a trailing options argument with a trailing comma',
          filename: testFile,
          code: "describe('a', () => {}, { shuffle: false },);",
          errors: pinnedSuite("describe('a', () => {},);"),
        },
        {
          name: 'the last of several options with a trailing comma',
          filename: testFile,
          code: "describe('a', { timeout: 1000, shuffle: false, }, () => {});",
          errors: pinnedSuite("describe('a', { timeout: 1000, }, () => {});"),
        },
        {
          name: 'an aliased vitest import',
          filename: testFile,
          code: "import { describe as context } from 'vitest'; context('a', { shuffle: false }, () => {});",
          errors: pinnedSuite("import { describe as context } from 'vitest'; context('a', () => {});"),
        },
        {
          name: 'a vitest namespace import',
          filename: testFile,
          code: "import * as v from 'vitest'; v.describe('a', { shuffle: false }, () => {});",
          errors: pinnedSuite("import * as v from 'vitest'; v.describe('a', () => {});"),
        },
        {
          name: 'a modifier chain on a vitest namespace import',
          filename: testFile,
          code: "import * as v from 'vitest'; v.describe.skipIf(isCi)('a', { shuffle: false }, () => {});",
          errors: pinnedSuite("import * as v from 'vitest'; v.describe.skipIf(isCi)('a', () => {});"),
        },
        {
          name: 'a named vitest import',
          filename: testFile,
          code: "import { describe } from 'vitest'; describe('a', { shuffle: false }, () => {});",
          errors: pinnedSuite("import { describe } from 'vitest'; describe('a', () => {});"),
        },
        {
          name: 'a test function extended from a vitest import',
          filename: testFile,
          code: "import { test as base } from 'vitest'; const it = base.extend({}); it('a', { shuffle: false }, () => {});",
          errors: pinnedSuite("import { test as base } from 'vitest'; const it = base.extend({}); it('a', () => {});"),
        },
        {
          name: 'a config that pins the sequence',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: false, groupOrder: 1 } } });',
          errors: pinnedConfig('export default defineConfig({ test: { sequence: { groupOrder: 1 } } });'),
        },
        {
          name: 'a project entry that pins the sequence',
          filename: configFile,
          code: "export default defineConfig({ test: { projects: [{ test: { name: 'node', sequence: { shuffle: false } } }] } });",
          errors: pinnedConfig(
            "export default defineConfig({ test: { projects: [{ test: { name: 'node', sequence: {} } }] } });",
          ),
        },
        {
          name: 'a trailing comma after the only sequence option',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: false, } } });',
          errors: pinnedConfig('export default defineConfig({ test: { sequence: {} } });'),
        },
        {
          name: 'the only sequence option on its own line',
          filename: configFile,
          code: 'export default defineConfig({\n  test: {\n    sequence: {\n      shuffle: false,\n    },\n  },\n});',
          errors: pinnedConfig('export default defineConfig({\n  test: {\n    sequence: {},\n  },\n});'),
        },
        {
          name: 'the last sequence option with a trailing comma',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { groupOrder: 1, shuffle: false, } } });',
          errors: pinnedConfig('export default defineConfig({ test: { sequence: { groupOrder: 1, } } });'),
        },
        {
          name: 'a config function outside a config file',
          filename: sourceFile,
          code: 'export const shared = defineProject({ test: { sequence: { shuffle: false } } });',
          errors: pinnedConfig('export const shared = defineProject({ test: { sequence: {} } });'),
        },
        {
          name: 'a config returned from an arrow function',
          filename: sourceFile,
          code: 'export const shared = defineConfig(() => ({ test: { sequence: { shuffle: false } } }));',
          errors: pinnedConfig('export const shared = defineConfig(() => ({ test: { sequence: {} } }));'),
        },
        {
          name: 'a config returned from a function body',
          filename: sourceFile,
          code: 'export const shared = defineConfig(async function ({ mode }) { if (mode) { return { test: { sequence: { shuffle: false } } }; } return {}; });',
          errors: pinnedConfig(
            'export const shared = defineConfig(async function ({ mode }) { if (mode) { return { test: { sequence: {} } }; } return {}; });',
          ),
        },
        {
          name: 'an override passed to mergeConfig',
          filename: sourceFile,
          code: 'export const shared = mergeConfig(base, { test: { sequence: { shuffle: false } } });',
          errors: pinnedConfig('export const shared = mergeConfig(base, { test: { sequence: {} } });'),
        },
        {
          name: 'a workspace entry',
          filename: sourceFile,
          code: 'export const shared = defineWorkspace([{ test: { sequence: { shuffle: false } } }]);',
          errors: pinnedConfig('export const shared = defineWorkspace([{ test: { sequence: {} } }]);'),
        },
        {
          name: 'a nested project entry outside a config file',
          filename: sourceFile,
          code: 'export const shared = defineConfig({ test: { projects: [{ test: { sequence: { shuffle: false } } }] } });',
          errors: pinnedConfig(
            'export const shared = defineConfig({ test: { projects: [{ test: { sequence: {} } }] } });',
          ),
        },
        {
          name: 'the default export object of a vitest config file',
          filename: 'packages/revisions/vitest.staging.config.mts',
          code: 'export default { test: { sequence: { shuffle: false } } } satisfies UserConfig;',
          errors: pinnedConfig('export default { test: { sequence: {} } } satisfies UserConfig;'),
        },
        {
          name: 'the default export of a workspace file',
          filename: 'vitest.workspace.ts',
          code: 'export default [{ test: { sequence: { shuffle: false } } }];',
          errors: pinnedConfig('export default [{ test: { sequence: {} } }];'),
        },
        {
          name: 'a vite config file',
          filename: 'apps/ui/vite.config.ts',
          code: 'export default { test: { sequence: { shuffle: false } } };',
          errors: pinnedConfig('export default { test: { sequence: {} } };'),
        },
        {
          name: 'the object form that pins tests beside files',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: { files: true, tests: false } } } });',
          errors: pinnedConfig(
            'export default defineConfig({ test: { sequence: { shuffle: { files: true } } } });',
            'sequence.shuffle.tests: false',
          ),
        },
        {
          name: 'the object form that pins tests alone loses the shuffle option',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: { tests: false, }, groupOrder: 1 } } });',
          errors: pinnedConfig(
            'export default defineConfig({ test: { sequence: { groupOrder: 1 } } });',
            'sequence.shuffle.tests: false',
          ),
        },
        {
          name: 'the object form as the only sequence option',
          filename: configFile,
          code: 'export default defineConfig({ test: { sequence: { shuffle: { tests: false } } } });',
          errors: pinnedConfig(
            'export default defineConfig({ test: { sequence: {} } });',
            'sequence.shuffle.tests: false',
          ),
        },
      ],
    });
  });
});
