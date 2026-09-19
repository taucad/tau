import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noAuthoredPointerCursorRule } from './no-authored-pointer-cursor.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-authored-pointer-cursor', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-authored-pointer-cursor', noAuthoredPointerCursorRule, {
      valid: [
        { name: 'shared action utility', code: "const className = 'cursor-action hover:bg-accent';" },
        { name: 'semantic text cursor', code: "const className = 'cursor-text';" },
        { name: 'native hyperlink', code: '<a href="/projects">Projects</a>' },
        { name: 'unrelated pointer event', code: "element.addEventListener('pointerdown', handler);" },
        { name: 'ordinary pointer string', code: "const kind = 'pointer';" },
        { name: 'non-pointer cursor assignment', code: "element.style.cursor = 'auto';" },
        { name: 'non-pointer cursor call', code: "setCanvasCursor(element, 'auto');" },
      ],
      invalid: [
        {
          name: 'Tailwind pointer utility',
          code: "const className = 'rounded cursor-pointer';",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'variant pointer utility',
          code: "const className = 'hover:cursor-pointer!';",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'template pointer utility',
          code: 'const className = `group-hover:cursor-pointer`;',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'embedded CSS pointer declaration',
          code: 'const styles = `summary { cursor: pointer; }`;',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'style object pointer cursor',
          code: "const style = { cursor: 'pointer' };",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'style assignment pointer cursor',
          code: "element.style.cursor = 'pointer';",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'cursor helper pointer argument',
          code: "setCanvasCursor(element, 'pointer');",
          errors: [{ messageId: 'violation' }],
        },
      ],
    });
  });
});
