import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,

  // Build output is not a source of truth. Knip follows published `exports`
  // fields into `dist/`, so a built tree reports every emitted file and export
  // as unused (~970 phantom issues locally). CI checks out fresh and never
  // builds before the knip job, so this only ever bit local runs.
  ignore: ['**/dist/**', '**/build/**'],

  rules: {
    optionalPeerDependencies: 'off',
    duplicates: 'off',
  },

  // ponytail: kept literal — deriving from `type:tool` would also ignore libs/oxlint, libs/vite and scripts
  // (which has its own `workspaces` entry below) and lose knip coverage; see mdx-package-boundary blueprint R2 status.
  // Named one by one rather than as `tools/*`: knip turns each ignored workspace pattern into a negated
  // project glob (`tools/*` → `!tools/**`), which also hid `tools/pkgcheck.ts` — and with it every
  // dependency that file is the only consumer of — from the root workspace.
  ignoreWorkspaces: ['tools/nx', 'tools/workspace-plugin', 'libs/api-extractor', 'libs/tau-examples'],

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
      entry: ['tools/*.ts'],
      project: ['**/*.{ts,tsx,mts}'],
      ignore: ['.agents/skills/create-repo/templates/**', 'tarballs/**', 'tools/eslint-fixtures/**'],
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
      entry: ['app/routes/**/*.tsx', 'app/types/**/*.d.ts', 'vite-environment.d.ts', 'content/docs/**/*.{ts,tsx}'],
      ignore: ['public/**'],
    },
    scripts: {
      entry: ['src/**/*.{ts,tsx,mts}'],
    },
  },
};

export default config;
