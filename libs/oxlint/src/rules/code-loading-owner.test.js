import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { codeLoadingOwnerRule } from './code-loading-owner.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const page = 'apps/ui/app/components/chat/chat-activity-spinner.tsx';
const library = 'apps/libs/editor-ui/src/lib/editor-language-runtime.ts';

describe('code-loading-owner', () => {
  it('allows import() only in a function handed to the owner, and lazy() only through lazyCode', () => {
    ruleTester.run('code-loading-owner', codeLoadingOwnerRule, {
      valid: [
        {
          name: 'an import() handed to loadCode',
          filename: page,
          code: "const load = async () => loadCode(async () => import('./view.js'));",
        },
        {
          name: 'several imports in one owned thunk',
          filename: library,
          code: "await loadCode(async () => Promise.all([import('./a.js'), import('./b.js')]));",
        },
        {
          name: 'a block-bodied lazyCode factory',
          filename: page,
          code: "const View = lazyCode(async () => { const m = await import('./view.js'); return { default: m.View }; });",
        },
        {
          name: 'optional code through lazyCode',
          filename: page,
          code: "const View = lazyCode(async () => import('./view.js'), { fallback: Flat });",
        },
        {
          name: 'a type-only import() is no load',
          filename: page,
          code: "type Module = typeof import('./view.js');",
        },
        {
          name: 'a lazy that is not React’s',
          filename: page,
          code: "import { lazy } from './lazy.js'; const value = lazy(() => 1);",
        },
        {
          name: 'the owner module itself',
          filename: 'apps/libs/ui-core/src/lib/lazy-code.ts',
          code: "import { lazy } from 'react'; export const lazyCode = (load) => lazy(load);",
        },
        {
          name: 'a test runs outside any page',
          filename: 'apps/ui/app/components/chat/chat-activity-spinner.test.tsx',
          code: "const module = await import('./chat-activity-spinner.js');",
        },
        {
          name: 'a server module runs in Node',
          filename: 'apps/ui/app/lib/sentry.server.ts',
          code: "const sentry = await import('@sentry/node');",
        },
        {
          name: 'an API library runs in Node',
          filename: 'apps/libs/api-billing/src/billing.service.ts',
          code: "const stripe = await import('stripe');",
        },
        {
          name: 'the service worker and its registration are owned by their own packages',
          filename: 'apps/ui/app/offline/use-pwa.ts',
          code: "const { startServiceWorker } = await import('#offline/pwa-registration.js');",
        },
        {
          name: 'a module worker started through the factory',
          filename: page,
          code: "const worker = createModuleWorker(() => new Worker(new URL('x.worker.ts', import.meta.url), { type: 'module' }), { name: 'x' });",
        },
        {
          name: 'a library that takes the factory as an option',
          filename: 'apps/libs/share/src/artifact-worker.ts',
          code: "const worker = options.createModuleWorker(() => new Worker(new URL('a.worker.ts', import.meta.url)), { name: 'a' });",
        },
        {
          name: 'outside the web app',
          filename: 'packages/runtime/src/client.ts',
          code: "const module = await import('./kernel.js');",
        },
      ],
      invalid: [
        {
          name: 'a raw import() in a page module',
          filename: page,
          code: "const module = await import('./view.js');",
          errors: [{ messageId: 'rawImport' }],
        },
        {
          name: 'a loader function that is not handed to the owner',
          filename: page,
          code: "const load = async () => import('./view.js');",
          errors: [{ messageId: 'rawImport' }],
        },
        {
          name: 'an import() nested in a callback inside the owned thunk',
          filename: page,
          code: "await loadCode(async () => [1].map(() => import('./view.js')));",
          errors: [{ messageId: 'rawImport' }],
        },
        {
          name: 'a raw import() in a private application library',
          filename: library,
          code: "const { acquire } = await import('./typescript-codemirror.js');",
          errors: [{ messageId: 'rawImport' }],
        },
        {
          name: 'a raw module worker',
          filename: page,
          code: "const worker = new Worker(new URL('x.worker.ts', import.meta.url), { type: 'module' });",
          errors: [{ messageId: 'rawWorker' }],
        },
        {
          name: 'a worker in a thunk that is not the factory',
          filename: library,
          code: "const options = { createWorker: () => new Worker(new URL('x.worker.ts', import.meta.url)) };",
          errors: [{ messageId: 'rawWorker' }],
        },
        {
          name: 'React’s lazy by name',
          filename: page,
          code: "import { lazy } from 'react'; const View = lazy(async () => loadCode(async () => import('./view.js')));",
          errors: [{ messageId: 'rawLazy' }],
        },
        {
          name: 'React’s lazy renamed',
          filename: page,
          code: "import { lazy as reactLazy } from 'react'; const View = reactLazy(() => 0);",
          errors: [{ messageId: 'rawLazy' }],
        },
        {
          name: 'React.lazy through the namespace',
          filename: page,
          code: "import * as React from 'react'; const View = React.lazy(() => 0);",
          errors: [{ messageId: 'rawLazy' }],
        },
      ],
    });
  });
});
