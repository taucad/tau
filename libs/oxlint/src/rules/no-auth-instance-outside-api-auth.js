/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * Better Auth endpoints that use a plain session middleware accept a cached session snapshot, so Tau code reaches
 * Better Auth with request headers through two choke points only: `SessionResolver` and `BetterAuthService` (auth
 * session cookie blueprint D2). The instance token is not exported from `@taucad/api-auth`, so Nest refuses the
 * injection; this rule is the second check. It reports the token's string literal and any import of the test
 * doubles subpath in production source outside `apps/libs/api-auth`.
 */
// oxlint-disable-next-line tau-lint/no-auth-instance-outside-api-auth -- the rule names the token it reports.
const instanceToken = 'authInstanceKey';
const testingSubpath = '@taucad/api-auth/testing';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isTestingSource = (value) =>
  typeof value === 'string' && (value === testingSubpath || value.startsWith(`${testingSubpath}/`));

/**
 * @param {string} filename
 * @returns {boolean}
 */
const isExempt = (filename) => {
  const path = filename.replaceAll('\\', '/');
  return (
    path.includes('/apps/libs/api-auth/') ||
    path.startsWith('apps/libs/api-auth/') ||
    /\.(?:test|spec|test-d)\.[cm]?[jt]sx?$/u.test(path) ||
    // Test harnesses and fixtures: `app/testing/**` and `src/testing/**` subtrees.
    /(?:^|\/)testing\//u.test(path)
  );
};

/** @type {RuleModule} */
export const noAuthInstanceOutsideApiAuthRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep the Better Auth instance token and the api-auth test doubles inside api-auth and tests.',
    },
    messages: {
      instanceToken:
        "Do not reach the Better Auth instance ('authInstanceKey') outside api-auth: use SessionResolver or a named BetterAuthService method, which remove the session snapshot.",
      testingImport: "'@taucad/api-auth/testing' and its subpaths hold test doubles; import them only from tests.",
    },
    schema: [],
  },
  create(context) {
    if (isExempt(context.filename)) {
      return {};
    }
    /** @param {import('estree').Node & { source?: { value?: unknown } | null }} node */
    const checkSource = (node) => {
      if (isTestingSource(node.source?.value)) {
        context.report({ node, messageId: 'testingImport' });
      }
    };
    return {
      Literal(node) {
        if (node.value === instanceToken) {
          context.report({ node, messageId: 'instanceToken' });
        }
      },
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis[0]?.value.cooked === instanceToken) {
          context.report({ node, messageId: 'instanceToken' });
        }
      },
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ImportExpression(node) {
        if (node.source.type === 'Literal' && isTestingSource(node.source.value)) {
          context.report({ node, messageId: 'testingImport' });
        }
      },
    };
  },
};
