import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noPluginDefaultImportRule } from './no-plugin-default-import.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

/*
 * A scratch workspace whose `packages/plugins` names the plugin packages, as Tau's does. `left-over` has no manifest,
 * like a removed plugin whose untracked `node_modules` survive in an existing checkout.
 */
const workspace = mkdtempSync(join(tmpdir(), 'no-plugin-default-import-'));
for (const [directory, name] of [
  ['replicad', '@taucad/replicad'],
  ['image', '@taucad/image'],
  ['left-over', undefined],
]) {
  mkdirSync(join(workspace, 'packages', 'plugins', directory, 'node_modules'), { recursive: true });
  if (name !== undefined) {
    writeFileSync(join(workspace, 'packages', 'plugins', directory, 'package.json'), JSON.stringify({ name }));
  }
}

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const runtimeFile = `${workspace}/packages/runtime/src/plugins/plugin-loader.ts`;
const pluginFile = `${workspace}/packages/plugins/image/src/image.plugin.ts`;
const applicationFile = `${workspace}/apps/ui/app/runtime/runtime-roster.ts`;

describe('no-plugin-default-import', () => {
  it('rejects default imports of Tau-owned plugin modules from runtime, plugin and application sources', () => {
    ruleTester.run('no-plugin-default-import', noPluginDefaultImportRule, {
      valid: [
        {
          name: 'named import of a plugin package',
          filename: runtimeFile,
          code: "import { replicad } from '@taucad/replicad';",
        },
        {
          name: 'namespace import of a plugin package',
          filename: pluginFile,
          code: "import * as replicadModule from '@taucad/replicad';",
        },
        {
          name: 'named import of a runtime plugin entry',
          filename: pluginFile,
          code: "import { defineBundler } from '@taucad/runtime/bundler';",
        },
        {
          name: 'package roots may default-import a JSON manifest',
          filename: pluginFile,
          code: "import manifest from '@taucad/replicad/tau-plugin.json' with { type: 'json' };",
        },
        {
          name: 'default import of a non-plugin package',
          filename: runtimeFile,
          code: "import ts from 'typescript';",
        },
        {
          name: 'a directory without a manifest names no package',
          filename: runtimeFile,
          code: "import leftOver from 'left-over';",
        },
        {
          name: 'declaration files in package roots are out of scope',
          filename: `${workspace}/packages/plugins/image/src/types/backend.d.ts`,
          code: "import replicad from '@taucad/replicad';",
        },
        {
          name: 'sources outside the guarded roots are out of scope',
          filename: `${workspace}/apps/ui/app/components/viewer.tsx`,
          code: "import replicad from '@taucad/replicad';",
        },
        {
          name: 'JavaScript files are out of scope',
          filename: `${workspace}/packages/runtime/src/plugins/legacy.js`,
          code: "import replicad from '@taucad/replicad';",
        },
      ],
      invalid: [
        {
          name: 'default import of a plugin package from runtime source',
          filename: runtimeFile,
          code: "import replicad from '@taucad/replicad';",
          errors: [{ messageId: 'defaultImport', data: { specifier: '@taucad/replicad' } }],
        },
        {
          name: 'default import of a plugin package subpath',
          filename: pluginFile,
          code: "import kernel from '@taucad/replicad/kernel';",
          errors: [{ messageId: 'defaultImport', data: { specifier: '@taucad/replicad/kernel' } }],
        },
        {
          name: 'default import beside named bindings',
          filename: pluginFile,
          code: "import image, { plugin } from '@taucad/image';",
          errors: [{ messageId: 'defaultImport' }],
        },
        {
          name: 'type-only default import',
          filename: pluginFile,
          code: "import type Replicad from '@taucad/replicad';",
          errors: [{ messageId: 'defaultImport' }],
        },
        ...[
          '#bundler/esbuild.js',
          '#kernels/registry.js',
          '#middleware/cache.js',
          '@taucad/runtime/bundler',
          '@taucad/runtime/middleware',
          '@taucad/runtime/transcoder',
        ].map((specifier) => ({
          name: `default import of ${specifier}`,
          filename: runtimeFile,
          code: `import entry from '${specifier}';`,
          errors: [{ messageId: 'defaultImport', data: { specifier } }],
        })),
        {
          name: 'default import inside an ambient module',
          filename: runtimeFile,
          code: "declare module 'host' {\n  import replicad from '@taucad/replicad';\n}",
          errors: [{ messageId: 'defaultImport', line: 2 }],
        },
        {
          name: 'application roots have no JSON allowance',
          filename: applicationFile,
          code: "import manifest from '@taucad/replicad/tau-plugin.json' with { type: 'json' };",
          errors: [{ messageId: 'defaultImport' }],
        },
        {
          name: 'application middleware source',
          filename: `${workspace}/apps/ui/app/middleware/geometry-cache.ts`,
          code: "import middleware from '@taucad/runtime/middleware';",
          errors: [{ messageId: 'defaultImport' }],
        },
        {
          name: 'telemetry source',
          filename: `${workspace}/libs/telemetry/src/runtime-spans.ts`,
          code: "import image from '@taucad/image';",
          errors: [{ messageId: 'defaultImport' }],
        },
        {
          name: 'application declaration file',
          filename: `${workspace}/apps/ui/app/runtime/plugins.d.ts`,
          code: "import image from '@taucad/image';",
          errors: [{ messageId: 'defaultImport' }],
        },
      ],
    });
  });
});
