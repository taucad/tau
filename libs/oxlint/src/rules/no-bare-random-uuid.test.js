import path from 'node:path';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noBareRandomUuidRule } from './no-bare-random-uuid.js';

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
const helperFile = path.join(root, 'libs/utils/src/id.utils.ts');
const testFile = path.join(root, 'libs/filesystem/src/backend/direct-idb-provider.test.ts');
const browserFile = path.join(root, 'packages/runtime/src/framework/runtime-worker-client.ts');

describe('no-bare-random-uuid', () => {
  it('flags Web Crypto randomUUID outside the helper; allows node:crypto, the helper, and tests', () => {
    ruleTester.run('no-bare-random-uuid', noBareRandomUuidRule, {
      valid: [
        {
          name: 'the helper itself may call the native API',
          code: 'export const randomUuid = () => globalThis.crypto.randomUUID();',
          filename: helperFile,
        },
        {
          name: 'tests may use it (they run on localhost / Node)',
          code: 'const id = crypto.randomUUID();',
          filename: testFile,
        },
        {
          name: 'node:crypto named import is a bare identifier call, not a member',
          code: "import { randomUUID } from 'node:crypto'; const id = randomUUID();",
          filename: browserFile,
        },
        {
          name: 'calling the helper is the replacement',
          code: "import { randomUuid } from '@taucad/utils/id'; const id = randomUuid();",
          filename: browserFile,
        },
        {
          name: 'getRandomValues is not gated',
          code: 'crypto.getRandomValues(new Uint8Array(16));',
          filename: browserFile,
        },
      ],
      invalid: [
        {
          name: 'bare crypto.randomUUID()',
          code: 'const id = crypto.randomUUID();',
          filename: browserFile,
          errors: [{ messageId: 'noBareRandomUuid' }],
        },
        {
          name: 'globalThis.crypto.randomUUID()',
          code: 'const id = globalThis.crypto.randomUUID();',
          filename: browserFile,
          errors: [{ messageId: 'noBareRandomUuid' }],
        },
        {
          name: 'feature-detected access still counts (use the helper)',
          code: "if (typeof self.crypto.randomUUID === 'function') { id = self.crypto.randomUUID(); }",
          filename: browserFile,
          errors: [{ messageId: 'noBareRandomUuid' }, { messageId: 'noBareRandomUuid' }],
        },
      ],
    });
  });
});
