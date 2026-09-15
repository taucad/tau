import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,

  // Build output is not a source of truth. Knip follows published `exports`
  // fields into `dist/`, so a built tree reports every emitted file and export
  // as unused (~970 phantom issues locally). CI checks out fresh and never
  // builds before the knip job, so this only ever bit local runs.
  // `src/generated/**` holds committed Nx target outputs (325 files under
  // libs/api-extractor alone). Like `dist/`, they are emitted, not authored, so
  // every one reports as an unused file. `.oxfmtrc.json` already skips them.
  ignore: ['**/dist/**', '**/build/**', '**/generated/**'],

  rules: {
    optionalPeerDependencies: 'off',
    duplicates: 'off',
  },

  // ponytail: kept literal — deriving from `type:tool` would also ignore libs/oxlint, libs/vite and scripts
  // (which has its own `workspaces` entry below) and lose knip coverage; see mdx-package-boundary blueprint R2 status.
  // Named one by one rather than as `tools/*`: knip turns each ignored workspace pattern into a negated
  // project glob (`tools/*` → `!tools/**`), which also hid `tools/pkgcheck.ts` — and with it every
  // dependency that file is the only consumer of — from the root workspace.
  ignoreWorkspaces: ['tools/nx', 'tools/workspace-plugin', 'libs/tau-examples'],

  vitest: {
    config: ['vitest.config.{js,ts}', 'vite.config.{js,ts}'],
  },

  ignoreBinaries: ['fly', 'docker-compose'],

  ignoreDependencies: [
    'oxlint',
    'oxlint-tsgolint',
    'copy-files-from-to',
    // ESLint plugins loaded via .oxlintrc.json (not traceable by Knip)
    '@eslint-community/eslint-plugin-eslint-comments',
    '@protontech/eslint-plugin-enforce-uint8array-arraybuffer',
    'eslint-plugin-jsdoc',
    'eslint-plugin-n',
    'eslint-plugin-no-barrel-files',
    'eslint-plugin-no-use-extend-native',
    'eslint-plugin-unicorn',
    'eslint-plugin-react',
    // Workspace protocol references needed by pnpm
    '@taucad/chat',
    '@taucad/filesystem',
    '@taucad/fs-client',
    '@taucad/utils',
    // Loaded by Nx plugin or build tooling, not direct imports
    '@typescript/native-preview',
    '@tailwindcss/typography',
  ],

  workspaces: {
    '.': {
      // The workspace-root scripts Nx targets and build configs run; `pkgcheck.ts`
      // is the only consumer of `@taucad/nx`, `madge`, and `@types/madge`.
      // `apps/*-e2e` (all but runtime-e2e) carry no package.json, so they are not
      // pnpm workspaces and their files land in this root workspace. Without the
      // runner's entry points every spec, setup and helper reports unused, along
      // with everything they export (~128 files, ~72 exports).
      entry: [
        'tools/*.ts',
        'apps/*-e2e/**/*.spec.{ts,tsx,mts}',
        'apps/*-e2e/**/*.config.{ts,mts}',
        'apps/*-e2e/global-setup.ts',
      ],
      project: ['**/*.{ts,tsx,mts}'],
      ignore: [
        // `.claude/skills` is a discovery alias for `.agents/skills`; scanning
        // through it re-reports the same tree at a path no ignore rule matches.
        '.claude/skills/**',
        '.agents/skills/create-repo/templates/**',
        'tarballs/**',
        'tools/eslint-fixtures/**',
      ],
      ignoreDependencies: [
        'replicad-opencascadejs',
        'libcascade',
        '@arethetypeswrong/cli',
        '@nx/nest',
        '@nx/node',
        '@nx/web',
        '@nx/webpack',
        '@nestjs/schematics',
      ],
    },
    'apps/api': {
      entry: [
        'app/main.ts',
        'app/api/**/*.module.ts',
        'app/database/**/*.ts',
        'app/telemetry/**/*.ts',
        'app/types/**/*.d.ts',
        'scripts/*.mts',
        'vitest.integration.config.ts',
      ],
    },
    'apps/ui': {
      entry: ['app/routes/**/*.tsx', 'app/types/**/*.d.ts', 'vite-environment.d.ts'],
      ignore: ['public/**'],
    },
    'apps/docs': {
      entry: ['app/routes/**/*.{ts,tsx}', 'vite-environment.d.ts'],
      // Content-side modules are referenced from MDX (auto-type-table props,
      // worker examples) and server-compat is wired through a vitest alias —
      // neither is a reference knip can follow.
      ignore: ['content/**', 'app/lib/fumadocs/server-compat.ts'],
      // Kernel and runtime packages are imported by MDX code samples and by the
      // type generator behind auto-type-table.
      ignoreDependencies: ['@taucad/*'],
    },
    'packages/ui': {
      // A design system publishes its whole surface; consumption by the apps in
      // this repo is not what makes a component reachable.
      entry: ['src/**/*.{ts,tsx}'],
    },
    scripts: {
      entry: ['src/**/*.{ts,tsx,mts}'],
    },
  },
};

export default config;
