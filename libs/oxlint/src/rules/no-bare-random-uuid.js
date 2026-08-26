/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('estree').MemberExpression} MemberExpression
 */

import path from 'node:path';

/** The one module allowed to call the Web Crypto `randomUUID` directly. */
const HELPER_FILE = 'libs/utils/src/id.utils.ts';

/** Globals whose `.crypto` member is the Web Crypto object. */
const GLOBAL_RECEIVERS = new Set(['globalThis', 'window', 'self']);

/**
 * `crypto` bare, or `<global>.crypto`.
 * @param {import('estree').Expression | import('estree').Super} node
 * @returns {boolean}
 */
function isWebCryptoObject(node) {
  if (node.type === 'Identifier') {
    return node.name === 'crypto';
  }
  return (
    node.type === 'MemberExpression' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'crypto' &&
    node.object.type === 'Identifier' &&
    GLOBAL_RECEIVERS.has(node.object.name)
  );
}

/**
 * @param {MemberExpression} node
 * @returns {boolean}
 */
function isRandomUuidMember(node) {
  return node.property.type === 'Identifier' && node.property.name === 'randomUUID' && isWebCryptoObject(node.object);
}

/** @type {RuleModule} */
export const noBareRandomUuidRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow crypto.randomUUID outside the randomUuid helper; it is secure-context-only in browsers.',
    },
    messages: {
      noBareRandomUuid:
        '`crypto.randomUUID` is undefined on plain-http non-localhost origins (secure-context-only). Use `randomUuid()` from `@taucad/utils/id`, or `import { randomUUID } from "node:crypto"` in Node-only code. See docs/research/random-uuid-insecure-context-blueprint.md.',
    },
    schema: [],
  },

  create(context) {
    const pathPosix = context.filename.split(path.sep).join('/');
    if (pathPosix.endsWith(HELPER_FILE) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(pathPosix)) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (isRandomUuidMember(node)) {
          context.report({ node, messageId: 'noBareRandomUuid' });
        }
      },
    };
  },
};
