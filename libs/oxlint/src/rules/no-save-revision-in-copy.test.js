import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noSaveRevisionInCopyRule } from './no-save-revision-in-copy.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const vocabulary = 'apps/ui/app/routes/w.$workspace.$project/revision-vocabulary.ts';
const failureCopy = 'apps/libs/ui-core/src/lib/revision-failure-copy.ts';
const component = 'apps/ui/app/routes/w.$workspace.$project/chat-revisions.tsx';

describe('no-save-revision-in-copy', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-save-revision-in-copy', noSaveRevisionInCopyRule, {
      valid: [
        { name: 'History in JSX text', code: 'const a = <p>No history yet</p>;', filename: component },
        { name: 'a version number', code: 'const a = <span>V3 · Ready for print</span>;', filename: component },
        {
          name: 'an engine identifier is not copy',
          code: 'const a = <Row revision={revision} />;',
          filename: component,
        },
        { name: 'a data slot is not read', code: "const a = <div data-slot='revision-card' />;", filename: component },
        {
          name: 'a class name is not read',
          code: "const a = <div className='group/revision' />;",
          filename: component,
        },
        { name: 'review is not revision', code: "toast.info('Review the changes');", filename: component },
        { name: 'Revert is not Rev and a digit', code: "toast.info('Revert 2 files');", filename: component },
        { name: 'a dynamic toast message', code: 'toast.error(message);', filename: component },
        { name: 'a string outside copy', code: "const kind = 'revision';", filename: component },
        {
          name: 'an import source in a copy module',
          code: "import { x } from '@taucad/revisions';",
          filename: vocabulary,
        },
        {
          name: 'an object key in a copy module',
          code: "const copy = { 'revision-a': 'Saved' };",
          filename: failureCopy,
        },
        {
          name: 'a console diagnostic in a copy module',
          code: "console.error('[revisions]', error);",
          filename: vocabulary,
        },
        { name: 'a code constant in a copy module', code: "const code = 'UNKNOWN_REVISION';", filename: failureCopy },
        {
          name: 'the proposed copy',
          code: "const s = 'That point in history is not in this project any more.';",
          filename: failureCopy,
        },
      ],
      invalid: [
        {
          name: 'revision in JSX text',
          code: 'const a = <p>No revisions yet</p>;',
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'revisions' } }],
        },
        {
          name: 'Rev and a digit in a JSX child expression',
          code: "const a = <span>{'Rev 3'}</span>;",
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'Rev 3' } }],
        },
        {
          name: 'revision in an accessible name',
          code: "const a = <ol aria-label='Revision history' />;",
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'Revision' } }],
        },
        {
          name: 'Rev and a digit in a conditional attribute',
          code: "const a = <Button title={busy ? 'Saving…' : 'Restore Rev 2'} />;",
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'Rev 2' } }],
        },
        {
          name: 'Rev and a digit in a toast',
          code: "toast.success('Restored Rev 3');",
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'Rev 3' } }],
        },
        {
          name: 'revision in a toast description',
          code: "toast.error('Couldn’t save', { description: 'The revision was not saved.' });",
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'revision' } }],
        },
        {
          name: 'revision in a toast action label',
          code: "toast.success('Restored', { action: { label: 'Undo revision', onClick } });",
          filename: component,
          errors: [{ messageId: 'violation', data: { word: 'revision' } }],
        },
        {
          name: 'a planted string in the vocabulary module',
          code: "export const arrived = 'A new revision arrived';",
          filename: vocabulary,
          errors: [{ messageId: 'violation', data: { word: 'revision' } }],
        },
        {
          name: 'a planted number in the vocabulary module',
          code: 'export const name = (n) => `Rev ${n}`;',
          filename: vocabulary,
          errors: [{ messageId: 'violation', data: { word: 'Rev 0' } }],
        },
        {
          name: 'a planted string in the failure copy module',
          code: "const copy = { title: 'Tau could not restore that revision.' };",
          filename: failureCopy,
          errors: [{ messageId: 'violation', data: { word: 'revision' } }],
        },
      ],
    });
  });
});
