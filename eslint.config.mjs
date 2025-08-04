import xo from 'xo';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import nxEslintPlugin from '@nx/eslint-plugin';
import noBarrelFilesPlugin from 'eslint-plugin-no-barrel-files';

/**
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  // Global ignores - same patterns as .gitignore
  {
    ignores: [
      // From root .gitignore
      '**/vite.config.{js,ts,mjs,mts,cjs,cts}.timestamp*',
      'node_modules',
      '.nx/cache',
      '.nx/workspace-data',
      '**/dist',
      '**/coverage/',
      '**/.cache',
      '**/build',
      '**/public/build',
      '**/public/entry.worker.js',
      '**/.env',
      '**/.react-router',
      '**/stats.html',
      '**/out-tsc',
      '**/generated',
    ],
  },
  // First, apply XO's base configuration
  ...xo.xoToEslintConfig([{ space: true, react: true, prettier: 'compat' }]),
  noBarrelFilesPlugin.flat,
  eslintPluginPrettierRecommended,
  {
    // Ensure TypeScript support is properly configured
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Apply Nx plugin
    plugins: {
      '@nx': nxEslintPlugin,
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
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
    // Apply custom rules only to TypeScript files to ensure the plugin is available
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Require a description for each ESLint rule comment. This informs co-authors about the rule and why it is being applied.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],

      // Enforce that the `type` keyword is used when importing types, e.g. `import type { Foo } from './foo'`.
      // This ensures the compiler receives a hint to discard type values when they are present in import statements,
      // alongside explicit, uniform import styles.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // Ensure that import type side effects are prevented when using `verbatimModuleSyntax: true`.
      // '@typescript-eslint/no-import-type-side-effects': 'error',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      // Ensure that duplicate imports have separate lines for `type` and non-modifier imports.
      'import-x/no-duplicates': [
        'error',
        {
          'prefer-inline': false,
        },
      ],
      // Ensure imports with `type` modifier are also checked to include an extension
      'import-x/extensions': [
        'error',
        'always',
        {
          ignorePackages: true,
          checkTypeImports: true,
        },
      ],

      // Enforce explicit accessibility modifiers for class members to improve readability, maintainability and explicitness.
      '@typescript-eslint/explicit-member-accessibility': 'error',

      // Enforce that `any` is not used.
      '@typescript-eslint/no-explicit-any': [
        'error',
        {
          fixToUnknown: true,
          ignoreRestArgs: true,
        },
      ],

      // Require explicit return and argument types on exported functions' and classes' public class methods.
      // Note: This may feel cumbersome at first, especially for React components, but it is a good practice to enforce
      // type safety and readability, especially when dealing with downstream consumers who are sensitive to type changes.
      // Furthmore this rule does not expose an ignore option.
      // @see https://github.com/typescript-eslint/typescript-eslint/issues/4208
      '@typescript-eslint/explicit-module-boundary-types': [
        'error',
        {
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],

      // Enforce that unnecessary conditions are not used. This improves readability and reduces perceived cyclomatic complexity.
      // For example:
      // function bar<T>(arg: string) {
      //   // Arg can never be nullish
      //   return arg?.length; // Therefore `?.` is unnecessary
      // }
      '@typescript-eslint/no-unnecessary-condition': 'error',

      // Enforce that curly braces are used in all control flow statements. This improves readability.
      // For example:
      // if (condition) {
      //   // ...
      // }
      // instead of:
      // if (condition)
      //   // ...
      curly: ['error', 'all'],

      // Require exhaustive switch statements. This is an extra barrier again bad type unions.
      // The following is an example of how to perform an exhaustive check:
      // default: {
      //   const exhaustiveCheck: never = part;
      //   throw new Error(`Unknown part type: ${String(exhaustiveCheck)}`);
      // }
      '@typescript-eslint/switch-exhaustiveness-check': 'off',

      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['.*'],
              message:
                "Use absolute imports instead of relative imports. For example, instead of `import { hexToRgb } from './utils/color.utils'`, use `import { hexToRgb } from '#utils/color.utils'`.",
            },
          ],
        },
      ],

      // Applications and libraries can depend on workspace package.json dependencies.
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          packageDir: ['.', '../..'], // Include the '../..' path as we want to include the root package.json.
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
          includeTypes: true,
          includeInternal: true,
        },
      ],
      'n/no-extraneous-import': 'off', // Disabled as it has no monorepo support.
    },
  },
  {
    // API App
    files: ['apps/api/**/*.ts', 'apps/api/**/*.tsx'],
    rules: {
      // Support for decorators in NestJS, ensuring that the `new` keyword is not required for decorators.
      'new-cap': [
        'error',
        {
          capIsNewExceptions: [
            'Injectable',
            'Module',
            'Controller',
            'Get',
            'Post',
            'Put',
            'Delete',
            'Patch',
            'Options',
            'Head',
            'All',
            'Body',
            'Res',
            'Req',
            'Inject',
            'Global',
            'UseGuards',
            'UsePipes',
            'UseInterceptors',
            'UseFilters',
          ],
        },
      ],
    },
  },
  {
    // UI App
    files: ['apps/ui/**/*.ts', 'apps/ui/**/*.tsx'],
    rules: {
      // React is a global variable in the UI
      'react/react-in-jsx-scope': 'off',
      'react/boolean-prop-naming': [
        'error',
        { rule: '^(is|has|as|should|enable)[A-Z]([A-Za-z0-9]?)+$', validateNested: true },
      ],
      // DefaultProps is deprecated and irrelevant when using functional components.
      'react/require-default-props': 'off',
    },
  },
  {
    // Packages
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/**/*.{spec,test,config}.{ts,tsx}'], // Only lint the source files.
    rules: {
      // Packages MUST declare all their dependencies in the package.json, as they are
      // published and consumers will not have access to the monorepo.
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          packageDir: ['.'], // Exclude the '../..' path as we want to exclude the root package.json.
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
          includeTypes: true,
          includeInternal: true,
        },
      ],
    },
  },
];

export default config;
