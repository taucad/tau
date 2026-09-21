/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * Revisions policy Rule 1 bans checkout, lease, backend, worktree, ref and HEAD as product
 * vocabulary. `HEAD` is matched uppercase only, so "the head of the list" stays legal prose.
 */
const BANNED_PATTERN = /\b(?:checkouts?|lease[sd]?|backends?|worktrees?|refs?)\b/iu;
const BANNED_HEAD_PATTERN = /\bHEAD\b/u;

/** Property names inside a toast options object that a person reads. */
const COPY_PROPERTIES = new Set(['title', 'description']);

const bannedWord = (text) => BANNED_PATTERN.exec(text)?.[0] ?? BANNED_HEAD_PATTERN.exec(text)?.[0];

const isToastCall = (node) =>
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'toast';

const propertyName = (node) => {
  if (node.key.type === 'Identifier' && !node.computed) {
    return node.key.name;
  }
  return node.key.type === 'Literal' && typeof node.key.value === 'string' ? node.key.value : undefined;
};

/** @type {RuleModule} */
export const noEngineeringVocabularyInCopyRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Flag revisions-policy Rule 1 engineering vocabulary in user-facing toast copy.',
    },
    messages: {
      violation:
        '"{{word}}" is engineering vocabulary. Revisions policy Rule 1 bans checkout, lease, backend, worktree, ref and HEAD in product copy — say Revision, Branch, Current, Restore, Switch, Merge, Discard or Sync instead.',
    },
    schema: [],
  },
  create(context) {
    /*
     * Only literal copy authored at the toast call site is checkable here; a message that arrives
     * as a variable is a refusal `code` phrased by the page's code → copy table (P4), not a string
     * this rule can trace.
     */
    const checkCopy = (node) => {
      /** One report per authored string: the first banned word is enough to send it back. */
      let text;
      if (node.type === 'Literal' && typeof node.value === 'string') {
        text = node.value;
      } else if (node.type === 'TemplateLiteral') {
        text = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(' ');
      } else {
        return;
      }
      const word = bannedWord(text);
      if (word !== undefined) {
        context.report({ node, messageId: 'violation', data: { word } });
      }
    };

    return {
      CallExpression(node) {
        if (!isToastCall(node)) {
          return;
        }
        for (const argument of node.arguments) {
          if (argument.type === 'ObjectExpression') {
            for (const property of argument.properties) {
              if (property.type === 'Property' && COPY_PROPERTIES.has(propertyName(property))) {
                checkCopy(property.value);
              }
            }
            continue;
          }
          checkCopy(argument);
        }
      },
    };
  },
};
