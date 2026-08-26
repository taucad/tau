import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { validateJsdocCodeblocksRule } from './validate-jsdoc-codeblocks.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const publicTypescriptBlock = (code) => `
/**
 * @public
 * \`\`\`typescript
${code
  .split('\n')
  .map((line) => ` * ${line}`)
  .join('\n')}
 * \`\`\`
 */
export const foo = 1;
`;

describe('validate-jsdoc-codeblocks', () => {
  describe('language tag requirement', () => {
    it('should report codeblocks without a language tag', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'codeblock with typescript language tag',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const x: number = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'codeblock with json language tag',
            code: `
/**
 * @public
 * \`\`\`json
 * { "key": "value" }
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'codeblock with text language tag',
            code: `
/**
 * @public
 * \`\`\`text
 * Some plain text
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'non-JSDoc block comment is ignored',
            code: `
/* Not a JSDoc comment
\`\`\`
no lang
\`\`\`
*/
const foo = 1;
`,
          },
          {
            name: 'line comments are ignored',
            code: '// Just a line comment\nconst foo = 1;',
          },
        ],
        invalid: [
          {
            name: 'codeblock without language tag in JSDoc',
            code: `
/**
 * @public
 * \`\`\`
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'missingLanguageTag' }],
          },
        ],
      });
    });
  });

  describe('TypeScript compilation', () => {
    it('should report TypeScript errors in @public codeblocks', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'valid TypeScript in @public JSDoc',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const x: number = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'TypeScript in non-@public JSDoc is not compile-checked',
            code: `
/**
 * @internal
 * \`\`\`typescript
 * const x: number = "not a number";
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'TypeScript in untagged JSDoc is not compile-checked',
            code: `
/**
 * \`\`\`typescript
 * const x: number = "not a number";
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'non-TypeScript codeblock in @public JSDoc skips compilation',
            code: `
/**
 * @public
 * \`\`\`json
 * { "invalid": json }
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'empty TypeScript codeblock in @public JSDoc',
            code: `
/**
 * @public
 * \`\`\`typescript
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [
          {
            name: 'type error in @public TypeScript codeblock',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const x: number = "not a number";
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'invalidCodeblock' }],
          },
          {
            name: 'syntax error in @public TypeScript codeblock',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const x: = ;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'invalidCodeblock' }, { messageId: 'invalidCodeblock' }],
          },
        ],
      });
    });
  });

  describe('duplicate imports', () => {
    it('should report same-kind imports from the same module', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'same-module imports are co-located',
            code: `
/**
 * @public
 * \`\`\`typescript
 * import { createRuntimeClient, defineRuntime } from '@taucad/runtime';
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'type and value imports remain separate',
            code: `
/**
 * @public
 * \`\`\`typescript
 * import type { ParsedPath } from 'node:path';
 * import { parse } from 'node:path';
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [
          {
            name: 'screenshot case imports the runtime root twice',
            code: `
/**
 * @public
 * \`\`\`typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { defineRuntime } from '@taucad/runtime';
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: "import/no-duplicates: '@taucad/runtime' imported multiple times.",
                },
              },
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: "import/no-duplicates: '@taucad/runtime' imported multiple times.",
                },
              },
            ],
          },
        ],
      });
    });
  });

  describe('syntax-only lint profile', () => {
    it('should apply the selected Tau rules with their existing options', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'type-only imports use a top-level import type declaration',
            code: publicTypescriptBlock("import type { ParsedPath } from 'node:path';\nexport type Path = ParsedPath;"),
          },
          {
            name: 'imports precede executable statements',
            code: publicTypescriptBlock("import { parse } from 'node:path';\nparse('value');"),
          },
          {
            name: 'const replaces var and never-reassigned let',
            code: publicTypescriptBlock('const value = 1;\nconsole.log(value);'),
          },
          {
            name: 'reassigned bindings remain let',
            code: publicTypescriptBlock('let value = 1;\nvalue += 1;'),
          },
          {
            name: 'control flow uses braces',
            code: publicTypescriptBlock("if (true) {\n  console.log('value');\n}"),
          },
          {
            name: 'equality is strict',
            code: publicTypescriptBlock('const value: string | undefined = undefined;\nvalue === undefined;'),
          },
          {
            name: 'unknown replaces explicit any',
            code: publicTypescriptBlock('const value: unknown = 1;\nconsole.log(value);'),
          },
          {
            name: 'type assertions use as syntax',
            code: publicTypescriptBlock("const value = 'value' as string;\nconsole.log(value);"),
          },
          {
            name: 'Node built-ins use the node protocol',
            code: publicTypescriptBlock("import { join } from 'node:path';\njoin('directory', 'file');"),
          },
        ],
        invalid: [
          {
            name: 'value import used only as a type',
            code: publicTypescriptBlock("import { ParsedPath } from 'node:path';\nexport type Path = ParsedPath;"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage:
                    '@typescript-eslint/consistent-type-imports: All imports in the declaration are only used as types. Use `import type`.',
                },
              },
            ],
          },
          {
            name: 'inline type import specifier',
            code: publicTypescriptBlock("import { type ParsedPath } from 'node:path';\nexport type Path = ParsedPath;"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage:
                    'import/consistent-type-specifier-style: Prefer using a top-level type-only import instead of inline type specifiers.',
                },
              },
            ],
          },
          {
            name: 'import after executable statement',
            code: publicTypescriptBlock("const value = 1;\nimport { parse } from 'node:path';\nparse(String(value));"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: { errorMessage: 'import/first: Import in body of module; reorder to top.' },
              },
            ],
          },
          {
            name: 'var declaration',
            code: publicTypescriptBlock('var value = 1;\nconsole.log(value);'),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: { errorMessage: 'no-var: Unexpected var, use let or const instead.' },
                line: 5,
              },
            ],
          },
          {
            name: 'never-reassigned let declaration',
            code: publicTypescriptBlock('let value = 1;\nconsole.log(value);'),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: { errorMessage: "prefer-const: 'value' is never reassigned. Use 'const' instead." },
              },
            ],
          },
          {
            name: 'unbraced control flow',
            code: publicTypescriptBlock("if (true) console.log('value');"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: { errorMessage: "curly: Expected { after 'if' condition." },
              },
            ],
          },
          {
            name: 'coercive equality',
            code: publicTypescriptBlock('const value: string | undefined = undefined;\nvalue == null;'),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: { errorMessage: "eqeqeq: Expected '===' and instead saw '=='." },
              },
            ],
          },
          {
            name: 'explicit any annotation',
            code: publicTypescriptBlock('const value: any = 1;\nconsole.log(value);'),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: '@typescript-eslint/no-explicit-any: Unexpected any. Specify a different type.',
                },
              },
            ],
          },
          {
            name: 'angle-bracket type assertion',
            code: publicTypescriptBlock("const value = <string>'value';\nconsole.log(value);"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: "@typescript-eslint/consistent-type-assertions: Use 'as string' instead of '<string>'.",
                },
              },
            ],
          },
          {
            name: 'bare Node built-in import',
            code: publicTypescriptBlock("import { parse } from 'path';\nparse('value');"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: 'unicorn/prefer-node-protocol: Prefer `node:path` over `path`.',
                },
              },
            ],
          },
        ],
      });
    });
  });

  describe('type-aware lint profile', () => {
    it('should apply the selected tsgolint rules with their existing options', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'promise is explicitly ignored',
            code: publicTypescriptBlock('void Promise.resolve();'),
          },
          {
            name: 'promise is awaited before use as a condition',
            code: publicTypescriptBlock(
              'const check = async () => {\n  if (await Promise.resolve(true)) {}\n};\nvoid check();',
            ),
          },
          {
            name: 'Error object is thrown',
            code: publicTypescriptBlock("throw new Error('failure');"),
          },
          {
            name: 'non-deprecated declaration is called',
            code: publicTypescriptBlock('const currentApi = () => {};\ncurrentApi();'),
          },
        ],
        invalid: [
          {
            name: 'floating promise',
            code: publicTypescriptBlock('Promise.resolve();'),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: 'no-floating-promises: Promises must be awaited, add void operator to ignore.',
                },
              },
            ],
          },
          {
            name: 'promise used as a condition',
            code: publicTypescriptBlock('if (Promise.resolve(true)) {}'),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage:
                    "TS2801: This condition will always return true since this 'Promise<boolean>' is always defined.",
                },
              },
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: 'no-misused-promises: Expected non-Promise value in a boolean conditional.',
                },
              },
            ],
          },
          {
            name: 'non-error value is thrown',
            code: publicTypescriptBlock("throw 'failure';"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: { errorMessage: 'only-throw-error: Expected an error object to be thrown.' },
              },
            ],
          },
          {
            name: 'deprecated Node declaration is called',
            code: publicTypescriptBlock("import { parse } from 'node:url';\nparse('https://example.com');"),
            errors: [
              {
                messageId: 'invalidCodeblock',
                data: {
                  errorMessage: 'no-deprecated: `parse` is deprecated. Use the WHATWG URL API instead.',
                },
              },
            ],
          },
        ],
      });
    });
  });

  describe('star-prefix stripping', () => {
    it('should correctly compile codeblocks with star prefixes', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'standard JSDoc formatting with star prefixes compiles correctly',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const greeting: string = "hello";
 * const count: number = 42;
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [],
      });
    });
  });

  describe('multiple codeblocks', () => {
    it('should report errors only for invalid codeblocks when multiple are present', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'multiple valid TypeScript codeblocks',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const a: number = 1;
 * \`\`\`
 *
 * \`\`\`typescript
 * const b: string = "hello";
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [
          {
            name: 'one valid and one invalid codeblock',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const a: number = 1;
 * \`\`\`
 *
 * \`\`\`typescript
 * const b: number = "wrong";
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'invalidCodeblock' }],
          },
        ],
      });
    });
  });

  describe('@public tag variants', () => {
    it('should only compile-check codeblocks with @public tag', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: '@publicAPI should not match (only exact @public)',
            code: `
/**
 * @publicAPI
 * \`\`\`typescript
 * const x: number = "not a number";
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: '@public at end of JSDoc line',
            code: `
/**
 * Some docs @public
 * \`\`\`typescript
 * const x: number = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: '@public followed by star (JSDoc continuation)',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const x: number = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [],
      });
    });
  });

  describe('@example caption enforcement', () => {
    it('should report bare text, missing captions, empty captions, and redundant "example" word', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'caption with descriptive text is accepted',
            code: `
/**
 * @example <caption>Browser setup</caption>
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [
          {
            name: 'bare text after @example is wrapped in caption',
            code: `
/**
 * @example Browser setup
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            output: `
/**
 * @example <caption>Browser setup</caption>
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'exampleBareText' }],
          },
          {
            name: 'missing caption entirely',
            code: `
/**
 * @example
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'exampleMissingCaption' }],
          },
          {
            name: 'empty caption tag',
            code: `
/**
 * @example <caption></caption>
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'exampleEmptyCaption' }],
          },
          {
            name: 'redundant word "example" in caption',
            code: `
/**
 * @example <caption>Example of usage</caption>
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'exampleRedundantWord' }],
          },
        ],
      });
    });
  });

  describe('shorthand language tag expansion', () => {
    it('should report ts shorthand and suggest typescript', () => {
      ruleTester.run('validate-jsdoc-codeblocks', validateJsdocCodeblocksRule, {
        valid: [
          {
            name: 'typescript tag is accepted',
            code: `
/**
 * @public
 * \`\`\`typescript
 * const x: number = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'javascript tag is accepted',
            code: `
/**
 * \`\`\`javascript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
        invalid: [
          {
            name: 'ts shorthand is flagged with fix',
            code: `
/**
 * \`\`\`ts
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'preferTypescriptTag' }],
            output: `
/**
 * \`\`\`typescript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
          {
            name: 'js shorthand is flagged with fix',
            code: `
/**
 * \`\`\`js
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
            errors: [{ messageId: 'preferJavascriptTag' }],
            output: `
/**
 * \`\`\`javascript
 * const x = 1;
 * \`\`\`
 */
export const foo = 1;
`,
          },
        ],
      });
    });
  });
});
