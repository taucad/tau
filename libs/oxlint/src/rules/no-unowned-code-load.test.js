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
const owner = "import { load } from '#lib/code-loading.js';\nimport { lazy } from '#lib/lazy-component.js';\n";

describe('no-unowned-code-load', () => {
  it('routes every page-realm import() and lazy() through the one code-load owner (PL7 FP9)', () => {
    ruleTester.run('no-unowned-code-load', noUnownedCodeLoadRule, {
      valid: [
        {
          name: 'an import() the owner loads',
          filename: page,
          code: `${owner}const module = await load(async () => import('#components/cad-preview.js'));`,
        },
        {
          name: 'an import() the owner loads, naming the exports used so the rest can be dropped',
          filename: page,
          code: `${owner}const { CadPreview } = await load(async () => import('#components/cad-preview.js').then((loaded) => ({ CadPreview: loaded.CadPreview })));`,
        },
        {
          name: 'an optional import() the owner loads',
          filename: page,
          code: `${owner}const module = await load(async () => import('posthog-js'), { optional: true });`,
        },
        {
          name: 'imports loaded together, each by the owner',
          filename: page,
          code: `${owner}const [a, b] = await Promise.all([load(async () => import('./a.js')), load(async () => import('./b.js'))]);`,
        },
        {
          name: "the owner's lazy around a factory that loads through it",
          filename: page,
          code: `${owner}const View = lazy(async () => ({ default: (await load(async () => import('./view.js'))).View }));`,
        },
        {
          name: 'the owner itself',
          filename: 'apps/ui/app/lib/code-loading.ts',
          code: "import { lazy as reactLazy } from 'react'; const f = () => import('./x.js');",
        },
        {
          name: "the owner's lazy component",
          filename: 'apps/ui/app/lib/lazy-component.ts',
          code: "import { lazy as reactLazy } from 'react';",
        },
        {
          name: 'an import() inside a worker through the worker loader (FP10)',
          filename: 'apps/ui/app/workers/agent-host.worker.ts',
          code: "import { loadInWorker } from '#workers/worker-load.js';\nconst module = await loadInWorker(async () => import('./agent-host.impl.js'));",
        },
        {
          name: 'a module worker outside workers/ through the worker loader',
          filename: 'apps/ui/app/machines/file-manager.worker.ts',
          code: "import { loadInWorker } from '#workers/worker-load.js';\nconst types = await loadInWorker(async () => import('@taucad/api-extractor/kernel-types'));",
        },
        {
          name: 'a page worker made by the module-worker factory (FP10)',
          filename: page,
          code: "import { createModuleWorker } from '#lib/module-worker.js';\nconst worker = createModuleWorker(() => new Worker(new URL('./a.worker.ts', import.meta.url), { type: 'module' }), { name: 'kernel' });",
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
          name: 'a then() the owner does not hold',
          filename: page,
          code: "const preview = await import('./x.js').then((loaded) => loaded.X);",
          errors: [{ messageId: 'unownedImport' }],
        },
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
          code: "import { load } from './elsewhere.js'; const m = await load(async () => import('./x.js'));",
          errors: [{ messageId: 'unownedImport' }],
        },
        {
          name: 'a bare import() inside a worker realm',
          filename: 'apps/ui/app/workers/agent-host.worker.ts',
          code: "const module = await import('./agent-host.impl.js');",
          errors: [{ messageId: 'unownedWorkerImport' }],
        },
        {
          name: "the page's load() inside a worker realm",
          filename: 'apps/ui/app/workers/agent-host.worker.ts',
          code: "import { load } from '#lib/code-loading.js';\nconst module = await load(async () => import('./agent-host.impl.js'));",
          errors: [{ messageId: 'unownedWorkerImport' }],
        },
        {
          name: 'a page worker made around the factory',
          filename: page,
          code: "const worker = new Worker(new URL('./a.worker.ts', import.meta.url), { type: 'module' });",
          errors: [{ messageId: 'unownedWorker' }],
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
