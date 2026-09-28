import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noAsciiEllipsisRule } from './no-ascii-ellipsis.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-ascii-ellipsis', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-ascii-ellipsis', noAsciiEllipsisRule, {
      valid: [
        { name: 'ellipsis character', code: "<Input placeholder='Search…' />" },
        { name: 'spread props', code: '<Button {...properties} />' },
        { name: 'relative path', code: "import { a } from '../../a.js';" },
        { name: 'git range', code: "const range = 'main...HEAD';" },
        { name: 'bare dots', code: "const dots = '...';" },
        { name: 'dots mid-word', code: "const version = 'v1...2';" },
      ],
      invalid: [
        {
          name: 'attribute literal',
          code: "<Input placeholder='Search...' />",
          output: "<Input placeholder='Search…' />",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'JSX text',
          code: '<span>Loading project...</span>',
          output: '<span>Loading project…</span>',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'conditional branch',
          code: "const label = isSaving ? 'Saving...' : 'Save';",
          output: "const label = isSaving ? 'Saving…' : 'Save';",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'template tail',
          code: 'const label = `Search ${name} models...`;',
          output: 'const label = `Search ${name} models…`;',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'template before an expression',
          code: 'const label = `Reconnecting... ${attempt}`;',
          output: 'const label = `Reconnecting… ${attempt}`;',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'every occurrence in one string',
          code: "const label = 'Reading... then writing...';",
          output: "const label = 'Reading… then writing…';",
          errors: [{ messageId: 'violation' }],
        },
      ],
    });
  });
});
