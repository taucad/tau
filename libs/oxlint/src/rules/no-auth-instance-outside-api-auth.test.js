import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noAuthInstanceOutsideApiAuthRule } from './no-auth-instance-outside-api-auth.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const provider = 'apps/api/app/api/kernels/kernels.gateway.ts';

describe('no-auth-instance-outside-api-auth', () => {
  it('reports the instance token and the testing subpath in production source outside api-auth', () => {
    ruleTester.run('no-auth-instance-outside-api-auth', noAuthInstanceOutsideApiAuthRule, {
      valid: [
        {
          name: 'the resolver from the package index',
          filename: provider,
          code: "import { SessionResolver } from '@taucad/api-auth';",
        },
        {
          name: 'api-auth itself',
          filename: 'apps/libs/api-auth/src/auth.module.ts',
          code: "export const authInstanceKey = 'authInstanceKey';",
        },
        {
          name: 'a test mounting the real module',
          filename: 'apps/libs/api-billing/src/billing-webhook.foundation.test.ts',
          code: "import { authInstanceKey } from '@taucad/api-auth/testing';",
        },
        {
          name: 'an integration harness under app/testing',
          filename: 'apps/api/app/testing/live/live-gateway.harness.ts',
          code: "import { fakeSessionResolver } from '@taucad/api-auth/testing';",
        },
        {
          name: 'a similar but different string',
          filename: provider,
          code: "const key = 'authInstanceKeys';",
        },
      ],
      invalid: [
        {
          name: 'injecting the token by its string',
          filename: provider,
          code: "class A { constructor(@Inject('authInstanceKey') auth) {} }",
          errors: [{ messageId: 'instanceToken' }],
        },
        {
          name: 'the token as a template literal',
          filename: provider,
          code: 'const key = `authInstanceKey`;',
          errors: [{ messageId: 'instanceToken' }],
        },
        {
          name: 'the testing subpath in production source',
          filename: provider,
          code: "import { fakeSessionResolver } from '@taucad/api-auth/testing';",
          errors: [{ messageId: 'testingImport' }],
        },
        {
          name: 'a deeper testing subpath in production source',
          filename: provider,
          code: "import { createSessionCacheHarness } from '@taucad/api-auth/testing/session-cache';",
          errors: [{ messageId: 'testingImport' }],
        },
        {
          name: 'a re-export of the testing subpath',
          filename: 'apps/libs/api-hosts/src/index.ts',
          code: "export * from '@taucad/api-auth/testing';",
          errors: [{ messageId: 'testingImport' }],
        },
        {
          name: 'a dynamic import of the testing subpath',
          filename: provider,
          code: "const testing = await import('@taucad/api-auth/testing');",
          errors: [{ messageId: 'testingImport' }],
        },
      ],
    });
  });
});
