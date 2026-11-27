/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

import { pluginSourceOf } from '../utils/plugin-source.utils.js';

/** @type {RuleModule} */
export const noKernelTypeAssertionRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow `as` type assertions other than `as const` in a plugin package's kernel module " +
        '(`packages/plugins/<pkg>/src/<pkg>.kernel.ts`). A kernel narrows foreign values with a typed accessor or a ' +
        'type guard, so a wrong assumption fails where it is made instead of where the value is used.',
    },
    messages: {
      assertion:
        '`as {{type}}` asserts a type the compiler cannot check. Narrow with a typed accessor or a type guard; only ' +
        '`as const` is allowed in a kernel module.',
    },
    schema: [],
  },
  create(context) {
    const source = pluginSourceOf(context.filename);
    if (source === undefined || source.path !== `${source.packageName}.kernel.ts`) {
      return {};
    }
    const { sourceCode } = context;
    return {
      TSAsExpression(node) {
        const type = sourceCode.getText(node.typeAnnotation);
        if (type !== 'const') {
          context.report({ node, messageId: 'assertion', data: { type } });
        }
      },
    };
  },
};
