/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * The host attachment reliability blueprint's HA-I8: a chat's recovery copy speaks only of physical residuals, each
 * with an action, and never of the machinery underneath. It never says "host", "attach" or "connection failed", and
 * it never says the connection-model sentences HA5 retired (the U21 pair: "Tau stopped responding", "Tau cannot tell
 * whether this turn started"; U8's "another host" and "original host"; "could not attach", "agent host could not be
 * reached"). "Git host" stays the one product phrase that keeps the word (revisions policy Rule 1).
 *
 * Scoped in `.oxlintrc.json` to the chat's recovery surfaces. Only authored copy is checked: string and template
 * literals and JSX text. Identifiers, object keys, import paths and type positions are code, not copy.
 */
const BANNED_PATTERNS = [
  /\b(?<!git )hosts?\b/iu,
  /\battach(?:ment)?s? (?:failed|lost)\b/iu,
  /\b(?:could ?n[o’']t|can[o’']t|cannot|failed to) (?:be )?attach(?:ed)?\b/iu,
  /\bconnection (?:failed|was refused)\b/iu,
  /\bstopped responding\b/iu,
  /\bcannot tell whether\b/iu,
];

const bannedPhrase = (text) => {
  for (const pattern of BANNED_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) {
      return match[0];
    }
  }
  return undefined;
};

/** Literals that are code positions rather than copy: import sources, object keys and TS literal types. */
const isCodePosition = (node) => {
  const { parent } = node;
  if (parent === undefined || parent === null) {
    return false;
  }
  if (
    parent.type === 'ImportDeclaration' ||
    parent.type === 'ExportNamedDeclaration' ||
    parent.type === 'ExportAllDeclaration' ||
    parent.type === 'ImportExpression' ||
    parent.type === 'TSLiteralType' ||
    parent.type === 'TSExternalModuleReference'
  ) {
    return true;
  }
  return (
    (parent.type === 'Property' || parent.type === 'PropertyDefinition') && parent.key === node && !parent.computed
  );
};

/** @type {RuleModule} */
export const noSystemicChatCopyRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban host, attach and connection-model sentences in chat recovery copy (HA-I8).',
    },
    messages: {
      violation:
        '"{{phrase}}" describes the machinery, not what the person sees. Chat recovery copy names a physical residual and its action (HA-I8): where the turns are ("on Studio Mac"), what is missing, and Reload, Resume, Pair, New chat or Send here instead — never host, attach or a connection failure.',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      const phrase = bannedPhrase(text);
      if (phrase !== undefined) {
        context.report({ node, messageId: 'violation', data: { phrase } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string' && !isCodePosition(node)) {
          check(node, node.value);
        }
      },
      TemplateLiteral(node) {
        check(node, node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(' '));
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
