/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** The shared overlay layer: popovers, tooltips, menus, dialogs, drawers and sheets all sit on `z-50`. */
const OVERLAY_LAYER = 50;

/**
 * A Tailwind z-index utility, with any variant prefix and `!` important marker: `z-60`, `z-[100]`, `md:z-70`,
 * `!z-101`, `z-101!`. Negative values (`-z-10`) and arbitrary non-integers (`z-(--layer)`) are not matched.
 */
const Z_INDEX = /(?<![\w-])!?z-(?:(\d+)|\[(\d+)\])!?(?![\w\]-])/gu;

/**
 * Disallow z-index utilities above the shared overlay layer.
 *
 * Overlays share `z-50` and stack by open order: each portals to the end of `<body>` as it opens, so what opened last
 * paints on top. A surface raised above that layer makes everything opened from it rise too, one call site at a time,
 * and the one that is missed opens behind it.
 *
 * @type {RuleModule}
 */
export const noRaisedOverlayLayerRule = {
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow z-index utilities above the shared overlay layer (z-${OVERLAY_LAYER}).`,
    },
    messages: {
      violation:
        '`{{found}}` is above the shared overlay layer (z-' +
        String(OVERLAY_LAYER) +
        '). Overlays stack by open order on one layer; a raised surface forces everything opened from it to be raised too.',
    },
    schema: [],
  },
  create(context) {
    /** @param {import('estree').Node & { range?: [number, number] }} node */
    const check = (node) => {
      const source = context.sourceCode.getText(node);
      for (const match of source.matchAll(Z_INDEX)) {
        const value = Number(match[1] ?? match[2]);
        if (value <= OVERLAY_LAYER) {
          continue;
        }
        const start = (node.range ?? [0])[0] + match.index;
        context.report({
          node,
          loc: {
            start: context.sourceCode.getLocFromIndex(start),
            end: context.sourceCode.getLocFromIndex(start + match[0].length),
          },
          messageId: 'violation',
          data: { found: match[0] },
        });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node);
        }
      },
      TemplateElement(node) {
        check(node);
      },
    };
  },
};
