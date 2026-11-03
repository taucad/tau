import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noRaisedOverlayLayerRule } from './no-raised-overlay-layer.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-raised-overlay-layer', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-raised-overlay-layer', noRaisedOverlayLayerRule, {
      valid: [
        { name: 'the shared overlay layer', code: "<div className='fixed z-50' />" },
        { name: 'page layers below it', code: "<div className={cn('z-10', isOpen && 'z-40')} />" },
        { name: 'arbitrary value at the layer', code: "const layer = 'z-[50]';" },
        { name: 'negative layer', code: "<div className='-z-10' />" },
        { name: 'css variable layer', code: "<div className='z-(--layer)' />" },
        { name: 'not a utility', code: "const label = 'size-100 maze-100 z-index';" },
        { name: 'number, not a class', code: 'const zIndex = 100;' },
      ],
      invalid: [
        {
          name: 'raised sheet',
          code: "<SheetContent className='z-100 w-72' />",
          errors: [{ messageId: 'violation', data: { found: 'z-100' } }],
        },
        {
          name: 'conditional raise through cn',
          code: "<TooltipContent className={cn(isMobile && 'z-110')} />",
          errors: [{ messageId: 'violation', data: { found: 'z-110' } }],
        },
        {
          name: 'arbitrary value, variant and important markers',
          code: 'const classes = `md:z-[60] !z-101 z-102!`;',
          errors: [
            { messageId: 'violation', data: { found: 'z-[60]' } },
            { messageId: 'violation', data: { found: '!z-101' } },
            { messageId: 'violation', data: { found: 'z-102!' } },
          ],
        },
      ],
    });
  });
});
