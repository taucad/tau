import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { requireAccessibleNameRule } from './require-accessible-name.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('require-accessible-name', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('require-accessible-name', requireAccessibleNameRule, {
      valid: [
        { name: 'labelled icon button', code: "<Button size='icon' aria-label='Close'><X /></Button>" },
        { name: 'labelledby icon button', code: "<Button size='icon-sm' aria-labelledby='title'><X /></Button>" },
        { name: 'titled icon button', code: "<Button size='icon' title='Close'><X /></Button>" },
        { name: 'sr-only child', code: "<Button size='icon'><X /><span className='sr-only'>Close</span></Button>" },
        { name: 'visible text child', code: "<Button size='icon'>Go</Button>" },
        { name: 'expression child is unknown', code: "<Button size='icon'>{label}</Button>" },
        { name: 'asChild delegates the name', code: "<Button size='icon' asChild><a href='/x'>X</a></Button>" },
        { name: 'spread may carry the name', code: "<Button size='icon' {...properties}><X /></Button>" },
        { name: 'text-size button', code: "<Button size='sm'><X /></Button>" },
        { name: 'labelled search input', code: "<SearchInput aria-label='Search examples' onClear={clear} />" },
        { name: 'search input with a label id', code: "<Input type='search' id='query' />" },
        { name: 'plain input', code: "<Input type='text' placeholder='Name' />" },
      ],
      invalid: [
        {
          name: 'icon-only button',
          code: "<Button size='icon'><X /></Button>",
          errors: [{ messageId: 'button' }],
        },
        {
          name: 'icon button in a tooltip',
          code: "<Tooltip><Button size='icon-xs' variant='ghost'><Eye aria-hidden /></Button></Tooltip>",
          errors: [{ messageId: 'button' }],
        },
        {
          name: 'placeholder-only search input',
          code: "<SearchInput placeholder='Search…' onClear={clear} />",
          errors: [{ messageId: 'input' }],
        },
        {
          name: 'search type input',
          code: "<Input type='search' placeholder='Filter' />",
          errors: [{ messageId: 'input' }],
        },
      ],
    });
  });
});
