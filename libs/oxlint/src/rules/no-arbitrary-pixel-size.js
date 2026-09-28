/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** `w-[180px]`, `min-h-[300px]`, `hover:size-[24px]`: a fixed pixel box outside the spacing scale. */
const ARBITRARY_PIXEL_SIZE = /(?<![\w-])((?:min-|max-)?(?:w|h|size))-\[(\d+(?:\.\d+)?)px\]/gu;

/** One spacing step is 4 px (`--spacing: 0.25rem`), so a multiple of 4 has an exact utility. */
const SPACING_STEP = 4;

/** @type {RuleModule} */
export const noArbitraryPixelSizeRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Replace arbitrary pixel widths, heights and sizes with spacing utilities.',
    },
    fixable: 'code',
    messages: {
      spacing: 'Use `{{suggestion}}` instead of `{{found}}` (Page Composition Policy, Rule 3).',
      offGrid:
        '`{{found}}` is off the 4 px spacing grid: size the element by its content, use a spacing utility or `w-px`/`h-px`, or explain the exception in a disable comment (Page Composition Policy, Rule 3).',
    },
    schema: [],
  },
  create(context) {
    const check = (node) => {
      const source = context.sourceCode.getText(node);
      for (const match of source.matchAll(ARBITRARY_PIXEL_SIZE)) {
        const [found, utility, pixels] = match;
        const start = node.range[0] + match.index;
        const loc = {
          start: context.sourceCode.getLocFromIndex(start),
          end: context.sourceCode.getLocFromIndex(start + found.length),
        };
        const steps = Number(pixels) / SPACING_STEP;
        if (!Number.isInteger(steps)) {
          context.report({ node, loc, messageId: 'offGrid', data: { found } });
          continue;
        }
        const suggestion = `${utility}-${steps}`;
        context.report({
          node,
          loc,
          messageId: 'spacing',
          data: { found, suggestion },
          fix: (fixer) => fixer.replaceTextRange([start, start + found.length], suggestion),
        });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node);
        }
      },
      TemplateElement: check,
    };
  },
};
