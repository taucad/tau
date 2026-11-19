import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noPluginDefaultExportRule } from './no-plugin-default-export.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

/** A CAD user source: its default export is the model entrypoint the kernel calls. */
const cadSource = [
  'export const defaultParams = { radius: 10 };',
  'export default function main(params = defaultParams) {',
  '  return makeCylinder(params.radius);',
  '}',
].join('\n');

describe('no-plugin-default-export', () => {
  it('keeps first-party plugin implementation modules named-only', () => {
    ruleTester.run('no-plugin-default-export', noPluginDefaultExportRule, {
      valid: [
        {
          name: 'named plugin factory',
          filename: 'packages/plugins/replicad/src/replicad.plugin.ts',
          code: 'export const replicad = definePlugin({ meta, presets });',
        },
        {
          name: 'named re-exports in the package entry',
          filename: 'packages/plugins/replicad/src/index.ts',
          code: "export { replicad, replicad as plugin } from '#replicad.plugin.js';",
        },
        {
          name: 'export assignment is not a default export',
          filename: 'packages/plugins/replicad/src/legacy.ts',
          code: 'const value = 1;\nexport = value;',
        },
        {
          name: 'declaration file describing a foreign module',
          filename: 'packages/plugins/brep/src/types/occt-import-js.d.ts',
          code: "declare module 'occt-import-js' {\n  export default function occtimportjs(): Promise<unknown>;\n}",
        },
        {
          name: 'CAD user source default entrypoint stays outside the guard',
          filename: 'libs/tau-examples/src/kernels/replicad/cylinder/main.ts',
          code: cadSource,
        },
        { name: 'CAD user source at a project root', filename: 'main.ts', code: cadSource },
        {
          name: 'runtime source is out of scope',
          filename: 'packages/runtime/src/plugins/plugin.ts',
          code: 'export default 1;',
        },
        {
          name: 'plugin package files outside src are out of scope',
          filename: 'packages/plugins/replicad/tsdown.config.ts',
          code: 'export default defineConfig({});',
        },
      ],
      invalid: [
        {
          name: 'default-exported function in an implementation module',
          filename: 'packages/plugins/replicad/src/replicad.plugin.ts',
          code: 'export default function replicad() {}',
          errors: [{ messageId: 'defaultExport', line: 1 }],
        },
        {
          name: 'default-exported expression',
          filename: 'packages/plugins/image/src/image-backend.ts',
          code: 'const backend = {};\nexport default backend;',
          errors: [{ messageId: 'defaultExport', line: 2 }],
        },
        {
          name: 'default-exported interface',
          filename: 'packages/plugins/image/src/image.types.ts',
          code: 'export default interface ImageOptions { readonly width: number }',
          errors: [{ messageId: 'defaultExport' }],
        },
        {
          name: 'default export inside an ambient module of an implementation source',
          filename: 'packages/plugins/zoo/src/offline/kcl-types.ts',
          code: "declare module 'kcl' {\n  const value: number;\n  export default value;\n}",
          errors: [{ messageId: 'defaultExport', line: 3 }],
        },
        {
          name: 'nested source and test files are in scope',
          filename: 'packages/plugins/replicad/src/utils/normalize-color.test.tsx',
          code: 'export default {};',
          errors: [{ messageId: 'defaultExport' }],
        },
        {
          name: 'a CAD user source pasted into a plugin source is flagged',
          filename: '/workspace/packages/plugins/replicad/src/main.ts',
          code: cadSource,
          errors: [{ messageId: 'defaultExport', line: 2, column: 1 }],
        },
      ],
    });
  });
});
