import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { pluginCapabilityFilenameRule } from './plugin-capability-filename.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const code = 'export const value = 1;';

describe('plugin-capability-filename', () => {
  it('accepts dotted capability filenames and everything outside the plugin capability scope', () => {
    ruleTester.run('plugin-capability-filename', pluginCapabilityFilenameRule, {
      valid: [
        { name: 'dotted plugin factory', filename: 'packages/plugins/image/src/image.plugin.ts', code },
        { name: 'dotted kernel', filename: 'packages/plugins/zoo/src/zoo.kernel.ts', code },
        { name: 'dotted kernel test', filename: 'packages/plugins/zoo/src/zoo.kernel.test.ts', code },
        {
          name: 'hyphenated name segment with a dotted role',
          filename: 'packages/plugins/middleware/src/geometry-cache.middleware.ts',
          code,
        },
        { name: 'dotted plugin type test', filename: 'packages/plugins/image/src/image.plugin.test-d.ts', code },
        {
          name: 'hyphenated package name with a dotted role',
          filename: 'packages/plugins/opencascade-native/src/opencascade-native.kernel.ts',
          code,
        },
        { name: 'non-capability dotted module', filename: 'packages/plugins/replicad/src/replicad.schemas.ts', code },
        { name: 'hyphenated helper module', filename: 'packages/plugins/image/src/image-backend.ts', code },
        {
          name: 'scenario test without a role marker',
          filename: 'packages/plugins/image/src/image-import-failure.test.ts',
          code,
        },
        {
          name: 'nested directory is out of scope',
          filename: 'packages/plugins/replicad/src/utils/normalize-color.ts',
          code,
        },
        { name: 'core package is out of scope', filename: 'packages/core/occt/src/oc-kernel-error.ts', code },
        { name: 'runtime authoring module is out of scope', filename: 'packages/runtime/src/plugins/plugin.ts', code },
        { name: 'Nx inference plugin is out of scope', filename: 'tools/tsdown.plugin.ts', code },
      ],
      invalid: [
        {
          name: 'generic plugin source',
          filename: 'packages/plugins/image/src/plugin.ts',
          code,
          errors: [{ messageId: 'genericName', data: { actual: 'plugin.ts', suggestion: 'image.plugin.ts' } }],
        },
        {
          name: 'generic plugin test',
          filename: 'packages/plugins/image/src/plugin.test.ts',
          code,
          errors: [
            { messageId: 'genericName', data: { actual: 'plugin.test.ts', suggestion: 'image.plugin.test.ts' } },
          ],
        },
        {
          name: 'generic plugin type test',
          filename: 'packages/plugins/image/src/plugin.test-d.ts',
          code,
          errors: [
            { messageId: 'genericName', data: { actual: 'plugin.test-d.ts', suggestion: 'image.plugin.test-d.ts' } },
          ],
        },
        {
          name: 'hyphen-role kernel',
          filename: 'packages/plugins/zoo/src/zoo-kernel.ts',
          code,
          errors: [{ messageId: 'hyphenRole', data: { actual: 'zoo-kernel.ts', suggestion: 'zoo.kernel.ts' } }],
        },
        {
          name: 'hyphen-role kernel test',
          filename: 'packages/plugins/brep/src/brep-kernel.test.ts',
          code,
          errors: [
            { messageId: 'hyphenRole', data: { actual: 'brep-kernel.test.ts', suggestion: 'brep.kernel.test.ts' } },
          ],
        },
        {
          name: 'hyphen-role transcoder',
          filename: 'packages/plugins/gltf/src/gltf-transcoder.ts',
          code,
          errors: [
            { messageId: 'hyphenRole', data: { actual: 'gltf-transcoder.ts', suggestion: 'gltf.transcoder.ts' } },
          ],
        },
        {
          name: 'hyphen-role bundler',
          filename: 'packages/plugins/esbuild/src/esbuild-bundler.ts',
          code,
          errors: [
            { messageId: 'hyphenRole', data: { actual: 'esbuild-bundler.ts', suggestion: 'esbuild.bundler.ts' } },
          ],
        },
      ],
    });
  });
});
