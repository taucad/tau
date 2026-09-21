import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noEngineeringVocabularyInCopyRule } from './no-engineering-vocabulary-in-copy.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

describe('no-engineering-vocabulary-in-copy', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-engineering-vocabulary-in-copy', noEngineeringVocabularyInCopyRule, {
      valid: [
        { name: 'product vocabulary', code: "toast.error('Could not restore the revision');" },
        { name: 'reference is not ref', code: "toast.error('The referenced file is missing');" },
        { name: 'refresh is not ref', code: "toast.info('Refresh to try again');" },
        { name: 'lowercase head in prose', code: "toast.info('Jump to the head of the list');" },
        { name: 'non-toast call', code: "console.error('checkout');" },
        { name: 'dynamic message', code: 'toast.error(message);' },
        { name: 'bare toast with a dynamic message', code: 'toast(message);' },
        { name: 'dynamic description', code: "toast.error('Could not switch', { description: reason });" },
        {
          name: 'suppressed line',
          code: [
            '// eslint-disable-next-line rule-to-test/no-engineering-vocabulary-in-copy -- developer-facing debug toast',
            "toast.error('checkout debug');",
          ].join('\n'),
        },
      ],
      invalid: [
        {
          name: 'banned noun in a toast argument',
          code: "toast.error('Could not move the checkout');",
          errors: [{ messageId: 'violation', data: { word: 'checkout' } }],
        },
        {
          name: 'banned noun in a bare toast argument',
          code: "toast('Could not move the checkout');",
          errors: [{ messageId: 'violation', data: { word: 'checkout' } }],
        },
        {
          name: 'banned verb in a template literal',
          code: `toast.error(\`Could not lease \${name}\`);`,
          errors: [{ messageId: 'violation', data: { word: 'lease' } }],
        },
        {
          name: 'banned noun in a description option',
          code: "toast.error('Title', { description: 'The backend refused' });",
          errors: [{ messageId: 'violation', data: { word: 'backend' } }],
        },
        {
          name: 'banned noun in a title option',
          code: "toast.success('Done', { title: 'Worktrees updated' });",
          errors: [{ messageId: 'violation', data: { word: 'Worktrees' } }],
        },
        {
          name: 'uppercase HEAD',
          code: "toast.warning('HEAD moved');",
          errors: [{ messageId: 'violation', data: { word: 'HEAD' } }],
        },
        {
          name: 'plural refs',
          code: "toast.info('Two refs are behind');",
          errors: [{ messageId: 'violation', data: { word: 'refs' } }],
        },
      ],
    });
  });
});
