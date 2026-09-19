/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').Node} Node
 */

/**
 * Allowlisted suffix endings (matched case-sensitively). Any identifier
 * whose tail equals one of these — including prefixed variants like
 * `oldMtimeMs` — is permitted. These are bound to external contracts we
 * cannot rename:
 * - Node.js `fs.Stats` time fields (`mtimeMs`, `atimeMs`, `ctimeMs`,
 *   `birthtimeMs`) and any prefixed copy thereof.
 * - Persisted JSON contracts read by dashboards / runbooks / CI:
 *   `responseTimeMs` (health endpoint), benchmark report fields
 *   (`durationMs`, `totalDurationMs`, `totalMs`, `medianMs`, `meanMs`,
 *   `p95Ms`, `p99Ms`, `minMs`, `maxMs`, `stddevMs`).
 * - Chat schema reasoning-timing fields under `providerMetadata.common`
 *   (`reasoningStartedAtMs`, `reasoningEndedAtMs`, `firstTokenAtMs`,
 *   `startedAtMs`, `endedAtMs`) — stamped server-side, persisted in
 *   IndexedDB, and round-tripped through the AI SDK reducer; renaming
 *   breaks the wire format. See
 *   `libs/chat/src/schemas/common-reasoning-metadata.schema.ts`
 *   and `docs/research/reasoning-duration-display.md`.
 * - Internal benchmark formatter `formatMs(n: number): string` whose
 *   suffix participates in the API name (formatter for milliseconds).
 *
 * Anything else with an `Ms` suffix should be renamed and the unit
 * documented via JSDoc instead. See `docs/policy/jsdoc-policy.md`
 * "Time Units in JSDoc".
 */
const ALLOWED_MS_SUFFIXES = [
  // Node.js fs.Stats — stdlib field names (and prefixed copies).
  'atimeMs',
  'mtimeMs',
  'ctimeMs',
  'birthtimeMs',
  // Persisted JSON payload contracts.
  'responseTimeMs',
  'durationMs',
  'totalDurationMs',
  'totalMs',
  'medianMs',
  'meanMs',
  'minMs',
  'maxMs',
  'p95Ms',
  'p99Ms',
  'stddevMs',
  // Chat schema reasoning-timing fields (providerMetadata.common).
  'reasoningStartedAtMs',
  'reasoningEndedAtMs',
  'firstTokenAtMs',
  'startedAtMs',
  'endedAtMs',
  // Internal benchmark report formatter.
  'formatMs',
];

/** Identifiers ending in `Ms` at a PascalCase boundary (preceded by a lowercase letter). */
const MS_SUFFIX = /(?<![A-Za-z])[a-z][\dA-Za-z]*?Ms$/;

/**
 * @param {string} name
 * @returns {boolean}
 */
const isAllowlisted = (name) => {
  for (const suffix of ALLOWED_MS_SUFFIXES) {
    if (name === suffix) {
      return true;
    }
    // Allow prefixed PascalCase forms (e.g. `oldMtimeMs`, `previousMtimeMs`):
    // capitalise the suffix's first letter and look for it at the end of
    // `name`, requiring a lowercase/digit boundary char immediately before it.
    const pascalSuffix = (suffix[0] ?? '').toUpperCase() + suffix.slice(1);
    if (
      name.length > pascalSuffix.length &&
      name.endsWith(pascalSuffix) &&
      /[\da-z]/.test(name[name.length - pascalSuffix.length - 1] ?? '')
    ) {
      return true;
    }
  }
  return false;
};

/**
 * @param {string} name
 * @returns {boolean}
 */
// oxlint-disable-next-line tau-lint/no-time-unit-suffix -- this is the test for the same rule
const looksLikeTimeMs = (name) => {
  if (isAllowlisted(name)) {
    return false;
  }
  return MS_SUFFIX.test(name);
};

/** @type {RuleModule} */
export const noTimeUnitSuffixRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow `Ms` suffix on identifiers — all time-valued identifiers are milliseconds by convention. ' +
        'Document the unit via JSDoc (`/** Milliseconds. */`) instead. ' +
        'Allowlist covers Node.js `fs.Stats` (`mtimeMs`, etc.) and persisted JSON payload contracts ' +
        '(`responseTimeMs`, `durationMs`, `totalDurationMs`). See `docs/policy/jsdoc-policy.md` "Time Units in JSDoc".',
    },
    messages: {
      msSuffix:
        "Identifier '{{name}}' uses the banned `Ms` suffix. " +
        'Rename it to drop the suffix (all times are milliseconds by convention) and document the unit ' +
        'via JSDoc `/** Milliseconds. */` at the declaration site. ' +
        'See docs/policy/jsdoc-policy.md "Time Units in JSDoc" for the rationale and allowlist.',
    },
    schema: [],
  },
  create(context) {
    /** @param {Node & { name?: string }} node */
    const checkIdentifier = (node) => {
      const { name } = node;
      if (typeof name !== 'string') {
        return;
      }
      if (!looksLikeTimeMs(name)) {
        return;
      }
      context.report({ node, messageId: 'msSuffix', data: { name } });
    };

    return {
      // Variable / function / parameter declarations.
      'VariableDeclarator > Identifier.id': checkIdentifier,
      'FunctionDeclaration > Identifier.id': checkIdentifier,
      'ClassDeclaration > Identifier.id': checkIdentifier,
      // Function/method parameters.
      'FunctionDeclaration > Identifier.params': checkIdentifier,
      'FunctionExpression > Identifier.params': checkIdentifier,
      'ArrowFunctionExpression > Identifier.params': checkIdentifier,
      // Object/type literal property keys.
      'Property[computed=false] > Identifier.key': checkIdentifier,
      'PropertyDefinition[computed=false] > Identifier.key': checkIdentifier,
      'MethodDefinition[computed=false] > Identifier.key': checkIdentifier,
      // TypeScript type members.
      'TSPropertySignature[computed=false] > Identifier.key': checkIdentifier,
      'TSMethodSignature[computed=false] > Identifier.key': checkIdentifier,
      // TypeScript declarations.
      'TSTypeAliasDeclaration > Identifier.id': checkIdentifier,
      'TSInterfaceDeclaration > Identifier.id': checkIdentifier,
      'TSEnumDeclaration > Identifier.id': checkIdentifier,
      'TSEnumMember > Identifier.id': checkIdentifier,
    };
  },
};
