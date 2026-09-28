import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noArbitraryPixelSizeRule } from './no-arbitrary-pixel-size.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-arbitrary-pixel-size', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-arbitrary-pixel-size', noArbitraryPixelSizeRule, {
      valid: [
        { name: 'spacing utility', code: "const className = 'w-45 h-75';" },
        { name: 'hairline utility', code: "const className = 'w-px h-px';" },
        { name: 'character measure', code: "const className = 'max-w-[65ch]';" },
        { name: 'viewport and percent', code: "const className = 'h-[80vh] w-[50%]';" },
        { name: 'other arbitrary pixel utility', code: "const className = 'top-[3px] text-[13px]';" },
        { name: 'unrelated suffix', code: "const className = 'rounded-t-[12px]';" },
      ],
      invalid: [
        {
          name: 'fixed width',
          code: "const className = 'w-[180px] shrink-0';",
          output: "const className = 'w-45 shrink-0';",
          errors: [{ messageId: 'spacing', data: { found: 'w-[180px]', suggestion: 'w-45' } }],
        },
        {
          name: 'bounds and variants in JSX',
          code: "<div className='min-h-[200px] md:max-w-[220px] hover:size-[24px]' />",
          output: "<div className='min-h-50 md:max-w-55 hover:size-6' />",
          errors: [{ messageId: 'spacing' }, { messageId: 'spacing' }, { messageId: 'spacing' }],
        },
        {
          name: 'template class string',
          code: 'const className = `h-[300px] ${extra}`;',
          output: 'const className = `h-75 ${extra}`;',
          errors: [{ messageId: 'spacing' }],
        },
        {
          name: 'off-grid value is reported, not fixed',
          code: "const className = 'min-h-[82px] w-[3px]';",
          output: null,
          errors: [{ messageId: 'offGrid' }, { messageId: 'offGrid' }],
        },
      ],
    });
  });
});
