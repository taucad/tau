import xo from 'xo';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import nxEslintPlugin from '@nx/eslint-plugin';
import noBarrelFilesPlugin from 'eslint-plugin-no-barrel-files';
import pluginEnforceUint8ArrayArrayBuffer from '@protontech/eslint-plugin-enforce-uint8array-arraybuffer';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import maxParamsNoConstructorPlugin from 'eslint-plugin-max-params-no-constructor';

/**
 * Boolean property prefixes.
 *
 * Rules:
 * - Names MUST always use the positive form of the word, never the antonym.
 *
 * Good vs Bad Examples:
 * - isEnabled, not isDisabled
 * - isVisible, not isHidden
 * - shouldShow, not shouldHide
 * - enableButton, not disableButton
 * - makeDefault, not destroyDefault
 * - withLabel, not withoutLabel
 *
 * More Usage Examples:
 * `is`: isEnabled, isActive, isSelected
 * `has`: hasValue, hasSelection, hasContent
 * `as`: asChild
 * `should`: shouldRender, shouldUpdate, shouldAnimate
 * `enable`: enableEditing, enableDragging, enableZoom
 * `make`: makeDefault, makeHandler, makeValidator
 * `with`: withTheme, withContext, withRouter, withLabel
 */
const booleanPropertyPrefixes = ['is', 'has', 'as', 'should', 'enable', 'make', 'with'];

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
      '**/public/*.js',
      '**/.env',
      '**/.react-router',
      '**/stats.html',
      '**/out-tsc',
      '**/generated',
      '**/assets',
      '**/.source/**/*', // Fumadocs source files.
      '**/.netlify',
      '**/*.prompt.example.*', // Kernel prompt examples (OpenSCAD, KCL, etc.)
    ],
  },
  // First, apply XO's base configuration
  ...xo.xoToEslintConfig([{ space: true, react: true, prettier: 'compat' }]),
  noBarrelFilesPlugin.flat,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      '@protontech/enforce-uint8array-arraybuffer': pluginEnforceUint8ArrayArrayBuffer,
    },
    rules: {
      '@protontech/enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer': 'error',
    },
  },
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
          allow: ['@taucad/kernels'],
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
              // Exclude relative imports of React-Router route types.
              // e.g. `import type { Route } from './+types/route.js';`
              allowImportNamePattern: '^Route$',
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

      'react/no-unknown-property': 'off', // Disabled as Typescript will check unknown properties. It can cause false positives for custom-elements.

      // Allow up to 5 nested callbacks. This is useful for test files with nested describe/it blocks.
      'max-nested-callbacks': ['error', { max: 5 }],

      // Enforce max 3 positional parameters. Prefer single options objects for 3+ args.
      // See docs/library-api-best-practices.md section 4 for rationale and smell tests.
      'max-params': ['error', { max: 3 }],
    },
  },
  {
    // NestJS files -- constructors use dependency injection with many parameters,
    // but all methods must still follow the max-params rule.
    // Uses eslint-plugin-max-params-no-constructor to enforce max-params on everything except constructors.
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
    plugins: {
      'max-params-no-constructor': maxParamsNoConstructorPlugin,
    },
    rules: {
      'max-params': 'off',
      'max-params-no-constructor/max-params-no-constructor': ['error', 3],
    },
  },
  {
    // API App -- NestJS decorator support
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
            'Catch',
            'ZodSerializerDto',
            'Sse',
            'WebSocketGateway',
            'User',
            'UseAuth',
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
        { rule: `^(${booleanPropertyPrefixes.join('|')})[A-Z]([A-Za-z0-9]?)+$`, validateNested: true },
      ],
      // DefaultProps is deprecated and irrelevant when using functional components.
      'react/require-default-props': 'off',
    },
  },
  {
    // Packages
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/**/*.{spec,test,config,setup}.{ts,tsx}'], // Only lint the source files.
    rules: {
      // Packages MUST declare all their dependencies in the package.json, as they are
      // published and consumers will not have access to the monorepo.
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          packageDir: ['.'], // Exclude the '../..' path as we want to exclude the root package.json.
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
    // Package public API JSDoc enforcement
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/**/*.{spec,test,config,setup}.{ts,tsx}'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
          contexts: ['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'],
          checkConstructors: false,
        },
      ],
      'jsdoc/require-description': [
        'warn',
        {
          contexts: [
            'FunctionDeclaration',
            'MethodDefinition',
            'ClassDeclaration',
            'TSTypeAliasDeclaration',
            'TSInterfaceDeclaration',
          ],
        },
      ],
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/no-types': 'error',
    },
  },
  {
    // Package entry points need barrel file imports
    files: ['{packages,libs}/**/index.ts'],
    rules: {
      'no-barrel-files/no-barrel-files': 'off',
    },
  },
  {
    // Example fixture source files are user-facing CAD code, not library code.
    files: ['libs/tau-examples/src/kernels/**/*.ts'],
    rules: {
      'unicorn/prevent-abbreviations': 'warn',
      'unicorn/no-array-callback-reference': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/naming-convention': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-restricted-types': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      'max-params': 'warn',
    },
  },
];

export default config;
