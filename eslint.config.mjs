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
 * (`packages/*`, `packages/kernels/*`, `libs/*`, `apps/*`, `apps/libs/*`, `examples/*`,
 * `scripts`), so
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
  absorbChildren(path.join(root, 'packages/kernels'));
  absorbChildren(path.join(root, 'libs'));
  absorbChildren(path.join(root, 'apps'));
  absorbChildren(path.join(root, 'apps/libs'));
  absorbChildren(path.join(root, 'examples'));
  if (fs.existsSync(path.join(root, 'scripts/package.json'))) {
    directories.add(path.join(root, 'scripts'));
  }

  return [...directories];
};

const dreiDeepJsImportRestriction = {
  group: ['@react-three/drei/*/*.js'],
  allowTypeImports: true,
  message:
    'Do not value-import Drei deep .js modules from app code. Netlify SSR can classify typeless Drei .js files as CommonJS; import from the Drei barrel or a direct dependency instead. See docs/research/netlify-drei-camera-controls-ssr-crash.md.',
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
    /*
     * A name that cannot be written as a bare identifier is not an identifier,
     * so identifier casing does not apply to it. The redundant always-true
     * `filter` is load-bearing: `naming-convention` ranks a config carrying a
     * filter above one carrying only modifiers, so without it the quoted-name
     * exemption loses to the `strictCamelCase` entry above for any quoted key
     * that happens to contain neither a hyphen nor a space (`'files[0]'`).
     */
    selector: ['classProperty', 'objectLiteralProperty'],
    format: null,
    modifiers: ['requiresQuotes'],
    filter: { regex: '.', match: true },
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
      '**/dist-*',
      '**/coverage/',
      '**/.cache',
      '**/build',
      '**/.next/**',
      '**/.next-*/**',
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
      // Symlink twin of libs/tau-examples/.agents/skills — linting it would
      // double-lint the same files.
      '**/.claude/skills/**',
      // Generated kernel-API reference (greppable .d.ts) — carries its own
      // oxlint/eslint disable banner and lives in no tsconfig project.
      '**/.agents/skills/*/references/*.d.ts',
      '**/reports/**',
      // GeoSpec fixture generation scripts are verbatim-normative model-code
      // inputs run through the runtime VM (see fixtures/README.md), not
      // library sources — same class as prompt examples and experiments.
      'packages/geospec-engine/fixtures/scripts/**',
      // Opt-in benchmark experiments: engine-internal, unpublished, and outside
      // the package tsconfig until PE2 rebuilds what they measure.
      'packages/geospec-engine/experiments/**',
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
            'examples/electron/electron.vite.config.ts',
            'apps/api/vitest.config.ts',
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
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:lib',
                'type:app-lib',
                'type:examples',
                'type:package-root',
                'type:package-veneer',
              ],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:lib',
                'type:app-lib',
                'type:package-root',
                'type:package-veneer',
              ],
            },
            {
              /*
               * Shared libraries may consume published packages. `tau-examples`
               * and `chat` both do: a tool contract that describes kernel
               * results necessarily speaks the runtime's issue vocabulary.
               * `type:app-lib` is deliberately absent here and from every other
               * allowlist except `type:app`, `type:ui`, and `type:e2e` — that
               * omission is what stops a published package or shared library
               * from consuming private application code.
               */
              sourceTag: 'type:lib',
              onlyDependOnLibsWithTags: ['type:lib', 'type:package-root', 'type:package-veneer'],
            },
            {
              // Private application capabilities under `apps/libs/*`.
              sourceTag: 'type:app-lib',
              onlyDependOnLibsWithTags: ['type:app-lib', 'type:lib', 'type:package-root', 'type:package-veneer'],
            },
            {
              sourceTag: 'type:package-root',
              onlyDependOnLibsWithTags: ['type:package-root', 'type:package-veneer', 'type:lib'],
            },
            {
              sourceTag: 'type:package-veneer',
              onlyDependOnLibsWithTags: ['type:package-root'],
            },
            {
              // Example projects (fixtures) depend on libs they demonstrate —
              // geospec for `.geospec.ts` suites, runtime for export scripts.
              sourceTag: 'type:examples',
              onlyDependOnLibsWithTags: ['type:lib', 'type:examples', 'type:package-root', 'type:package-veneer'],
            },
            {
              // E2e/regression packages sit at the top of the graph and may
              // consume anything they exercise: apps, ui, libs, and examples.
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [
                'type:app',
                'type:ui',
                'type:lib',
                'type:app-lib',
                'type:examples',
                'type:package-root',
                'type:package-veneer',
              ],
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
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/**/*.{spec,test,config,setup}.{ts,tsx}'],
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
    /*
     * Tau examples are authored as portable, editor-loadable fixture trees.
     * Multi-file examples must keep local relative imports instead of Tau-only
     * package aliases, so they intentionally opt out of the workspace absolute
     * import and extension requirements.
     */
    files: ['libs/tau-examples/src/kernels/**/*.ts'],
    rules: {
      'import-x/extensions': 'off',
      'import-x/consistent-type-specifier-style': 'off',
      'no-restricted-imports': 'off',
      'unicorn/prefer-export-from': 'off',
      '@typescript-eslint/naming-convention': 'warn',
    },
  },

  {
    /*
     * Opencascade.js mirrors OCCT/Emscripten C++ binding names. Factory-like
     * entry points and generated constructors intentionally do not follow
     * JavaScript's capitalisation heuristics.
     */
    files: ['libs/tau-examples/src/kernels/opencascade/**/*.ts'],
    rules: {
      'new-cap': 'off',
    },
  },

  {
    /*
     * Tau example GeoSpec files are executable validation fixtures. They import
     * the GeoSpec runner by design, while `tau-examples` is also consumed by the
     * runtime benchmark/test graph; this is not a production source dependency.
     */
    files: ['libs/tau-examples/src/**/*.geospec.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
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
     * Cross-framework E2E fixtures are standalone consumer applications
     * compiled independently by Next.js, Vite, and Electron Vite. Their
     * portable local imports follow each host bundler rather than Tau's
     * production-app `#alias` and emitted `.js` conventions.
     */
    files: ['apps/react-e2e/**/*.{ts,tsx}'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
      'import-x/extensions': 'off',
    },
  },

  {
    /*
     * Electron renderer: `declare global { interface Window { … } }` is the
     * correct TypeScript merge pattern; ESLint `consistent-type-definitions`
     * would force `type` and breaks augmentation.
     */
    files: ['examples/electron/src/renderer/app.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },

  {
    /*
     * Electron example: a small standalone app shell that mixes
     * SCREAMING_SNAKE_CASE constants (glTF magic numbers) with React
     * components, making the workspace's strict naming-convention contract
     * an awkward fit. The example is non-shipping, so we relax the rule
     * mirror-style to `libs/tau-examples`.
     */
    files: ['examples/electron/**/*.{ts,tsx}'],
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
    // Compile-only documentation fixtures intentionally model consumer imports outside the Nx graph.
    files: ['apps/ui/content/docs/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // The MDX boundary rule consumes runtime's canonical private-library tuple.
    files: ['libs/oxlint/src/rules/validate-mdx-codeblocks.js'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },

  {
    /*
     * Static `new URL(literal, import.meta.url)` invariant: every WASM/font/plugin
     * chunk shipped from `@taucad/runtime` must use a
     * string-literal first arg so consumer bundlers (Vite/Rolldown, Webpack 5,
     * Parcel 2, esbuild) lift the asset to a hashed URL during build.
     * See docs/research/runtime-zero-config-bundling.md (Finding 1, R5).
     */
    files: ['packages/runtime/src/**/*.{ts,tsx}'],
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

  {
    files: ['apps/ui/**/*.{ts,tsx}', 'libs/**/*.{ts,tsx}', 'packages/runtime/**/*.{ts,tsx}'],
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
      'tau-lint/no-handrolled-fanout': 'error',
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
   * Quarantine SSR-hostile runtime imports from shared app modules.
   *
   * `monaco-editor/esm/*` transitively imports `codicon/codicon.css`, which
   * Node's ESM loader cannot resolve during the React Router v7 SSR build
   * (`react-router build` → Rolldown). The only way to keep that subgraph
   * out of `build/server` is to confine every static value import of
   * `monaco-editor` to a `*.client.{ts,tsx}` module — React Router v7
   * replaces those modules with empty exports during the server build,
   * terminating the static graph at the boundary.
   *
   * Drei deep `.js` value imports have a similar runtime hazard on Netlify
   * functions when the package lacks `"type": "module"` / `exports`.
   *
   * Type-only imports are erased at compile time and remain legal everywhere.
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
            dreiDeepJsImportRestriction,
          ],
        },
      ],
    },
  },

  {
    files: [
      'apps/ui/app/**/*.client.ts',
      'apps/ui/app/**/*.client.tsx',
      'apps/ui/app/**/*.worker.ts',
      'apps/ui/app/**/*.worker.tsx',
      'apps/ui/app/**/*.test.ts',
      'apps/ui/app/**/*.test.tsx',
      'apps/ui/app/**/*.spec.ts',
      'apps/ui/app/**/*.spec.tsx',
      'apps/ui/app/**/*.test-d.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [dreiDeepJsImportRestriction],
        },
      ],
    },
  },
];

export default config;
