import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noUnownedCodeLoadRule } from './no-unowned-code-load.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const page = 'apps/ui/app/components/chat/chat-activity-spinner.tsx';
const owner = "import { lazy, load } from '#lib/code-loading.js';\n";

describe('no-unowned-code-load', () => {
  it('routes every page-realm import() and lazy() through the one code-load owner (PL7 FP9)', () => {
    ruleTester.run('no-unowned-code-load', noUnownedCodeLoadRule, {
      valid: [
        {
          name: 'an import() the owner loads',
          filename: page,
          code: `${owner}const module = await load(() => import('#components/cad-preview.js'));`,
        },
        {
          name: 'an optional import() the owner loads',
          filename: page,
          code: `${owner}const module = await load(() => import('posthog-js'), { optional: true });`,
        },
        {
          name: 'imports loaded together, each by the owner',
          filename: page,
          code: `${owner}const [a, b] = await Promise.all([load(() => import('./a.js')), load(() => import('./b.js'))]);`,
        },
        {
          name: "the owner's lazy around a factory that loads through it",
          filename: page,
          code: `${owner}const View = lazy(async () => ({ default: (await load(() => import('./view.js'))).View }));`,
        },
        {
          name: 'the owner itself',
          filename: 'apps/ui/app/lib/code-loading.ts',
          code: "import { lazy as reactLazy } from 'react'; const f = () => import('./x.js');",
        },
        {
          name: 'a worker realm, which FP10 owns',
          filename: 'apps/ui/app/workers/agent-host.worker.ts',
          code: "const module = await import('./agent-host.impl.js');",
        },
        {
          name: 'a module worker outside workers/',
          filename: 'apps/ui/app/machines/file-manager.worker.ts',
          code: "const types = await import('@taucad/api-extractor/kernel-types');",
        },
        {
          name: 'server code, which no page realm runs',
          filename: 'apps/ui/app/lib/sentry.server.ts',
          code: "const sentry = await import('@sentry/node');",
        },
        {
          name: 'a test',
          filename: 'apps/ui/app/lib/code-loading.test.ts',
          code: "const module = await import('#lib/code-loading.js');",
        },
        {
          name: 'outside the web app',
          filename: 'packages/runtime/src/index.ts',
          code: "const module = await import('./x.js');",
        },
        {
          name: 'a type-only import() is no load',
          filename: page,
          code: "type Module = typeof import('./x.js');",
        },
        {
          name: 'Suspense from react',
          filename: page,
          code: "import { Suspense } from 'react';",
        },
      ],
      invalid: [
        {
          name: 'a bare import()',
          filename: page,
          code: "const module = await import('#components/cad-preview.js');",
          errors: [{ messageId: 'unownedImport' }],
        },
        {
          name: 'an import() held by a local loader function',
          filename: page,
          code: "const loadPreview = async () => import('#components/cad-preview.js');",
          errors: [{ messageId: 'unownedImport' }],
        },
        {
          name: 'an import() inside the arrow but not its whole body',
          filename: page,
          code: `${owner}const m = await load(async () => { const x = await import('./x.js'); return x; });`,
          errors: [{ messageId: 'unownedImport' }],
        },
        {
          name: 'a load that is not the owner’s',
          filename: page,
          code: "import { load } from './elsewhere.js'; const m = await load(() => import('./x.js'));",
          errors: [{ messageId: 'unownedImport' }],
        },
        {
          name: "React's lazy, imported by name",
          filename: page,
          code: "import { lazy, Suspense } from 'react';",
          errors: [{ messageId: 'reactLazy' }],
        },
        {
          name: "React's lazy through the namespace",
          filename: page,
          code: "import React from 'react'; const View = React.lazy(() => Promise.resolve({ default: () => null }));",
          errors: [{ messageId: 'reactLazy' }],
        },
      ],
    });
  });
});
