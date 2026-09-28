/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * Three dots that end a word and then the string or a space: "Search...", "Saving... 3/4".
 * A word character must precede them, so spread syntax, `../` paths and `main...HEAD` ranges stay legal.
 */
const ASCII_ELLIPSIS = /(\w)\.\.\.(?=\s|$)/u;

/** The same dots in source text, where a closing quote, backtick or `${` can follow them. */
const SOURCE_ELLIPSIS = /(\w)\.\.\.(?=\s|$|['"`]|\$\{)/gu;

/** @type {RuleModule} */
export const noAsciiEllipsisRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Replace three ASCII dots with an ellipsis in authored copy.',
    },
    fixable: 'code',
    messages: {
      violation: 'Use the ellipsis character "…" instead of three dots in copy (Page Composition Policy, Rule 12).',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      if (!ASCII_ELLIPSIS.test(text)) {
        return;
      }
      context.report({
        node,
        messageId: 'violation',
        fix: (fixer) => fixer.replaceText(node, context.sourceCode.getText(node).replaceAll(SOURCE_ELLIPSIS, '$1…')),
      });
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node, node.value);
        }
      },
      JSXText(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
