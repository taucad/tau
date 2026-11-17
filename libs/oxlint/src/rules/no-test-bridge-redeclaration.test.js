import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noTestBridgeRedeclarationRule } from './no-test-bridge-redeclaration.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const specFile = 'apps/ui-e2e/src/section-view-contour-fill.spec.ts';

describe('no-test-bridge-redeclaration', () => {
  it('flags a spec that declares a product bridge global and allows reading it', () => {
    ruleTester.run('no-test-bridge-redeclaration', noTestBridgeRedeclarationRule, {
      valid: [
        {
          name: 'reading the global the product declares',
          filename: specFile,
          code: 'const bridge = globalThis.__TAU_SECTION_VIEW_TEST__; bridge?.getCamera();',
        },
        {
          name: 'the product module declares the global as a var',
          filename: 'apps/ui/app/components/geometry/debug/section-view-test-bridge-api.ts',
          code: 'declare global { var __TAU_SECTION_VIEW_TEST__: Api | undefined; }',
        },
        {
          name: 'a spec-owned global that no product declares',
          filename: specFile,
          code: 'type Page = typeof globalThis & { __TAU_PICOVOXEL_BUFFER_TEST__?: { read(): number } };',
        },
        {
          name: 'a configured list replaces the default',
          filename: specFile,
          options: [{ globals: ['__TAU_KINEMATICS_TEST__'] }],
          code: 'type Page = { __TAU_SECTION_VIEW_TEST__?: unknown };',
        },
      ],
      invalid: [
        {
          name: 'an inline cast that redeclares the section-view bridge',
          filename: specFile,
          code: '(globalThis as { __TAU_SECTION_VIEW_TEST__?: { getCamera(): unknown } }).__TAU_SECTION_VIEW_TEST__;',
          errors: [{ messageId: 'violation', data: { name: '__TAU_SECTION_VIEW_TEST__' } }],
        },
        {
          name: 'a window alias that redeclares every bridge',
          filename: specFile,
          code: "type BridgeWindow = Window & { __TAU_SECTION_VIEW_TEST_BRIDGES__?: unknown[]; '__TAU_SECTION_VIEW_TEST__'?: unknown };",
          errors: [
            { messageId: 'violation', data: { name: '__TAU_SECTION_VIEW_TEST_BRIDGES__' } },
            { messageId: 'violation', data: { name: '__TAU_SECTION_VIEW_TEST__' } },
          ],
        },
        {
          name: 'a configured global',
          filename: specFile,
          options: [{ globals: ['__TAU_KINEMATICS_TEST__'] }],
          code: 'type Page = { __TAU_KINEMATICS_TEST__?: unknown };',
          errors: [{ messageId: 'violation', data: { name: '__TAU_KINEMATICS_TEST__' } }],
        },
      ],
    });
  });
});
