import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noRawHeadingTypeRule } from './no-raw-heading-type.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const route = '/repo/apps/ui/app/routes/usage/route.tsx';

describe('no-raw-heading-type', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-raw-heading-type', noRawHeadingTypeRule, {
      valid: [
        {
          name: 'heading from the scale',
          code: "<Heading level={2} variant='label'>Materials</Heading>",
          filename: route,
        },
        {
          name: 'layout, colour and wrapping on a heading',
          code: "<Heading level={2} variant='item' className={cn('mb-3 line-clamp-2 text-balance text-muted-foreground', isWide && 'text-center')} />",
          filename: route,
        },
        { name: 'unstyled raw heading', code: '<h2>Recent</h2>', filename: route },
        { name: 'screen-reader title', code: "<h1 className='sr-only'>Sign in</h1>", filename: route },
        {
          name: 'card title variant',
          code: "<CardTitle level={2} variant='label' className='truncate' />",
          filename: route,
        },
        {
          name: 'type utilities on other elements',
          code: "<p className='text-sm font-medium leading-none'>Total</p>",
          filename: route,
        },
        { name: 'class held in a constant', code: '<DrawerTitle className={drawerBarTitleClass} />', filename: route },
        { name: 'PageHeader title', code: "<PageHeader title='Projects' className='mb-0' />", filename: route },
        {
          name: 'PageHeader owns the page variant',
          code: "<Heading level={1} variant='page'>{title}</Heading>",
          filename: '/repo/apps/ui/app/components/layout/page-header.tsx',
        },
        {
          name: 'start surface owns the display variant',
          code: "<Heading level={1} variant='display' className='mx-auto max-w-[16ch]' />",
          filename: '/repo/apps/ui/app/routes/_index/homepage-chat-hero.tsx',
        },
        {
          name: 'the scale itself',
          code: "<h2 className='text-sm font-semibold' />",
          filename: '/repo/packages/ui/src/components/panel-empty-state.tsx',
        },
        {
          name: 'markdown content',
          code: "<h3 className='text-lg font-semibold' />",
          filename: '/repo/apps/ui/app/components/markdown/markdown-viewer-chat.tsx',
        },
        {
          name: 'loader showcase',
          code: "<h1 className='text-5xl font-bold' />",
          filename: '/repo/apps/ui/app/routes/loader_.glass/route.tsx',
        },
      ],
      invalid: [
        {
          name: 'hand-styled raw heading',
          code: "<h2 className='mb-3 text-sm font-medium'>Your plan</h2>",
          filename: route,
          errors: [
            { messageId: 'raw', data: { found: 'text-sm', name: 'h2' }, suggestions: [] },
            { messageId: 'raw', data: { found: 'font-medium', name: 'h2' }, suggestions: [] },
          ],
        },
        {
          name: 'responsive size through cn on a raw page title',
          code: "<h1 className={cn('truncate', isWide && 'md:text-2xl')}>Plugins</h1>",
          filename: route,
          errors: [{ messageId: 'raw', data: { found: 'md:text-2xl', name: 'h1' }, suggestions: [] }],
        },
        {
          name: 'size override on Heading',
          code: "<Heading level={2} variant='item' className='line-clamp-2 text-xl' />",
          filename: route,
          errors: [
            {
              messageId: 'override',
              data: { found: 'text-xl', name: 'Heading' },
              suggestions: [
                {
                  messageId: 'remove',
                  data: { found: 'text-xl' },
                  output: "<Heading level={2} variant='item' className='line-clamp-2 ' />",
                },
              ],
            },
          ],
        },
        {
          name: 'weight, line height and tracking on title slots',
          code: "<><CardTitle className='font-bold' /><DialogTitle className='leading-tight tracking-[-0.01em]' /></>",
          filename: route,
          errors: [
            {
              messageId: 'override',
              data: { found: 'font-bold', name: 'CardTitle' },
              suggestions: [
                {
                  messageId: 'remove',
                  output: "<><CardTitle className='' /><DialogTitle className='leading-tight tracking-[-0.01em]' /></>",
                },
              ],
            },
            {
              messageId: 'override',
              data: { found: 'leading-tight', name: 'DialogTitle' },
              suggestions: [
                {
                  messageId: 'remove',
                  output: "<><CardTitle className='font-bold' /><DialogTitle className='tracking-[-0.01em]' /></>",
                },
              ],
            },
            {
              messageId: 'override',
              data: { found: 'tracking-[-0.01em]', name: 'DialogTitle' },
              suggestions: [
                {
                  messageId: 'remove',
                  output: "<><CardTitle className='font-bold' /><DialogTitle className='leading-tight ' /></>",
                },
              ],
            },
          ],
        },
        {
          name: 'responsive prefix leaves with its utility',
          code: "<SectionHeader level={2} title='Recent' className='mb-0 md:text-3xl' />",
          filename: route,
          errors: [
            {
              messageId: 'override',
              data: { found: 'md:text-3xl', name: 'SectionHeader' },
              suggestions: [
                { messageId: 'remove', output: "<SectionHeader level={2} title='Recent' className='mb-0 ' />" },
              ],
            },
          ],
        },
        {
          name: 'page variant outside PageHeader',
          code: "<Heading level={1} variant='page'>Usage</Heading>",
          filename: route,
          errors: [{ messageId: 'reserved', data: { variant: 'page', instead: '`PageHeader`' } }],
        },
        {
          name: 'display variant outside the start surface',
          code: "<Heading level={1} variant='display'>Usage</Heading>",
          filename: route,
          errors: [
            { messageId: 'reserved', data: { variant: 'display', instead: 'the `page` title through `PageHeader`' } },
          ],
        },
      ],
    });
  });
});
