import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import path from 'node:path';
import { requirePublicExportJsdocRule } from './require-public-export-jsdoc.js';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..');
const NAMED_RE_EXPORT_FIXTURE = path.join(import.meta.dirname, 'fixtures', 'require-public-export-jsdoc');

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

describe('require-public-export-jsdoc', () => {
  describe('non-public files', () => {
    it('should not report on files not in package.json exports', () => {
      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: 'non-exported file is ignored',
            code: 'export const foo = 1;',
            filename: path.join(PACKAGE_ROOT, 'src', 'internal', 'not-exported.ts'),
          },
          {
            name: 'file outside any package is ignored',
            code: 'export const foo = 1;',
            filename: '/tmp/random-file.ts',
          },
        ],
        invalid: [],
      });
    });
  });

  describe('public files', () => {
    it('should follow named re-exports without promoting sibling exports', () => {
      const filename = path.join(NAMED_RE_EXPORT_FIXTURE, 'implementation.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: 'unreachable sibling export needs no public tag',
            code: `
/** @public */
export const PublicThing = 1;
export const InternalSibling = 2;
`,
            filename,
          },
        ],
        invalid: [
          {
            name: 'named public re-export still requires a public tag',
            code: `
export const PublicThing = 1;
export const InternalSibling = 2;
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'PublicThing' } }],
          },
        ],
      });
    });

    it('should follow local export lists to their declarations', () => {
      const filename = path.join(NAMED_RE_EXPORT_FIXTURE, 'implementation.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: 'documented local declaration exported under a public alias',
            code: `
/** @public */
const implementation = 1;
const sibling = 2;
export { implementation as PublicThing, sibling as InternalSibling };
`,
            filename,
          },
          {
            name: 'unreachable local export needs no public tag',
            code: `
const InternalSibling = 1;
export { InternalSibling };
`,
            filename,
          },
        ],
        invalid: [
          {
            name: 'public alias requires JSDoc on its local declaration',
            code: `
const implementation = 1;
const sibling = 2;
export { implementation as PublicThing, sibling as InternalSibling };
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'implementation' } }],
          },
        ],
      });
    });

    it('should follow type-only star re-exports without promoting values', () => {
      const filename = path.join(NAMED_RE_EXPORT_FIXTURE, 'type-implementation.ts');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: 'value beside a public type needs no public tag',
            code: `
/** @public */
export interface PublicType { value: string; }
export const internalValue = 1;
`,
            filename,
          },
        ],
        invalid: [
          {
            name: 'type-only star still requires tags on public types',
            code: `
export interface PublicType { value: string; }
export const internalValue = 1;
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'PublicType' } }],
          },
        ],
      });
    });

    it('should not match @public embedded in another word', () => {
      const filename = path.join(PACKAGE_ROOT, 'src', 'tau-lint.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [],
        invalid: [
          {
            name: '@publicAPI does not count as @public',
            code: `
/** @publicAPI */
export const foo = 1;
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'foo' } }],
          },
          {
            name: '@publicExport does not count as @public',
            code: `
/** @publicExport */
export const foo = 1;
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'foo' } }],
          },
        ],
      });
    });

    it('should handle multiple variable declarations in a single export', () => {
      const filename = path.join(PACKAGE_ROOT, 'src', 'tau-lint.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [],
        invalid: [
          {
            name: 'multiple variables in one export statement',
            code: `export const a = 1, b = 2;`,
            filename,
            errors: [
              { messageId: 'missingPublicTag', data: { name: 'a' } },
              { messageId: 'missingPublicTag', data: { name: 'b' } },
            ],
          },
        ],
      });
    });

    it('should accept @public with JSDoc continuation patterns', () => {
      const filename = path.join(PACKAGE_ROOT, 'src', 'tau-lint.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: '@public on its own line in multiline JSDoc',
            code: `
/**
 * Some description
 * @public
 * @param {string} name
 */
export function foo(name) {}
`,
            filename,
          },
          {
            name: '@public at end of comment value',
            code: `
/** @public */
export const foo = 1;
`,
            filename,
          },
        ],
        invalid: [],
      });
    });

    it('should report missing @public on exports and accept documented exports', () => {
      const filename = path.join(PACKAGE_ROOT, 'src', 'tau-lint.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: 'exported variable with @public JSDoc',
            code: `
/** @public */
export const foo = 1;
`,
            filename,
          },
          {
            name: 'exported function with @public JSDoc',
            code: `
/** @public */
export function bar() {}
`,
            filename,
          },
          {
            name: 'exported class with @public JSDoc',
            code: `
/** @public */
export class Baz {}
`,
            filename,
          },
          {
            name: 're-exports from other modules are ignored',
            code: `export { foo } from './other.js';`,
            filename,
          },
          {
            name: 'export * re-exports are ignored',
            code: `export * from './other.js';`,
            filename,
          },
          {
            name: '@public tag with additional JSDoc content',
            code: `
/**
 * A description.
 * @public
 */
export const foo = 1;
`,
            filename,
          },
        ],
        invalid: [
          {
            name: 'exported variable without @public',
            code: `export const foo = 1;`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'foo' } }],
          },
          {
            name: 'exported variable with JSDoc but missing @public',
            code: `
/** A description without public tag. */
export const foo = 1;
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'foo' } }],
          },
          {
            name: 'exported function without @public',
            code: `export function bar() {}`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'bar' } }],
          },
          {
            name: 'exported class without @public',
            code: `export class Baz {}`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'Baz' } }],
          },
          {
            name: 'default export without @public',
            code: `export default function() {}`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'default' } }],
          },
        ],
      });
    });

    it('should report on TypeScript declaration exports without @public', () => {
      const filename = path.join(PACKAGE_ROOT, 'src', 'tau-lint.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [
          {
            name: 'type alias with @public',
            code: `
/** @public */
export type Foo = string;
`,
            filename,
          },
          {
            name: 'interface with @public',
            code: `
/** @public */
export interface Bar { x: number; }
`,
            filename,
          },
          {
            name: 'enum with @public',
            code: `
/** @public */
export enum Status { Active, Inactive }
`,
            filename,
          },
        ],
        invalid: [
          {
            name: 'type alias without @public',
            code: `export type Foo = string;`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'Foo' } }],
          },
          {
            name: 'interface without @public',
            code: `export interface Bar { x: number; }`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'Bar' } }],
          },
          {
            name: 'enum without @public',
            code: `export enum Status { Active, Inactive }`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'Status' } }],
          },
        ],
      });
    });

    it('should support every declaration kind in local export lists', () => {
      const filename = path.join(PACKAGE_ROOT, 'src', 'tau-lint.js');

      ruleTester.run('require-public-export-jsdoc', requirePublicExportJsdocRule, {
        valid: [],
        invalid: [
          {
            name: 'local value and type declarations require public tags',
            code: `
const value = 1;
function fn() {}
class Klass {}
interface Shape { value: string }
type Alias = string;
enum Choice { One }
export { value, fn, Klass, Shape, Alias, Choice };
`,
            filename,
            errors: ['value', 'fn', 'Klass', 'Shape', 'Alias', 'Choice'].map((name) => ({
              messageId: 'missingPublicTag',
              data: { name },
            })),
          },
          {
            name: 'type-only local export is public',
            code: `
interface Shape { value: string }
export type { Shape };
`,
            filename,
            errors: [{ messageId: 'missingPublicTag', data: { name: 'Shape' } }],
          },
        ],
      });
    });
  });
});
