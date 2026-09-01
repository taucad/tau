import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { requireUsingOnDisposableRule } from './require-using-on-disposable.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(currentDirectory, 'fixtures', 'require-using-on-disposable');
const caseFile = path.join(fixtureDirectory, 'rule-tester-cases.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: fixtureDirectory,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
});

/** Minimal disposable type + helper for type-aware disposal checks. */
const disposableClass = `
class D {
  [Symbol.dispose](): void {}
  delete(): void {}
}
function foo(_a: D): void {}
`;

describe('require-using-on-disposable', () => {
  it('accepts using, return forwarding, and flags leaks', () => {
    ruleTester.run('require-using-on-disposable', requireUsingOnDisposableRule, {
      valid: [
        {
          name: 'using binding',
          code: `${disposableClass}\nusing x = new D();`,
          filename: caseFile,
        },
        {
          name: 'const forwarded via return',
          code: `${disposableClass}\nfunction g(): D {\n  const x = new D();\n  return x;\n}`,
          filename: caseFile,
        },
        {
          name: 'const used then returned',
          code: `${disposableClass}\nfunction g(): D {\n  const x = new D();\n  foo(x);\n  return x;\n}`,
          filename: caseFile,
        },
        {
          name: 'const forwarded in object literal',
          code: `${disposableClass}\nfunction g(): { x: D } {\n  const x = new D();\n  return { x };\n}`,
          filename: caseFile,
        },
        {
          name: 'const forwarded in array literal',
          code: `${disposableClass}\nfunction g(): D[] {\n  const x = new D();\n  return [x];\n}`,
          filename: caseFile,
        },
        {
          name: 'const forwarded as named property',
          code: `${disposableClass}\nfunction g(): { state: D } {\n  const x = new D();\n  return { state: x };\n}`,
          filename: caseFile,
        },
        {
          name: 'const forwarded inside call expression',
          code: `${disposableClass}\nfunction g(): D {\n  const x = new D();\n  return foo(x), x;\n}`,
          filename: caseFile,
        },
      ],
      invalid: [
        {
          name: 'unused const disposable',
          code: `${disposableClass}\nfunction g(): void {\n  const x = new D();\n}`,
          filename: caseFile,
          errors: [{ messageId: 'missingUsing' }],
          output: `${disposableClass}\nfunction g(): void {\n  using x = new D();\n}`,
        },
        {
          name: 'const used but not returned',
          code: `${disposableClass}\nfunction g(): void {\n  const x = new D();\n  foo(x);\n}`,
          filename: caseFile,
          errors: [{ messageId: 'missingUsing' }],
          output: `${disposableClass}\nfunction g(): void {\n  using x = new D();\n  foo(x);\n}`,
        },
        {
          name: 'let return not allowed (no autofix)',
          code: `${disposableClass}\nfunction g(): D {\n  let x = new D();\n  return x;\n}`,
          filename: caseFile,
          errors: [{ messageId: 'missingUsing' }],
        },
        {
          name: 'closure capture — ownership not traced to return',
          code: `${disposableClass}\nfunction g(): { cleanup: () => void } {\n  const x = new D();\n  const cleanup = () => { x.delete(); };\n  return { cleanup };\n}`,
          filename: caseFile,
          errors: [{ messageId: 'missingUsing' }],
          output: `${disposableClass}\nfunction g(): { cleanup: () => void } {\n  using x = new D();\n  const cleanup = () => { x.delete(); };\n  return { cleanup };\n}`,
        },
      ],
    });
  });
});
