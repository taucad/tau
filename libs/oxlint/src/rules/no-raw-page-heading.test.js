import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noRawPageHeadingRule } from './no-raw-page-heading.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-raw-page-heading', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-raw-page-heading', noRawPageHeadingRule, {
      valid: [
        { name: 'PageHeader title', code: "<PageHeader title='Projects' />" },
        { name: 'unstyled h1', code: '<h1>Projects</h1>' },
        { name: 'screen-reader title', code: "<h1 className='sr-only'>Projects</h1>" },
        { name: 'section heading', code: "<h2 className='text-2xl'>Recent</h2>" },
        {
          name: 'PageHeader owns the recipe',
          code: "<h1 className='text-4xl font-medium'>{title}</h1>",
          filename: '/repo/apps/ui/app/components/layout/page-header.tsx',
        },
        {
          name: 'landing display hero',
          code: "<h1 className='text-5xl md:text-7xl'>Tau</h1>",
          filename: '/repo/apps/ui/app/routes/_index/hero-section.tsx',
        },
        {
          name: 'legal document title',
          code: "<h1 className='text-3xl'>Terms</h1>",
          filename: '/repo/apps/ui/app/routes/legal.terms/route.tsx',
        },
      ],
      invalid: [
        {
          name: 'hand-styled page title',
          code: "<h1 className='text-3xl font-semibold tracking-tight'>Usage</h1>",
          filename: '/repo/apps/ui/app/routes/usage/route.tsx',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'responsive title through cn',
          code: "<h1 className={cn('font-bold', 'md:text-2xl')}>Plugins</h1>",
          errors: [{ messageId: 'violation' }],
        },
      ],
    });
  });
});
