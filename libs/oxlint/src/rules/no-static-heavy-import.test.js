import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noStaticHeavyImportRule } from './no-static-heavy-import.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const options = [
  {
    modules: ['ai', '@ai-sdk/*', 'three', 'three/*', '@taucad/runtime'],
    deferredLeaves: ['apps/ui/app/components/geometry/cad-viewer.tsx', 'apps/ui/app/lib/kcl-language/'],
    known: ['apps/ui/app/services/chat-session-store.ts'],
  },
];
const shellFile = '/repo/apps/ui/app/root.tsx';

describe('no-static-heavy-import', () => {
  it('reports a static load of a heavy module outside deferred leaves and known files', () => {
    ruleTester.run('no-static-heavy-import', noStaticHeavyImportRule, {
      valid: [
        { name: 'a light module', filename: shellFile, options, code: "import { clsx } from 'clsx';" },
        { name: 'a type-only import', filename: shellFile, options, code: "import type { UIMessage } from 'ai';" },
        {
          name: 'a type-only re-export',
          filename: shellFile,
          options,
          code: "export type { UIMessage } from 'ai';",
        },
        {
          name: 'the tier boundary',
          filename: shellFile,
          options,
          code: "const load = async () => import('three');",
        },
        {
          name: 'a light subpath of a package heavy through its root entry',
          filename: shellFile,
          options,
          code: "import { createRuntimeClient } from '@taucad/runtime/client';",
        },
        {
          name: 'a package whose name only starts with a heavy one',
          filename: shellFile,
          options,
          code: "import { aiThing } from 'ai-utils';\nimport { x } from 'threejs-math';",
        },
        {
          name: 'a URL import evaluates nothing',
          filename: shellFile,
          options,
          code: "import iconUrl from 'three/examples/icon.svg?url';",
        },
        {
          name: 'a deferred leaf',
          filename: '/repo/apps/ui/app/components/geometry/cad-viewer.tsx',
          options,
          code: "import * as THREE from 'three';",
        },
        {
          name: 'a known file',
          filename: '/repo/apps/ui/app/services/chat-session-store.ts',
          options,
          code: "import { UIMessageStreamError } from 'ai';",
        },
        {
          name: 'a file under a deferred directory',
          filename: '/repo/apps/ui/app/lib/kcl-language/kcl-codemirror.ts',
          options,
          code: "import * as THREE from 'three';",
        },
        {
          name: 'a test',
          filename: '/repo/apps/ui/app/services/chat-session-store.test.ts',
          options,
          code: "import { createUIMessageStream } from 'ai';",
        },
        {
          name: 'a worker, a bundle of its own',
          filename: '/repo/apps/ui/app/workers/kernel.worker.ts',
          options,
          code: "import { replicad } from '@taucad/runtime';",
        },
        {
          name: 'a server module',
          filename: '/repo/apps/ui/app/lib/model-catalog.server.ts',
          options,
          code: "import { generateText } from 'ai';",
        },
        { name: 'no heavy list configured', filename: shellFile, code: "import * as THREE from 'three';" },
      ],
      invalid: [
        {
          name: 'a value import',
          filename: shellFile,
          options,
          code: "import { createUIMessageStream } from 'ai';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'ai' } }],
        },
        {
          name: 'a subpath of a scope',
          filename: shellFile,
          options,
          code: "import { useChat } from '@ai-sdk/react';",
          errors: [{ messageId: 'staticHeavy', data: { source: '@ai-sdk/react' } }],
        },
        {
          name: 'a subpath of a package heavy with its subpaths',
          filename: shellFile,
          options,
          code: "import { WebGPURenderer } from 'three/webgpu';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'three/webgpu' } }],
        },
        {
          name: 'a side-effect import',
          filename: shellFile,
          options,
          code: "import 'three';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'three' } }],
        },
        {
          name: 'inline type specifiers still load the module',
          filename: shellFile,
          options,
          code: "import { type UIMessage } from 'ai';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'ai' } }],
        },
        {
          name: 'a re-export',
          filename: shellFile,
          options,
          code: "export { createRuntimeClient } from '@taucad/runtime';",
          errors: [{ messageId: 'staticHeavy', data: { source: '@taucad/runtime' } }],
        },
        {
          name: 'a star re-export',
          filename: shellFile,
          options,
          code: "export * from 'three';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'three' } }],
        },
        {
          name: 'a sibling of a deferred directory',
          filename: '/repo/apps/ui/app/lib/kcl-language-hints.ts',
          options,
          code: "import * as THREE from 'three';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'three' } }],
        },
        {
          name: 'a file whose name only ends like a listed one',
          filename: '/repo/apps/ui/app/components/geometry/other-cad-viewer.tsx',
          options,
          code: "import * as THREE from 'three';",
          errors: [{ messageId: 'staticHeavy', data: { source: 'three' } }],
        },
      ],
    });
  });
});
