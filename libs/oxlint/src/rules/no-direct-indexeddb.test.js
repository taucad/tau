import path from 'node:path';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noDirectIndexeddbRule } from './no-direct-indexeddb.js';

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
const objectStoreProvider = path.join(root, 'apps/ui/app/db/indexeddb-storage.ts');
const handleStore = path.join(root, 'apps/ui/app/filesystem/handle-store.ts');
const backendProvider = path.join(root, 'libs/filesystem/src/backend/direct-idb-provider.ts');
const testFile = path.join(root, 'apps/ui/app/db/indexeddb-storage.test.ts');
const offendingFile = path.join(root, 'apps/ui/app/components/settings/some-panel.tsx');

describe('no-direct-indexeddb', () => {
  it('flags direct indexedDB access outside the allowlist; allows providers, tests, and extensions', () => {
    ruleTester.run('no-direct-indexeddb', noDirectIndexeddbRule, {
      valid: [
        {
          name: 'object-store provider may open its database',
          code: "const request = indexedDB.open('tau-storage', 3);",
          filename: objectStoreProvider,
        },
        {
          name: 'handle store may open tau-fs-handles',
          code: 'const request = indexedDB.open(dbName, dbVersion);',
          filename: handleStore,
        },
        {
          name: 'filesystem backend directory is allowlisted as a subtree',
          code: 'const request = indexedDB.open(this._dbName, 2);',
          filename: backendProvider,
        },
        {
          name: 'test files may install fake-indexeddb',
          code: 'globalThis.indexedDB = new IDBFactory();',
          filename: testFile,
        },
        {
          name: 'rule-option allowlist extends the defaults',
          code: "indexedDB.deleteDatabase('legacy');",
          filename: offendingFile,
          options: [{ allowlist: ['apps/ui/app/components/settings/**'] }],
        },
        {
          name: 'feature detection via the in operator is not a factory reference',
          code: "const supported = 'indexedDB' in globalThis;",
          filename: offendingFile,
        },
        {
          name: 'typeof check on the bare global is not a factory reference',
          code: "if (typeof indexedDB !== 'undefined') { run(); }",
          filename: offendingFile,
        },
        {
          name: 'indexedDB property on a non-global receiver is unrelated',
          code: 'diagnostics.indexedDB.open();',
          filename: offendingFile,
        },
      ],
      invalid: [
        {
          name: 'flags indexedDB.open in app code',
          code: "const request = indexedDB.open('my-cache', 1);",
          filename: offendingFile,
          errors: [{ messageId: 'noDirectIndexeddb' }],
        },
        {
          name: 'flags indexedDB.databases enumeration',
          code: 'const dbs = await indexedDB.databases();',
          filename: offendingFile,
          errors: [{ messageId: 'noDirectIndexeddb' }],
        },
        {
          name: 'flags globalThis.indexedDB member access once',
          code: "globalThis.indexedDB.deleteDatabase('x');",
          filename: offendingFile,
          errors: [{ messageId: 'noDirectIndexeddb' }],
        },
        {
          name: 'flags window.indexedDB',
          code: "window.indexedDB.open('y', 1);",
          filename: offendingFile,
          errors: [{ messageId: 'noDirectIndexeddb' }],
        },
        {
          name: 'flags aliasing the factory from self',
          code: 'const factory = self.indexedDB;',
          filename: offendingFile,
          errors: [{ messageId: 'noDirectIndexeddb' }],
        },
      ],
    });
  });
});
