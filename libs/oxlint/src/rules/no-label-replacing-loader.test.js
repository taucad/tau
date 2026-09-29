import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noLabelReplacingLoaderRule } from './no-label-replacing-loader.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-label-replacing-loader', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-label-replacing-loader', noLabelReplacingLoaderRule, {
      valid: [
        { name: 'label kept beside the loader', code: '<Button aria-busy={p}>{p ? <Loader /> : null}Save</Button>' },
        {
          name: 'icon swap keeps the aria-label',
          code: "<Button aria-label='Open'>{p ? <Loader /> : <ArrowRight />}</Button>",
        },
        { name: 'named loader', code: "<Button>{p ? <Spinner aria-label='Saving' /> : 'Save'}</Button>" },
        { name: 'text swap without a loader', code: "<Button>{p ? 'Saving…' : 'Save'}</Button>" },
        { name: 'not a control', code: "<p>{p ? <Loader /> : 'Ready'}</p>" },
      ],
      invalid: [
        {
          name: 'string label replaced',
          code: "<Button>{isPending ? <Loader /> : 'Build from code'}</Button>",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'reversed branches',
          code: "<Button>{isIdle ? 'Save' : <Loader2 className='animate-spin' />}</Button>",
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'element label replaced',
          code: '<Button>{p ? <LoaderCircle /> : <span>Save</span>}</Button>',
          errors: [{ messageId: 'violation' }],
        },
        {
          name: 'render-prop child of a link',
          code: "<NavLink to='/auth'>{({ isPending }) => (isPending ? <Loader /> : 'Sign in')}</NavLink>",
          errors: [{ messageId: 'violation' }],
        },
      ],
    });
  });
});
