/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * Height, size, numeric width, horizontal padding and text size: what `Button`'s `size` variant owns.
 * A variant prefix (`md:h-9`) is responsive intent and stays legal, as do `w-full` and `w-auto`.
 */
const SIZE_OVERRIDE = /(?<![\w:-])(?:(?:h|size|w|px)-\d[\d.]*|text-(?:xs|sm|base))(?![\w-])/gu;

/** The static class strings inside a `className` value, through `cn(…)`, conditionals and arrays. */
const classStrings = (node) => {
  switch (node?.type) {
    case 'Literal': {
      return typeof node.value === 'string' ? [node] : [];
    }
    case 'TemplateLiteral': {
      return node.quasis;
    }
    case 'JSXExpressionContainer': {
      return classStrings(node.expression);
    }
    case 'CallExpression': {
      return node.arguments.flatMap((argument) => classStrings(argument));
    }
    case 'ConditionalExpression': {
      return [...classStrings(node.consequent), ...classStrings(node.alternate)];
    }
    case 'LogicalExpression': {
      return [...classStrings(node.left), ...classStrings(node.right)];
    }
    case 'ArrayExpression': {
      return node.elements.flatMap((element) => classStrings(element));
    }
    default: {
      return [];
    }
  }
};

/** @type {RuleModule} */
export const noButtonSizeOverrideRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Disallow className utilities that override a Button's size, padding or text size.",
    },
    hasSuggestions: true,
    messages: {
      violation:
        '`{{found}}` overrides the Button `size` variant. Pick the `size` that fits, or add a variant (Page Composition Policy, Rule 9).',
      remove: 'Remove `{{found}}`.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'Button') {
          return;
        }
        const className = node.attributes.find(
          (item) => item.type === 'JSXAttribute' && item.name.name === 'className',
        );
        for (const literal of classStrings(className?.value)) {
          const source = context.sourceCode.getText(literal);
          for (const match of source.matchAll(SIZE_OVERRIDE)) {
            const [found] = match;
            const start = literal.range[0] + match.index;
            /* Take one neighbouring space with the utility so the class string stays tidy. */
            const end = source[match.index + found.length] === ' ' ? start + found.length + 1 : start + found.length;
            context.report({
              node: literal,
              loc: {
                start: context.sourceCode.getLocFromIndex(start),
                end: context.sourceCode.getLocFromIndex(start + found.length),
              },
              messageId: 'violation',
              data: { found },
              suggest: [
                {
                  messageId: 'remove',
                  data: { found },
                  fix: (fixer) => fixer.removeRange([start, end]),
                },
              ],
            });
          }
        }
      },
    };
  },
};
