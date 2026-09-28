import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noAccentHoverRule } from './no-accent-hover.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-accent-hover', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-accent-hover', noAccentHoverRule, {
      valid: [
        { name: 'neutral hover', code: "const className = 'hover:bg-accent hover:text-foreground';" },
        { name: 'primary at rest', code: "const className = 'bg-primary text-primary-foreground';" },
        { name: 'token that starts with primary', code: "const className = 'hover:bg-primary-foreground';" },
        { name: 'focus accent', code: "const className = 'focus-visible:border-primary';" },
      ],
      invalid: [
        {
          name: 'accent text hover',
          code: "const className = 'text-muted-foreground hover:text-primary';",
          errors: [{ messageId: 'violation', data: { found: 'hover:text-primary' } }],
        },
        {
          name: 'accent border hover with opacity',
          code: "<Card className='hover:border-primary/40' />",
          errors: [{ messageId: 'violation', data: { found: 'hover:border-primary/40' } }],
        },
        {
          name: 'group hover',
          code: 'const className = `group-hover:bg-primary/10`;',
          errors: [{ messageId: 'violation' }],
        },
      ],
    });
  });
});
