import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noKernelTypeAssertionRule } from './no-kernel-type-assertion.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const kernelFile = 'packages/plugins/replicad/src/replicad.kernel.ts';

describe('no-kernel-type-assertion', () => {
  it('allows only const assertions in a plugin kernel module', () => {
    ruleTester.run('no-kernel-type-assertion', noKernelTypeAssertionRule, {
      valid: [
        { name: 'const assertion on a literal', filename: kernelFile, code: "const format = 'occt' as const;" },
        {
          name: 'const assertion on a container',
          filename: kernelFile,
          code: "const formats = ['step', 'stl'] as const;",
        },
        {
          name: 'const assertion on a non-literal expression',
          filename: kernelFile,
          code: 'const entries = Object.freeze(list) as const;',
        },
        {
          name: 'typed annotation instead of an assertion',
          filename: kernelFile,
          code: 'const oc: OpenCascadeInstance = library.getOC();',
        },
        { name: 'satisfies is not an assertion', filename: kernelFile, code: 'const meta = {} satisfies Meta;' },
        {
          name: 'helper modules of a kernel package are out of scope',
          filename: 'packages/plugins/replicad/src/utils/replicad-to-gltf.ts',
          code: 'const value = input as Geometry;',
        },
        {
          name: 'kernel test is out of scope',
          filename: 'packages/plugins/replicad/src/replicad.kernel.test.ts',
          code: 'const value = input as Geometry;',
        },
        {
          name: 'a kernel module not named for its package is out of scope',
          filename: 'packages/plugins/picogk/src/picogk-browser.kernel.ts',
          code: 'const value = input as Geometry;',
        },
        {
          name: 'a nested kernel module is out of scope',
          filename: 'packages/plugins/replicad/src/replicad/replicad.kernel.ts',
          code: 'const value = input as Geometry;',
        },
        {
          name: 'a runtime kernel module is out of scope',
          filename: 'packages/runtime/src/kernels/runtime.kernel.ts',
          code: 'const value = input as Geometry;',
        },
      ],
      invalid: [
        {
          name: 'the replicad wasmMemory intersection (#2610)',
          filename: '/workspace/packages/plugins/replicad/src/replicad.kernel.ts',
          code: 'const oc = library.getOC() as OpenCascadeInstance & { wasmMemory: WebAssembly.Memory };',
          errors: [
            {
              messageId: 'assertion',
              data: { type: 'OpenCascadeInstance & { wasmMemory: WebAssembly.Memory }' },
              line: 1,
              column: 12,
            },
          ],
        },
        {
          name: 'assertion through unknown reports both casts',
          filename: kernelFile,
          code: 'const value = (input as unknown) as Geometry;',
          errors: [
            { messageId: 'assertion', data: { type: 'Geometry' } },
            { messageId: 'assertion', data: { type: 'unknown' } },
          ],
        },
        {
          name: 'assertion to a literal type is still an assertion',
          filename: kernelFile,
          code: "const format = value as 'step';",
          errors: [{ messageId: 'assertion', data: { type: "'step'" } }],
        },
        {
          name: 'hyphenated package kernel module',
          filename: 'packages/plugins/picogk-browser/src/picogk-browser.kernel.ts',
          code: 'const value = input as Geometry;',
          errors: [{ messageId: 'assertion', data: { type: 'Geometry' } }],
        },
      ],
    });
  });
});
