/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * `hover:text-primary`, `hover:border-primary/40`, `group-hover:bg-primary/10`: the brand accent
 * as a hover state. `hover:bg-primary-foreground` and other token names that only start with
 * `primary` stay legal.
 */
const ACCENT_HOVER =
  /(?<![\w-])(?:(?:group|peer)-hover(?:\/[\w-]+)?|hover):(?:text|border|bg)-primary(?:\/\d+)?(?![\w-])/u;

/** @type {RuleModule} */
export const noAccentHoverRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow primary-accent hover utilities on neutral surfaces.',
    },
    messages: {
      violation:
        '`{{found}}` colours a hover with the accent. Hover and selection stay achromatic: use the neutral hover tokens (`hover:bg-accent`, `hover:border-foreground/20`, `hover:text-foreground`) (Page Composition Policy, Rule 8).',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      const match = ACCENT_HOVER.exec(text);
      if (match !== null) {
        context.report({ node, messageId: 'violation', data: { found: match[0] } });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node, node.value);
        }
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
