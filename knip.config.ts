import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,

  rules: {
    optionalPeerDependencies: 'off',
    duplicates: 'off',
  },

  ignoreWorkspaces: ['tools/*', 'libs/api-extractor', 'libs/tau-examples'],

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
      project: ['**/*.{ts,tsx,mts}'],
      ignoreDependencies: [
        'replicad-opencascadejs',
        'libcascade',
        '@arethetypeswrong/cli',
        'madge',
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
    'libs/converter': {
      ignore: ['src/assets/**'],
      entry: ['src/types/**/*.d.ts'],
    },
    'packages/runtime': {
      entry: ['src/kernels/opencascade/opencascade.types.ts'],
    },
    scripts: {
      entry: ['src/**/*.{ts,tsx,mts}'],
    },
  },
};

export default config;
