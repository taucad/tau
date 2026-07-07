import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noImplInIndexRule } from './no-impl-in-index.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const indexFile = 'packages/geospec/src/index.ts';
const namedFile = 'packages/geospec/src/create-geospec.ts';

describe('no-impl-in-index', () => {
  it('allows only imports and re-exports in a barrel — not even type declarations', () => {
    ruleTester.run('no-impl-in-index', noImplInIndexRule, {
      valid: [
        {
          name: 'named re-export from a module',
          filename: indexFile,
          code: "export { createGeoSpec } from './create-geospec.js';",
        },
        {
          name: 'export * re-export',
          filename: indexFile,
          code: "export * from './matchers.js';",
        },
        {
          name: 'import then re-export specifiers',
          filename: indexFile,
          code: "import { a } from './a.js';\nexport { a };",
        },
        {
          name: 'type-only re-export from a module',
          filename: indexFile,
          code: "export type { GeoSpec } from './types.js';",
        },
        {
          name: 'type-only specifier re-export of an imported type',
          filename: indexFile,
          code: "import type { GeoSpec } from './types.js';\nexport type { GeoSpec };",
        },
        {
          name: 'default re-export of an existing binding',
          filename: indexFile,
          code: "import runner from './runner.js';\nexport default runner;",
        },
        {
          name: 'implementation in a NON-index file is ignored',
          filename: namedFile,
          code: 'export function createGeoSpec() {\n  return 1;\n}\nexport const NS = "geospec";',
        },
      ],
      invalid: [
        {
          name: 'exported function declaration',
          filename: indexFile,
          code: 'export function createGeoSpec() {\n  return build();\n}',
          errors: [
            {
              messageId: 'notABarrel',
              data: { name: 'createGeoSpec', kind: 'function', suggestion: 'create-geo-spec' },
            },
          ],
        },
        {
          name: 'thin identity function is still a definition (strict barrel)',
          filename: indexFile,
          code: 'export function defineGeoSpecConfig(config) {\n  return config;\n}',
          errors: [{ messageId: 'notABarrel' }],
        },
        {
          name: 'thin arrow wrapper is a definition',
          filename: indexFile,
          code: 'export const wrap = (x) => x;',
          errors: [{ messageId: 'notABarrel', data: { name: 'wrap', kind: 'function', suggestion: 'wrap' } }],
        },
        {
          name: 'class declaration',
          filename: indexFile,
          code: 'export class GeoSpecRunner {\n  run() {}\n}',
          errors: [
            { messageId: 'notABarrel', data: { name: 'GeoSpecRunner', kind: 'class', suggestion: 'geo-spec-runner' } },
          ],
        },
        {
          name: 'runtime value constant',
          filename: indexFile,
          code: "export const NAMESPACE = 'geospec';",
          errors: [{ messageId: 'notABarrel', data: { name: 'NAMESPACE', kind: 'value', suggestion: 'namespace' } }],
        },
        {
          name: 'object constant',
          filename: indexFile,
          code: 'export const config = { strict: true };',
          errors: [{ messageId: 'notABarrel', data: { name: 'config', kind: 'value', suggestion: 'config' } }],
        },
        {
          name: 'enum is a runtime binding',
          filename: indexFile,
          code: 'export enum Axis {\n  X,\n  Y,\n}',
          errors: [{ messageId: 'notABarrel', data: { name: 'Axis', kind: 'enum', suggestion: 'axis' } }],
        },
        {
          name: 'inline exported type alias is a declaration, not a re-export',
          filename: indexFile,
          code: 'export type GeoSpec = { id: string };',
          errors: [{ messageId: 'notABarrel', data: { name: 'GeoSpec', kind: 'type', suggestion: 'geo-spec' } }],
        },
        {
          name: 'inline exported interface is a declaration',
          filename: indexFile,
          code: 'export interface GeoSpecRunner {\n  run(): void;\n}',
          errors: [
            {
              messageId: 'notABarrel',
              data: { name: 'GeoSpecRunner', kind: 'interface', suggestion: 'geo-spec-runner' },
            },
          ],
        },
        {
          name: 'bare (non-exported) type alias still declares a symbol',
          filename: indexFile,
          code: 'type Internal = string;',
          errors: [{ messageId: 'notABarrel', data: { name: 'Internal', kind: 'type', suggestion: 'internal' } }],
        },
        {
          name: 'top-level side effect',
          filename: indexFile,
          code: "import { register } from './register.js';\nregister();",
          errors: [{ messageId: 'notABarrel' }],
        },
        {
          name: 'default-exported arrow',
          filename: indexFile,
          code: 'export default () => {\n  return 1;\n};',
          errors: [{ messageId: 'notABarrel' }],
        },
        {
          name: 'index.tsx is also covered',
          filename: 'apps/ui/app/components/index.tsx',
          code: 'export function Widget() {\n  return null;\n}',
          errors: [{ messageId: 'notABarrel' }],
        },
      ],
    });
  });
});
