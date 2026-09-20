/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 */

/** @type {RuleModule} */
export const noConsecutiveJsdocBlankLinesRule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    docs: {
      description: 'Disallow consecutive blank lines inside JSDoc comments (at most one blank line between sections)',
    },
    messages: {
      consecutive:
        'JSDoc comment contains consecutive blank lines. At most one blank line is allowed between sections.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type !== 'Block' || !String(comment.value).startsWith('*')) {
            continue;
          }

          checkConsecutiveBlanks(context, comment);
        }
      },
    };
  },
};

const BLANK_LINE_REGEX = /^\s*\*?\s*$/;

/**
 * @param {RuleContext} context
 * @param {{ range: [number, number]; value: string }} comment
 */
function checkConsecutiveBlanks(context, comment) {
  const commentStart = Number(comment.range[0]);
  const lines = String(comment.value).split('\n');

  let lineOffset = 0;
  let previousWasBlank = false;

  for (const [index, line] of lines.entries()) {
    const lineString = String(line);
    // The first line carries the `/**` opener and the last the indent before `*/`; neither is a blank content line.
    const isBlank = index > 0 && index < lines.length - 1 && BLANK_LINE_REGEX.test(lineString);

    if (isBlank && previousWasBlank) {
      const absStart = commentStart + 2 + lineOffset;
      const absEnd = absStart + lineString.length + 1;

      context.report({
        loc: {
          start: context.sourceCode.getLocFromIndex(absStart),
          end: context.sourceCode.getLocFromIndex(Math.min(absEnd, Number(comment.range[1]))),
        },
        messageId: 'consecutive',
        fix(fixer) {
          return fixer.removeRange([absStart, Math.min(absEnd, Number(comment.range[1]))]);
        },
      });
    }

    previousWasBlank = isBlank;
    lineOffset += lineString.length + 1;
  }
}
