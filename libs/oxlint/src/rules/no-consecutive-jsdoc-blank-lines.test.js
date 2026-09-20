import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { noConsecutiveJsdocBlankLinesRule } from './no-consecutive-jsdoc-blank-lines.js';

const ruleTester = new RuleTester();

describe('no-consecutive-jsdoc-blank-lines', () => {
  it('should report consecutive blank lines in JSDoc and auto-fix', () => {
    ruleTester.run('no-consecutive-jsdoc-blank-lines', noConsecutiveJsdocBlankLinesRule, {
      valid: [
        {
          name: 'single blank line between sections is fine',
          code: `
/**
 * Description.
 *
 * @param x - input
 */
function foo(x) {}
`,
        },
        {
          name: 'no blank lines at all',
          code: `
/**
 * Description.
 * @param x - input
 */
function foo(x) {}
`,
        },
        {
          name: 'single blank line before @example',
          code: `
/**
 * Description.
 *
 * @public
 *
 * @example <caption>Usage</caption>
 * \`\`\`typescript
 * foo(1);
 * \`\`\`
 */
function foo(x) {}
`,
        },
        {
          name: 'empty JSDoc block is left to no-blank-blocks',
          code: `
class Foo {
  /**
   */
  read() {}
}
`,
        },
        {
          name: 'one blank line before the closer',
          code: `
/**
 *
 */
function foo() {}
`,
        },
        {
          name: 'regular block comment is ignored',
          code: `
/*


*/
const x = 1;
`,
        },
      ],
      invalid: [
        {
          name: 'two consecutive blank lines',
          code: `
/**
 * Description.
 *
 *
 * @param x - input
 */
function foo(x) {}
`,
          output: `
/**
 * Description.
 *
 * @param x - input
 */
function foo(x) {}
`,
          errors: [{ messageId: 'consecutive' }],
        },
        {
          name: 'three consecutive blank lines collapses to one',
          code: `
/**
 * Description.
 *
 *
 *
 * @param x - input
 */
function foo(x) {}
`,
          output: `
/**
 * Description.
 *
 *
 * @param x - input
 */
function foo(x) {}
`,
          errors: [{ messageId: 'consecutive' }, { messageId: 'consecutive' }],
        },
        {
          name: 'multiple groups of consecutive blank lines',
          code: `
/**
 * Description.
 *
 *
 * @param x - input
 *
 *
 * @returns result
 */
function foo(x) {}
`,
          output: `
/**
 * Description.
 *
 * @param x - input
 *
 * @returns result
 */
function foo(x) {}
`,
          errors: [{ messageId: 'consecutive' }, { messageId: 'consecutive' }],
        },
      ],
    });
  });
});
