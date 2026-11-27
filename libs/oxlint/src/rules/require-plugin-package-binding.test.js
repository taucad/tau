import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { requirePluginPackageBindingRule } from './require-plugin-package-binding.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const pluginFile = 'packages/plugins/replicad/src/replicad.plugin.ts';

describe('require-plugin-package-binding', () => {
  it('requires the package-named definePlugin binding in the implementation module', () => {
    ruleTester.run('require-plugin-package-binding', requirePluginPackageBindingRule, {
      valid: [
        {
          name: 'package-named binding',
          filename: pluginFile,
          code: "import { definePlugin } from '@taucad/runtime/plugin';\nexport const replicad = definePlugin({ meta, presets });",
        },
        {
          name: 'hyphenated package name binds camelCase',
          filename: '/workspace/packages/plugins/picogk-browser/src/picogk-browser.plugin.ts',
          code: 'export const picogkBrowser = definePlugin({ meta, presets });',
        },
        {
          name: 'other exports beside the binding',
          filename: pluginFile,
          code: 'export const replicadMeta = { id: 1 };\nexport const replicad = definePlugin({ meta: replicadMeta, presets });',
        },
        {
          name: 'a non-exported definePlugin call is not a binding',
          filename: pluginFile,
          code: 'const draft = definePlugin({ meta, presets });\nexport const replicad = definePlugin({ meta, presets });',
        },
        {
          name: 'another plugin module in the package is out of scope',
          filename: 'packages/plugins/picogk/src/picogk-browser.plugin.ts',
          code: 'export const picogkBrowser = definePlugin({ meta, presets });',
        },
        {
          name: 'plugin test is out of scope',
          filename: 'packages/plugins/replicad/src/replicad.plugin.test.ts',
          code: 'export const other = definePlugin({ meta, presets });',
        },
        {
          name: 'runtime authoring module is out of scope',
          filename: 'packages/runtime/src/plugins/plugin.ts',
          code: 'export const other = definePlugin({ meta, presets });',
        },
      ],
      invalid: [
        {
          name: 'no definePlugin binding',
          filename: pluginFile,
          code: 'export const replicad = createPlugin({ meta, presets });',
          errors: [{ messageId: 'missingBinding', data: { file: 'replicad.plugin.ts', alias: 'replicad' } }],
        },
        {
          name: 'definePlugin binding declared without export',
          filename: pluginFile,
          code: 'const replicad = definePlugin({ meta, presets });\nexport { replicad };',
          errors: [{ messageId: 'missingBinding' }],
        },
        {
          name: 'generic binding name',
          filename: pluginFile,
          code: 'export const plugin = definePlugin({ meta, presets });',
          errors: [{ messageId: 'unexpectedBinding', data: { name: 'plugin', alias: 'replicad' } }],
        },
        {
          name: 'hyphenated package name kept verbatim',
          filename: 'packages/plugins/picogk-browser/src/picogk-browser.plugin.ts',
          code: 'export const picogk_browser = definePlugin({ meta, presets });',
          errors: [{ messageId: 'unexpectedBinding', data: { name: 'picogk_browser', alias: 'picogkBrowser' } }],
        },
        {
          name: 'a second definePlugin export beside the package-named one',
          filename: pluginFile,
          code: 'export const replicad = definePlugin({ meta, presets });\nexport const replicadLite = definePlugin({ meta, presets });',
          errors: [{ messageId: 'unexpectedBinding', data: { name: 'replicadLite', alias: 'replicad' }, line: 2 }],
        },
      ],
    });
  });
});
