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
        { name: 'product vocabulary', code: "toast.error('Couldn’t restore');" },
        { name: 'reference is not ref', code: "toast.error('The referenced file is missing');" },
        { name: 'refresh is not ref', code: "toast.info('Refresh to try again');" },
        { name: 'headline is not head', code: "toast.info('Read the headline');" },
        { name: 'Git host is the product phrase', code: "toast.error('Your Git host refused access');" },
        { name: 'online is not line', code: "toast.info('Back online');" },
        { name: 'non-toast call', code: "console.error('checkout');" },
        { name: 'the decision phrase', code: "toast.warning('Needs your decision on main');" },
        { name: 'Tau agent is a product word', code: "toast.info('Tau agent saved this');" },
        { name: 'a restore row', code: "toast.success('Restored “Add vent slots”');" },
        { name: 'opens is not ops', code: "toast.info('Opens in History');" },
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
          name: 'head in any case (C8)',
          code: "toast.info('Moved the head of main');",
          errors: [{ messageId: 'violation', data: { word: 'head' } }],
        },
        {
          name: 'remote (C8)',
          code: "toast.error('Could not reach the remote');",
          errors: [{ messageId: 'violation', data: { word: 'remote' } }],
        },
        {
          name: 'line (C8)',
          code: "toast.info('2 files changed on both lines');",
          errors: [{ messageId: 'violation', data: { word: 'lines' } }],
        },
        {
          name: 'linked (C8)',
          code: "toast.info('This branch is linked');",
          errors: [{ messageId: 'violation', data: { word: 'linked' } }],
        },
        {
          name: 'host without Git (C8)',
          code: "toast.error('Tau could not reach the host');",
          errors: [{ messageId: 'violation', data: { word: 'host' } }],
        },
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
        ...[
          ['detached', 'You are on a detached revision', 'detached'],
          ['Return to latest', 'Return to latest to keep working', 'Return to latest'],
          ['Viewing Rev N', 'Viewing Rev 3', 'Viewing Rev 3'],
          ['viewing an older revision', 'You are viewing an older revision', 'viewing an older revision'],
          ['Needs resolution', 'Needs resolution', 'Needs resolution'],
          ['Changes need review', 'Changes need review', 'Changes need review'],
          ['a raw conflict line', 'Merged into conflicts/main-1', 'conflicts/main-1'],
          ['a raw sync line', 'Pulled sync/origin', 'sync/origin'],
          ['a raw account id', 'Saved by user_2abc', 'user_2abc'],
          ['a raw pseudonym', 'Saved by anon:4f2a', 'anon:'],
          ['a bare agent actor', 'agent', 'agent'],
          ['op-log ops', '3 ops not applied', 'ops'],
        ].map(([name, copy, word]) => ({
          name,
          code: `toast.warning(${JSON.stringify(copy)});`,
          errors: [{ messageId: 'violation', data: { word } }],
        })),
        {
          name: 'plural refs',
          code: "toast.info('Two refs are behind');",
          errors: [{ messageId: 'violation', data: { word: 'refs' } }],
        },
      ],
    });
  });
});
