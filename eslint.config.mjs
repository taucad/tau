import fs from 'node:fs';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import nxEslintPlugin from '@nx/eslint-plugin';
import * as importXPlugin from 'eslint-plugin-import-x';
import maxParamsNoConstructorPlugin from 'eslint-plugin-max-params-no-constructor';
import tauLintPlugin from '@taucad/oxlint/tau-lint';
import { privateRuntimeDocumentPackages } from '@taucad/oxlint/private-runtime-packages';
import * as mdxParser from '@taucad/oxlint/mdx-parser';

const unlayeredTargetTypes = ['type:lib', 'type:package', 'type:tool', 'type:example'];

/**
 * Workspace root plus every workspace member directory that has a `package.json`
 * (`packages/*`, nested package groups, `libs/*`, `apps/*`, `apps/libs/*`, `examples/*`,
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
  absorbChildren(path.join(root, 'packages/plugins'));
  absorbChildren(path.join(root, 'packages/core'));
  absorbChildren(path.join(root, 'libs'));
  absorbChildren(path.join(root, 'apps'));
  absorbChildren(path.join(root, 'apps/libs'));
  for (const app of fs.readdirSync(path.join(root, 'apps'))) {
    absorbChildren(path.join(root, 'apps', app, 'apps'));
  }
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
      'out/**',
      '**/dist',
      '**/dist-*',
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
      '**/.netlify',
      '**/*.prompt.example.*',
      '**/*.prompt.example-multifile/**',
      '**/*.cjs',
      '**/*.jscad.js',
      '**/content/docs/**/props/**',
      '**/vitest.integration.config.ts',
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
      '**/package-out*/**',
      'package-out*/**',
      'apps/desktop/package-out*/**',
      'apps/desktop/resources/python/**',
      // GeoSpec fixture generation scripts are verbatim-normative model-code
      // inputs run through the runtime VM (see fixtures/README.md), not
      // library sources — same class as prompt examples and experiments.
      'packages/geospec-engine/fixtures/scripts/**',
      // Opt-in benchmark experiments: engine-internal, unpublished, and outside
      // the package tsconfig until PE2 rebuilds what they measure.
      'packages/geospec-engine/experiments/**',
      // Same class: the native OpenCascade benchmark/parity harnesses are
      // opt-in CLIs run by hand against a locally built addon and the OCCT
      // wasm bindings. They are unpublished (`files` excludes `bench/`) and
      // outside the package tsconfig.
      'packages/plugins/opencascade-native/bench/**',
      // Same class: the compute-reuse baseline harness (charter W0) is an
      // opt-in benchmark reaching runtime-internal seams through a loader
      // hook; `.mts` files outside the project tsconfig.
      'apps/runtime-e2e/src/compute-baseline/harness/**',
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
            'packages/runtime/src/nextjs/package-assets-loader.mjs',
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
          /*
           * Libraries that are deliberately lazy-loaded in one consumer and
           * statically imported in another: the UI keeps the runtime and the
           * filesystem bridge out of its initial bundle, and the CLI client
           * loads the agent host on demand, while the Node daemon, its render
           * probe and the integration tests import the same packages directly.
           * Entries are matched as regular expressions against the import
           * specifier, so `(/|$)` keeps `@taucad/runtime` from also exempting
           * `@taucad/runtime-testing`.
           */
          checkDynamicDependenciesExceptions: [
            '@taucad/runtime(/|$)',
            '@taucad/agent-host(/|$)',
            '@taucad/fs-bridge(/|$)',
          ],
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
              onlyDependOnLibsWithTags: ['type:lib', 'type:app-lib', 'type:example', 'type:package', 'type:tool'],
            },
            {
              /*
               * Shared libraries may consume published packages. `tau-examples`
               * and `chat` both do: a tool contract that describes kernel
               * results necessarily speaks the runtime's issue vocabulary.
               * `type:app-lib` is deliberately absent here and from every other
               * allowlist except `type:app` and `type:e2e` — that omission is
               * what stops a published package or shared library from consuming
               * private application code.
               */
              sourceTag: 'type:lib',
              onlyDependOnLibsWithTags: ['type:lib', 'type:package', 'type:tool'],
            },
            {
              // Private application capabilities under `apps/libs/*`.
              sourceTag: 'type:app-lib',
              onlyDependOnLibsWithTags: ['type:app-lib', 'type:lib', 'type:package', 'type:tool'],
            },
            {
              // Published packages build on other published packages, shared
              // libraries, and dev-time tooling — never on application code.
              sourceTag: 'type:package',
              onlyDependOnLibsWithTags: ['type:package', 'type:lib', 'type:tool'],
            },
            {
              // Dev-time-only projects: build configs, generators, gates.
              sourceTag: 'type:tool',
              onlyDependOnLibsWithTags: ['type:tool', 'type:lib', 'type:package', 'type:example'],
            },
            {
              // Example apps depend on what they demonstrate — geospec for
              // `.geospec.ts` suites, runtime for export scripts.
              sourceTag: 'type:example',
              onlyDependOnLibsWithTags: ['type:lib', 'type:example', 'type:package'],
            },
            {
              // E2e/regression packages sit at the top of the graph and may
              // consume anything they exercise: apps, libs, and examples.
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [
                'type:app',
                'type:lib',
                'type:app-lib',
                'type:example',
                'type:package',
                'type:tool',
              ],
            },
            {
              sourceTag: 'layer:feature',
              onlyDependOnLibsWithTags: [
                'layer:feature',
                'layer:ui',
                'layer:data-access',
                'layer:util',
                ...unlayeredTargetTypes,
              ],
            },
            {
              sourceTag: 'layer:ui',
              onlyDependOnLibsWithTags: ['layer:ui', 'layer:util', ...unlayeredTargetTypes],
            },
            {
              sourceTag: 'layer:data-access',
              onlyDependOnLibsWithTags: ['layer:data-access', 'layer:util', ...unlayeredTargetTypes],
            },
            {
              sourceTag: 'layer:util',
              onlyDependOnLibsWithTags: ['layer:util', ...unlayeredTargetTypes],
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
          // The materialized-workspace directory the north star deleted (W3d).
          // A residual one is inert — `reservedTauPathClassification` keeps any
          // unlisted `.tau` member out of revisions and out of the agent's
          // hands (P13) — but nothing in the product may name it again.
          // Both halves: a plain string and a template literal's text, which is
          // how the e2e specs spell it.
          selector: 'Literal[value=/\\.tau\\/workspaces/], TemplateElement[value.raw=/\\.tau\\/workspaces/]',
          message:
            "`.tau/workspaces` is retired. A turn is placed on its chat's checkout; leases live " +
            'at `.tau/runs/<runId>.json` and the store at `.tau/revisions`. ' +
            'See docs/architecture/workspace-filesystem-and-revisions.md (A38).',
        },
        {
          // The three modules S43 deleted, by name: the Jujutsu adapter, the
          // wasm revision algebra and the multipart publication upload. A
          // module path is a string, so this is the string half of the pin
          // below — an import, a dynamic import, a mock path or a test fixture
          // that names one of them fails here. (Comments are not AST nodes, so
          // the two prose mentions of the algebra spike in `object-hash.ts` and
          // `git-objects.ts` are untouched, and so is this rule's own source:
          // this config is `.mjs` and the block only lints `.ts`/`.tsx`.)
          selector:
            'Literal[value=/(jj-adapter|revision-algebra|publish-multipart)/], TemplateElement[value.raw=/(jj-adapter|revision-algebra|publish-multipart)/]',
          message:
            'That module is retired. The disk host is `createNativeGitRevisionPort`, the browser ' +
            'store is `createIsomorphicGitRevisionPort`, and a publication is a named version of ' +
            'the synced graph — there is no jj adapter, no wasm algebra and no multipart upload. ' +
            'See docs/research/workspace-filesystem-revisions-charter.md (D11, D30, EQ14).',
        },
        {
          selector: 'TSAsExpression > TSNeverKeyword',
          message:
            '`as never` erases all type information and masks underlying type errors. ' +
            'Fix the root cause: use proper typing, type narrowing, or `as unknown as Type`. ' +
            'See docs/policy/typescript-policy.md.',
        },
        {
          // Retired by the workspace-filesystem north star (D2, D3, D30, A31).
          // Path classification is one registry, and the unreachable git code
          // is gone; no shim, alias or re-export brings either name back.
          selector: `Identifier[name=/^(${[
            // Six private path classifiers, replaced by @taucad/filesystem/path-registry.
            'isDesignPath',
            'revisionPathPolicy',
            'excludedRevisionPaths',
            'maskedDirectories',
            'isMaskedPath',
            'maskWorkspaceWrites',
            // The Jujutsu adapter and its generated per-project configuration.
            'generatedJjConfigContent',
            'generatedJjConfigPath',
            'pinnedJjRelease',
            'resolveJjExecutable',
            'createJjRevisionPort',
            // The dead native-git persistence wrapper.
            'createNativeGitRevisionPersistence',
            // Bundles as a wire; git smart HTTP is the only transport. The
            // selector is anchored, so `createBundler`/`createBundlerSourceHost`
            // in the bundler toolkits are untouched (review R3).
            'importBundle',
            'createBundle',
            'fetchBundle',
            'RevisionBundleInput',
            'ImportRevisionBundleInput',
            'CreateNativeGitBundleInput',
            'FetchNativeGitBundleInput',
            // The hand-rolled browser store, superseded by `isomorphic-git` (EQ12, W3).
            'createBrowserRevisionPort',
            'BrowserRevisionPortOptions',
            // The blob, tree and pack codec `isomorphic-git` and `git` now own.
            'encodeTreeGraph',
            'encodeTree',
            'encodeBlob',
            'decodeTree',
            'EncodedTreeGraph',
            'FlatTreeEntry',
            'GitMode',
            // Publications are named versions of the synced graph (D11): no blob
            // store of uploaded files stands beside it.
            'BlobStore',
            // The compiled wasm revision algebra and its out-of-tree artifact.
            'loadRevisionAlgebra',
            'RevisionAlgebra',
            'algebraContract',
            'algebraSourceRevision',
            'algebraProvenanceDigest',
            'algebraRawWasmSha256',
            'algebraNativeDarwinArm64Sha256',
            'resolveAlgebraArtifact',
            'algebraArtifactEnvironmentVariable',
            // The turn recorder and its branch-per-chat placement (D7, I18, W3c):
            // a turn attaches to a checkout through `turn.machine` and never
            // creates one, and the effects behind it are `createRevisionActors`.
            'TurnRevisionRecorder',
            'TurnRevisionMode',
            'turnRevisionBranch',
            'defaultTurnCaptureExclusions',
            'withTurnRevisions',
            'sweepTurnWorkspaces',
            'hostRevisionModes',
            'hostTurnCaptureExclusions',
            // The materialized workspace and its claim file (D7, A38, W3d): a
            // turn is placed on a checkout the revision root already holds,
            // there is no second copy of the tree and no claim beside it.
            'MaterializedWorkspace',
            'MaterializedWorkspaceAuthority',
            'MaterializedWorkspaceError',
            'MaterializedWorkspaceId',
            'MaterializedWorkspaceIdentity',
            'MaterializedWorkspaceMetrics',
            'MaterializedWorkspaceMode',
            'materializedWorkspaceId',
            'WorkspaceClaim',
            'PersistedChatWorkspaceClaim',
            // Revision *mode* as a wire word (D7, I18, P12): placement is
            // non-branching by default, so nothing picks one.
            'ChatRevisionMode',
            'chatRevisionModeSchema',
            'useChatRevisionMode',
            'revisionMode',
            'placementRevisionModes',
          ].join('|')})$/]`,
          message:
            'This identifier is retired. Path classification is `classify` from ' +
            '`@taucad/filesystem/path-registry`; the jj adapter, the dead native-git persistence ' +
            'wrapper, the bundle transport, the hand-rolled browser codec and the wasm revision ' +
            'algebra are deleted — the browser store is `createIsomorphicGitRevisionPort` and the ' +
            'disk host is `createNativeGitRevisionPort`. Do not reintroduce a shim or alias. ' +
            'The turn recorder, its `agent/<chat>` branches and the Node revision modes are ' +
            'replaced by `projectRevisionsMachine` over `createRevisionActors`. ' +
            'The materialized workspace, its `.tau/workspaces` claim file and the revision-mode ' +
            "wire word are gone with it: a turn is placed on its chat's checkout and the host " +
            'records the revision. ' +
            'See docs/research/workspace-filesystem-revisions-charter.md (D2, D3, D7, D30, EQ12, EQ14).',
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
    files: ['apps/docs/content/docs/**/*.mdx'],
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
    files: ['apps/docs/content/docs/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    /*
     * Runtime documentation fixtures are consumer code, so the private-package
     * boundary the MDX rule enforces inside fenced blocks applies to them too —
     * `@nx/enforce-module-boundaries` is off for these files (above) and the MDX
     * rule reads only `.mdx`, which left them checked by nothing.
     *
     * The `@typescript-eslint` variant, not the core rule: a later workspace-wide
     * TypeScript block owns the core rule's options, and these fixtures also
     * re-export types, which the base rule reports identically.
     */
    files: ['apps/docs/content/docs/runtime/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: privateRuntimeDocumentPackages.flatMap((name) => [name, `${name}/*`]),
              message:
                'Runtime documentation must import private @taucad packages through a public @taucad/runtime subpath.',
            },
          ],
        },
      ],
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
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/*.test-d.ts', '**/__tests__/**'],
    plugins: { 'tau-lint': tauLintPlugin },
    rules: {
      'tau-lint/no-monaco-create-model': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@taucad/runtime-testing',
              message:
                'Do not import `@taucad/runtime-testing` from non-test sources (it pulls Vitest into production bundles).',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/ui/**/*.{ts,tsx}', 'apps/libs/**/*.{ts,tsx}', 'libs/**/*.{ts,tsx}', 'packages/runtime/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/*.test-d.ts', '**/__tests__/**'],
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
  {
    files: ['apps/api/**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@taucad/billing/hooks/*'],
              message: 'API code must not import the React-only @taucad/billing hooks surface.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/ui/app/machines/cad.machine.ts',
      'apps/ui/app/workers/geospec-runner.impl.ts',
      'packages/runtime-testing/src/kernel-testing.utils.ts',
      'apps/runtime-e2e/src/benchmarks/**/*.{ts,tsx,mts,cts}',
    ],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@taucad/runtime$',
              allowTypeImports: true,
              message:
                'Latency-sensitive runtime consumers must use the narrowest existing @taucad/runtime subpath; root value imports add the full barrel to cold start.',
            },
          ],
        },
      ],
    },
  },
  {
    /*
     * I12: reserved engineering vocabulary may not reach operator-facing copy.
     *
     * Policy rule 1 gives each term one meaning and keeps the engineering ones
     * out of product text — a person sees Revision, Branch, Current, Restore,
     * Sync, never checkout, lease, ref, HEAD, worktree or backend. Two refusal
     * sentences in this program shipped naming a *checkout* and a *lease*, and
     * the manual "terminology scan" that was supposed to catch them is what
     * this rule replaces.
     *
     * Scoped to rendered text only: JSXText, and the handful of attributes that
     * are read aloud or shown. A prop *value* is not copy — `compareAgainst=
     * 'checkout'` and `checkoutId` are the vocabulary of the code, and flagging
     * them would make the rule noise that gets disabled. `repository` and
     * `commit` are deliberately absent: neither is reserved, and both are what
     * a person actually picks and reads on GitHub.
     */
    files: ['apps/ui/app/routes/w.$workspace.$project/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\b(checkouts?|leases?|worktrees?|backends?|refs?)\\b/i]',
          message:
            'Reserved engineering vocabulary in rendered copy (policy rule 1). Say it in product ' +
            'words: a Revision, a Branch, Current, Restore, Switch, Merge, Discard, Work in, Sync. ' +
            'See docs/policy/revisions-policy.md (rule 1) and DESIGN.md.',
        },
        {
          selector: 'JSXText[value=/\\bHEAD\\b/]',
          message:
            'HEAD is not product vocabulary (policy rule 1). Name what the person sees — the ' +
            'Current revision, or the branch it is on. See docs/policy/revisions-policy.md.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|aria-description|title|placeholder|alt|label)$/] > Literal[value=/\\b(checkouts?|leases?|worktrees?|backends?|refs?)\\b/i]',
          message:
            'Reserved engineering vocabulary in an accessible name (policy rule 1) — a screen ' +
            'reader reads this aloud, so it is copy. See docs/policy/revisions-policy.md.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|aria-description|title|placeholder|alt|label)$/] > Literal[value=/\\bHEAD\\b/]',
          message:
            'HEAD is not product vocabulary (policy rule 1), and an accessible name is read ' +
            'aloud. See docs/policy/revisions-policy.md.',
        },
      ],
    },
  },
];

export default config;
