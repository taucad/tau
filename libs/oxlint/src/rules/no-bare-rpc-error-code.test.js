import path from 'node:path';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noBareRpcErrorCodeRule } from './no-bare-rpc-error-code.js';

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
const rpcHandlerFile = path.join(root, 'libs/chat/src/rpc/handlers/handle-run-geospec-tests.ts');
const rpcSchemaFile = path.join(root, 'libs/chat/src/schemas/rpc.schema.ts');
const apiToolErrorFile = path.join(root, 'apps/api/app/api/chat/middleware/tool-error-handler.middleware.ts');
const testFile = path.join(root, 'libs/chat/src/rpc/handlers/handle-read-file.test.ts');

describe('no-bare-rpc-error-code', () => {
  it('flags bare string literals in RPC client error payloads', () => {
    ruleTester.run('no-bare-rpc-error-code', noBareRpcErrorCodeRule, {
      valid: [
        {
          name: 'uses named rpcClientErrorCode constant',
          filename: rpcHandlerFile,
          code: `
            import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
            const result = { success: false, errorCode: rpcClientErrorCode.unknown, message: 'bad' };
          `,
        },
        {
          name: 'schema module owns literal enum declarations',
          filename: rpcSchemaFile,
          code: "const error = { success: false, errorCode: 'UNKNOWN', message: 'bad' };",
        },
        {
          name: 'test files may author literal fixtures',
          filename: testFile,
          code: "const error = { success: false, errorCode: 'UNKNOWN', message: 'bad' };",
        },
        {
          name: 'tool execution error domains are outside RPC client success union',
          filename: apiToolErrorFile,
          code: "const error = { errorCode: 'TOOL_EXECUTION_ERROR', message: 'bad' };",
        },
      ],
      invalid: [
        {
          name: 'bare literal on success false RPC payload',
          filename: rpcHandlerFile,
          code: "const result = { success: false, errorCode: 'UNKNOWN', message: 'bad' };",
          errors: [{ messageId: 'bareRpcErrorCode' }],
        },
      ],
    });
  });
});
