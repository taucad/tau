/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * History, Versions and Branch Graph blueprint, M11 (package C8): a save is a history entry and
 * has no number; a named point is a version, V1, V2, …. "Revision" and "Rev A, B, C" are
 * reserved for a release workflow, so product copy never says "revision" or `Rev` followed by
 * a digit. The engine keeps "revision" as its term in code, so the rule reads copy only:
 *
 * - JSX text, and the string a person reads in a JSX attribute (`aria-label`, `title`, …);
 * - toast copy: a `toast(…)` argument and its `title` and `description` options;
 * - every string in the two copy modules, `revision-vocabulary.ts` and `revision-failure-copy.ts`,
 *   except import sources, object keys and console diagnostics.
 */
const BANNED_PATTERNS = [/\brevisions?\b/iu, /\bRev \d/u];

/** JSX attributes whose string value a person reads or hears. */
const COPY_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
  'label',
  'note',
  'tooltip',
  'description',
  'saveLabel',
  'verb',
  'short',
]);

/** Property names inside a toast options object that a person reads. */
const COPY_PROPERTIES = new Set(['title', 'description', 'label']);

/** The two modules where every string is copy (blueprint C8). */
const COPY_MODULES = /(?:^|[\\/])revision-(?:vocabulary|failure-copy)\.tsx?$/u;

const bannedWord = (text) => {
  for (const pattern of BANNED_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) {
      return match[0];
    }
  }
  return undefined;
};

const textOf = (node) => {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral') {
    /* An interpolation reads as a digit, so `Rev ${n}` is caught as `Rev 0`. */
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('0');
  }
  return undefined;
};

/** `toast.error(…)` and the bare `toast(…)` the repo also uses. */
const isToastCall = (node) =>
  (node.callee.type === 'Identifier' && node.callee.name === 'toast') ||
  (node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'toast');

/** `console.error('[revisions]', …)` is a diagnostic, not copy. */
const isConsoleCall = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'console';

const propertyName = (node) => {
  if (node.key.type === 'Identifier' && !node.computed) {
    return node.key.name;
  }
  return node.key.type === 'Literal' && typeof node.key.value === 'string' ? node.key.value : undefined;
};

const attributeName = (node) =>
  node.name.type === 'JSXIdentifier' ? node.name.name : `${node.name.namespace.name}:${node.name.name.name}`;

/** Whether a string in a copy module is code rather than copy. */
const isCodeString = (node) => {
  const { parent } = node;
  if (parent === undefined || parent === null) {
    return false;
  }
  switch (parent.type) {
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
    case 'ExportNamedDeclaration':
    case 'ImportExpression':
    case 'TSLiteralType':
    case 'TSExternalModuleReference': {
      return true;
    }
    case 'Property': {
      return parent.key === node;
    }
    case 'MemberExpression': {
      return parent.property === node;
    }
    case 'CallExpression': {
      return isConsoleCall(parent);
    }
    default: {
      return false;
    }
  }
};

/** @type {RuleModule} */
export const noSaveRevisionInCopyRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag "revision" and `Rev` followed by a digit in product copy: JSX text, toast copy and the two revision copy modules.',
    },
    messages: {
      violation:
        '"{{word}}" names a save as a revision. A save is a history entry with no number; a named point is a version (V1, V2, …); "revision" and "Rev" are reserved for releases (M11). Say entry, change, version, History, or no noun at all.',
    },
    schema: [],
  },
  create(context) {
    const report = (node, text) => {
      const word = bannedWord(text);
      if (word !== undefined) {
        context.report({ node, messageId: 'violation', data: { word } });
      }
    };
    const checkCopy = (node) => {
      if (node.type === 'JSXExpressionContainer') {
        checkCopy(node.expression);
        return;
      }
      if (node.type === 'ConditionalExpression') {
        checkCopy(node.consequent);
        checkCopy(node.alternate);
        return;
      }
      const text = textOf(node);
      if (text !== undefined) {
        report(node, text);
      }
    };
    const isCopyModule = COPY_MODULES.test(context.filename);

    return {
      JSXText(node) {
        report(node, node.value);
      },
      JSXExpressionContainer(node) {
        /* A child expression is copy too: `{'Restored Rev 3'}` and `{`Rev ${n}`}`. */
        if (!isCopyModule && (node.parent?.type === 'JSXElement' || node.parent?.type === 'JSXFragment')) {
          checkCopy(node.expression);
        }
      },
      JSXAttribute(node) {
        if (node.value !== null && !isCopyModule && COPY_ATTRIBUTES.has(attributeName(node))) {
          checkCopy(node.value);
        }
      },
      CallExpression(node) {
        if (isCopyModule || !isToastCall(node)) {
          return;
        }
        for (const argument of node.arguments) {
          if (argument.type === 'ObjectExpression') {
            for (const property of argument.properties) {
              if (property.type === 'Property' && COPY_PROPERTIES.has(propertyName(property))) {
                checkCopy(property.value);
              }
              /* A toast action `{ label: 'Undo restore' }` is read too. */
              if (
                property.type === 'Property' &&
                propertyName(property) === 'action' &&
                property.value.type === 'ObjectExpression'
              ) {
                for (const inner of property.value.properties) {
                  if (inner.type === 'Property' && propertyName(inner) === 'label') {
                    checkCopy(inner.value);
                  }
                }
              }
            }
            continue;
          }
          checkCopy(argument);
        }
      },
      Literal(node) {
        if (isCopyModule && typeof node.value === 'string' && !isCodeString(node)) {
          report(node, node.value);
        }
      },
      TemplateLiteral(node) {
        if (isCopyModule && !isCodeString(node)) {
          report(node, textOf(node) ?? '');
        }
      },
    };
  },
};
