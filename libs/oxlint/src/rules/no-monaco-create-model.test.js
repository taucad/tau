import path from 'node:path';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noMonacoCreateModelRule } from './no-monaco-create-model.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

const root = process.cwd();
const allowlistedModelService = path.join(root, 'apps/ui/app/lib/monaco-model-service.ts');
const allowlistedRegistry = path.join(root, 'apps/ui/app/lib/monaco-language-registry.ts');
const allowlistedWorkspaceFs = path.join(root, 'apps/ui/app/lib/monaco-workspace-fs/monaco-workspace-fs.ts');
const allowlistedTest = path.join(root, 'apps/ui/app/lib/example.test.ts');
const offendingFile = path.join(root, 'apps/ui/app/lib/contrib/offending.ts');

describe('no-monaco-create-model', () => {
  it('flags direct createModel outside allowlist; allows allowlisted paths and .editor.createModel form', () => {
    ruleTester.run('no-monaco-create-model', noMonacoCreateModelRule, {
      valid: [
        {
          name: 'allowlisted monaco-model-service',
          code: 'monaco.editor.createModel("", "typescript");',
          filename: allowlistedModelService,
        },
        {
          name: 'allowlisted monaco-language-registry',
          code: 'monaco.editor.createModel("", id);',
          filename: allowlistedRegistry,
        },
        {
          name: 'allowlisted monaco-workspace-fs subtree',
          code: 'this.monacoRef.editor.createModel(text, languageId, uri);',
          filename: allowlistedWorkspaceFs,
        },
        {
          name: 'allowlisted test file by suffix',
          code: 'monaco.editor.createModel("", "plaintext");',
          filename: allowlistedTest,
        },
        {
          name: 'extended allowlist option',
          code: 'monaco.editor.createModel("", "plaintext");',
          filename: offendingFile,
          options: [{ allowlist: ['apps/ui/app/lib/contrib/**'] }],
        },
        {
          name: 'unrelated call',
          code: 'editor.setModel(m);',
          filename: offendingFile,
        },
      ],
      invalid: [
        {
          name: 'flags createModel in contribution code',
          code: 'monaco.editor.createModel("", "plaintext");',
          filename: offendingFile,
          errors: [{ messageId: 'noDirectCreateModel' }],
        },
        {
          name: 'flags aliased .editor.createModel',
          code: 'm.editor.createModel("", "typescript", u);',
          filename: offendingFile,
          errors: [{ messageId: 'noDirectCreateModel' }],
        },
      ],
    });
  });
});
