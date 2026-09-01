import fs from 'node:fs';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import nxEslintPlugin from '@nx/eslint-plugin';
import * as importXPlugin from 'eslint-plugin-import-x';
import maxParamsNoConstructorPlugin from 'eslint-plugin-max-params-no-constructor';
import tauLintPlugin from '@taucad/oxlint/tau-lint';
import * as mdxParser from '@taucad/oxlint/mdx-parser';

/**
 * Workspace root plus every workspace member directory that has a `package.json`
 * (`packages/*`, `kernels/*`, `libs/*`, `apps/*`, `examples/*`), so
 * `import-x/no-extraneous-dependencies` resolves deps from the owning manifest.
 */
const workspacePackageDirectories = () => {
  const root = import.meta.dirname;
  const directories = new Set([root]);

  const absorbChildren = (base) => {
    try {
      for (const name of fs.readdirSync(base)) {
        if (name.startsWith('.')) {
          continue;
        }
        const candidate = path.join(base, name);
        if (!fs.statSync(candidate).isDirectory()) {
          continue;
        }
        if (!fs.existsSync(path.join(candidate, 'package.json'))) {
          continue;
        }
        directories.add(candidate);
      }
    } catch {
      // Ignore missing directories (partial checkouts, sparse fixtures).
    }
  };

  absorbChildren(path.join(root, 'packages'));
  absorbChildren(path.join(root, 'kernels'));
  absorbChildren(path.join(root, 'libs'));
  absorbChildren(path.join(root, 'apps'));
  absorbChildren(path.join(root, 'examples'));

  return [...directories];
};

/**
 * Minimal ESLint config -- only rules that cannot run in oxlint.
 *
 * Everything else (200+ rules) lives in .oxlintrc.json and runs via oxlint
 * before ESLint in the Nx lint target. Formatting is handled by oxfmt.
 */

// --- naming-convention helpers (replicate XO's config with URL/FS acronym mutations) ---

const namingConventionBase = [
  'error',
  {
    selector: [
      'variable',
      'function',
      'classProperty',
      'objectLiteralProperty',
      'parameterProperty',
      'classMethod',
      'objectLiteralMethod',
      'typeMethod',
      'accessor',
    ],
    format: ['camelCase'],
    leadingUnderscore: 'allowSingleOrDouble',
    trailingUnderscore: 'allow',
    filter: { regex: '(URL|FS)', match: true },
  },
  {
    selector: 'typeLike',
    format: ['PascalCase'],
    filter: { regex: '(URL|FS)', match: true },
  },
  {
    selector: [
      'variable',
      'function',
      'classProperty',
      'objectLiteralProperty',
      'parameterProperty',
      'classMethod',
      'objectLiteralMethod',
      'typeMethod',
      'accessor',
    ],
    format: ['strictCamelCase'],
    leadingUnderscore: 'allowSingleOrDouble',
    trailingUnderscore: 'allow',
    filter: { regex: '[- ]', match: false },
  },
  { selector: 'typeLike', format: ['StrictPascalCase'] },
  {
    selector: 'variable',
    types: ['boolean'],
    format: ['StrictPascalCase'],
    prefix: ['is', 'has', 'can', 'should', 'will', 'did'],
  },
  {
    selector: 'interface',
    filter: '^(?!I)[A-Z]',
    format: ['StrictPascalCase'],
  },
  {
    selector: 'typeParameter',
    filter: '^T$|^[A-Z][a-zA-Z]+$',
    format: ['StrictPascalCase'],
  },
  {
    selector: ['classProperty', 'objectLiteralProperty'],
    format: null,
    modifiers: ['requiresQuotes'],
  },
];

const namingConventionTsx = [
  'error',
  {
    ...namingConventionBase[1],
    format: ['camelCase', 'PascalCase'],
  },
  namingConventionBase[2],
  {
    ...namingConventionBase[3],
    format: ['strictCamelCase', 'StrictPascalCase'],
  },
  ...namingConventionBase.slice(4),
];

const memberOrdering = [
  'error',
  {
    default: [
      'signature',
      'public-static-field',
      'public-static-method',
      'protected-static-field',
      'protected-static-method',
      'private-static-field',
      'private-static-method',
      'static-field',
      'static-method',
      'public-decorated-field',
      'public-instance-field',
      'public-abstract-field',
      'public-field',
      'protected-decorated-field',
      'protected-instance-field',
      'protected-abstract-field',
      'protected-field',
      'private-decorated-field',
      'private-instance-field',
      'private-field',
      'instance-field',
      'abstract-field',
      'decorated-field',
      'field',
      'public-constructor',
      'protected-constructor',
      'private-constructor',
      'constructor',
      'public-decorated-method',
      'public-instance-method',
      'public-abstract-method',
      'public-method',
      'protected-decorated-method',
      'protected-instance-method',
      'protected-abstract-method',
      'protected-method',
      'private-decorated-method',
      'private-instance-method',
      'private-method',
      'instance-method',
      'abstract-method',
      'decorated-method',
      'method',
    ],
  },
];

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      '**/vite.config.{js,ts,mjs,mts,cjs,cts}.timestamp*',
      'node_modules',
      '.nx/cache',
      '.nx/workspace-data',
      '**/dist',
      '**/coverage/',
      '**/.cache',
      '**/build',
      '**/public/build',
      '**/public/*.js',
      '**/.env',
      '**/.react-router',
      '**/stats.html',
      '**/out-tsc',
      '**/generated',
      '**/assets',
      '**/.source/**/*',
      '**/.netlify',
      '**/*.prompt.example.*',
      '**/*.prompt.example-multifile/**',
      '**/*.cjs',
      '**/*.jscad.js',
      '**/content/docs/**/props/**',
      '**/vitest.integration.config.ts',
      'tarballs/**',
      'experiments/**',
      '**/wasm/**',
      'repos/**',
      '**/reports/**',
    ],
  },

  {
    ...tseslint.configs.base,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- parserOptions is a runtime-resolved object
    languageOptions: {
      ...tseslint.configs.base.languageOptions,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- parserOptions is a runtime-resolved object
      parserOptions: {
        ...tseslint.configs.base.languageOptions?.parserOptions,
        projectService: {
          allowDefaultProject: [
            'eslint.config.mjs',
            'examples/electron-tau/electron.vite.config.ts',
            'apps/api/vitest.config.ts',
            'apps/ui/scripts/check-ssr-bundle-budget.mts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    plugins: { '@nx': nxEslintPlugin },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: ['@taucad/runtime'],
          allowCircularSelfDependency: true,
          depConstraints: [
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:api'],
            },
            {
              sourceTag: 'scope:ui',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:ui'],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:ui', 'type:lib', 'type:examples'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:lib'],
            },
            {
              sourceTag: 'type:lib',
              onlyDependOnLibsWithTags: ['type:lib'],
            },
            {
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: ['type:app'],
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    plugins: { 'import-x': importXPlugin },
    rules: {
      '@typescript-eslint/naming-convention': namingConventionBase,
      '@typescript-eslint/member-ordering': memberOrdering,
      '@typescript-eslint/explicit-member-accessibility': 'error',
      // Enforce ES6 shorthand for object properties and methods (e.g. `{ args }` instead of `{ args: args }`).
      // TODO: Move to .oxlintrc.json once oxlint ships native `object-shorthand` (oxc-project/oxc#17688).
      'object-shorthand': ['error', 'always'],
      'id-denylist': ['error', 'temp', 'tmp', 'val', 'vals', 'obj', 'cb'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSNeverKeyword',
          message:
            '`as never` erases all type information and masks underlying type errors. ' +
            'Fix the root cause: use proper typing, type narrowing, or `as unknown as Type`. ' +
            'See docs/policy/typescript-policy.md.',
        },
      ],
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          packageDir: workspacePackageDirectories(),
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
          includeTypes: true,
        },
      ],
    },
  },

  {
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/naming-convention': namingConventionTsx,
    },
  },

  {
    files: [
      '**/*.controller.ts',
      '**/*.service.ts',
      '**/*.module.ts',
      '**/*.guard.ts',
      '**/*.gateway.ts',
      '**/*.interceptor.ts',
      '**/*.filter.ts',
      '**/*.pipe.ts',
      '**/*.provider.ts',
      '**/*.resolver.ts',
    ],
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- plugins is a runtime-resolved object
    plugins: { 'max-params-no-constructor': maxParamsNoConstructorPlugin },
    rules: {
      'max-params-no-constructor/max-params-no-constructor': ['error', 3],
    },
  },

  {
    files: ['packages/**/*.{ts,tsx}', 'kernels/**/*.{ts,tsx}'],
    ignores: ['packages/**/*.{spec,test,config,setup}.{ts,tsx}', 'kernels/**/*.{spec,test,config,setup}.{ts,tsx}'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          packageDir: workspacePackageDirectories(),
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: true,
          includeTypes: true,
          includeInternal: true,
        },
      ],
    },
  },

  {
    files: ['libs/tau-examples/src/kernels/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'warn',
    },
  },

  {
    /*
     * Standalone examples (see `.oxlintrc.json` Bucket A justification): drop
     * Tau-internal module-resolution rules (`#alias` enforcement, `.js`
     * extensions) so the examples reflect portable consumer-style code.
     */
    files: ['examples/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'import-x/extensions': 'off',
      '@typescript-eslint/naming-convention': 'warn',
    },
  },

  {
    /*
     * Electron PoC renderer: `declare global { interface Window { … } }` is the
     * correct TypeScript merge pattern; ESLint `consistent-type-definitions`
     * would force `type` and breaks augmentation.
     */
    files: ['examples/electron-tau/src/renderer/app.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },

  {
    /*
     * Electron PoC example: a small standalone app shell that mixes
     * SCREAMING_SNAKE_CASE constants (glTF magic numbers) with React
     * components, making the workspace's strict naming-convention contract
     * an awkward fit. The example is non-shipping, so we relax the rule
     * mirror-style to `libs/tau-examples`.
     */
    files: ['examples/electron-tau/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
    },
  },

  {
    files: ['apps/ui/content/docs/**/*.mdx'],
    languageOptions: { parser: mdxParser },
    plugins: { 'tau-lint': tauLintPlugin },
    rules: {
      'tau-lint/validate-mdx-codeblocks': 'error',
      'tau-lint/validate-mdx-links': 'error',
      'tau-lint/validate-mdx-external-links': 'warn', // `warn` here to prevent network errors from failing the build
      'tau-lint/no-declare-in-mdx-codeblock': 'error',
    },
  },

  {
    /*
     * Static `new URL(literal, import.meta.url)` invariant: every WASM/font/plugin
     * chunk shipped from `@taucad/runtime` and `@taucad/openscad` must use a
     * string-literal first arg so consumer bundlers (Vite/Rolldown, Webpack 5,
     * Parcel 2, esbuild) lift the asset to a hashed URL during build.
     * See docs/research/runtime-zero-config-bundling.md (Finding 1, R5).
     */
    files: ['packages/runtime/src/**/*.{ts,tsx}', 'kernels/openscad/src/**/*.{ts,tsx}'],
    plugins: { 'tau-lint': tauLintPlugin },
    rules: {
      'tau-lint/static-import-meta-url': 'error',
    },
  },

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.test-d.ts',
      '**/__tests__/**',
      'packages/runtime/src/testing/**',
    ],
    plugins: { 'tau-lint': tauLintPlugin },
    rules: {
      'tau-lint/no-monaco-create-model': 'error',
      'tau-lint/no-handrolled-fanout': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@taucad/runtime/testing',
              message:
                'Do not import `@taucad/runtime/testing` from non-test sources (it pulls Vitest into unrelated bundles). Prefer `@taucad/runtime/transport-internals` (`extractInlineFileSystem`) and opaque filesystem factories (`fromNodeFs`, `fromMemoryFs`, …).',
            },
          ],
        },
      ],
    },
  },

  /**
   * Restrict who may import the AI SDK raw `Chat` factory / shared transport.
   *
   * The blueprint (R9) collapses every UI site's per-call `body: { ... }` /
   * `metadata: { ... }` literal into a single profile-scoped chat client. The
   * raw `Chat` instance, the shared `DefaultChatTransport`, and the
   * `useActiveChatInstance` accessor live under `chat-clients/_internal/`
   * and may only be imported by:
   *
   *   1. The three profile-scoped clients (`use-cad-chat-client.ts`,
   *      `use-project-name-client.ts`, `use-commit-name-client.ts`) — these
   *      ARE the indirection layer.
   *   2. Their sibling internal modules (e.g. `name-generator-client.ts`,
   *      `shared-chat-transport.ts` itself, `use-active-chat-instance.ts`).
   *   3. `services/chat-session-store.ts` — the session store owns the
   *      live `Chat<MyUIMessage>` instances that clients consume, so it
   *      needs the factory at construction time. The store does NOT compose
   *      `body: { agent }` itself; that stays inside the chat clients.
   *
   * Any new UI site that wants to send a chat turn must add a chat-client
   * verb, not bypass via `_internal`.
   */
  {
    files: ['apps/ui/app/**/*.{ts,tsx}'],
    ignores: [
      'apps/ui/app/chat-clients/**',
      'apps/ui/app/services/chat-session-store.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/chat-clients/_internal/*', '#chat-clients/_internal/*'],
              message:
                'Do not import from `chat-clients/_internal/*`. Reach the chat wire through a profile-scoped client verb instead (`useCadChatClient`, `useProjectNameClient`, `useCommitNameClient`). See docs/research/chat-metadata-first-class-architecture.md.',
            },
          ],
        },
      ],
    },
  },

  /**
   * Quarantine `monaco-editor` runtime to `*.client.{ts,tsx}` modules.
   *
   * `monaco-editor/esm/*` transitively imports `codicon/codicon.css`, which
   * Node's ESM loader cannot resolve during the React Router v7 SSR build
   * (`react-router build` → Rolldown). The only way to keep that subgraph
   * out of `build/server` is to confine every static value import of
   * `monaco-editor` to a `*.client.{ts,tsx}` module — React Router v7
   * replaces those modules with empty exports during the server build,
   * terminating the static graph at the boundary.
   *
   * Type-only imports (`import type * as Monaco from 'monaco-editor'`) are
   * erased at compile time and remain legal everywhere.
   *
   * See docs/policy/ssr-bundle-policy.md and docs/research/ssr-bundle-audit.md.
   */
  {
    files: ['apps/ui/app/**/*.{ts,tsx}'],
    ignores: [
      'apps/ui/app/**/*.client.ts',
      'apps/ui/app/**/*.client.tsx',
      'apps/ui/app/**/*.worker.ts',
      'apps/ui/app/**/*.test.ts',
      'apps/ui/app/**/*.test.tsx',
      'apps/ui/app/**/*.spec.ts',
      'apps/ui/app/**/*.spec.tsx',
      'apps/ui/app/**/*.test-d.ts',
    ],
    rules: {
      // The `allowTypeImports` option is a `@typescript-eslint` extension to
      // the core rule — keeping `import type * as Monaco from 'monaco-editor'`
      // legal everywhere while banning value imports outside `.client` files.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['monaco-editor', 'monaco-editor/*'],
              allowTypeImports: true,
              message:
                'Static value imports of `monaco-editor` pull `languageFeatures.js` → `codicon.css` into the SSR build (Node ESM loader rejects `.css`). Put runtime monaco usage in a `*.client.ts`/`*.client.tsx` module so React Router v7 replaces it with empty exports on the server. See docs/policy/ssr-bundle-policy.md.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
