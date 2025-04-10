import nx from '@nx/eslint-plugin';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginSonarjs from 'eslint-plugin-sonarjs';
import eslintPluginComments from '@eslint-community/eslint-plugin-eslint-comments/configs';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...nx.configs['flat/react'],
  eslintPluginUnicorn.configs['flat/all'],
  eslintPluginSonarjs.configs.recommended,
  eslintPluginComments.recommended,
  eslintPluginPrettierRecommended,
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // Enforcing Dependency Inversion Principle from SOLID
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [String.raw`^.*/eslint(\.base)?\.config\.[cm]?js$`],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      // Unused variables result in poor code hygiene and should be removed.
      'no-unused-vars': 'off', // Note: we disable the base rule as it can conflict with the typescript rule.
      '@typescript-eslint/no-unused-vars': 'error',
      // Disable type assertions by default as they are typically used to suppress type errors, which is a code smell. Disable and add a comment when necessary.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // Usage of `any` is discouraged as it almost always leads to type errors.
      '@typescript-eslint/no-explicit-any': 'error',
      // Require a description for each ESLint rule comment. This informs co-authors about the rule and why it is being applied.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],

      /* IMPORT RULES */
      // Helpful Warnings
      'import/export': 'error',
      'import/no-deprecated': 'error',
      'import/no-empty-named-blocks': 'error',
      'import/no-extraneous-dependencies': 'error',
      'import/no-mutable-exports': 'error',
      'import/no-named-as-default': 'error',
      'import/no-named-as-default-member': 'error',
      'import/no-unused-modules': 'error',
      // Module Systems
      'import/no-commonjs': 'error',
      // Static Analysis
      'import/default': 'error',
      'import/named': 'off', // Disabled as we use `tsconfig` to resolve paths.
      'import/namespace': 'error',
      'import/no-absolute-path': 'error',
      'import/no-cycle': 'error',
      'import/no-dynamic-require': 'error',
      'import/no-internal-modules': 'off', // Disabled as multi-level exports are common for packages.
      'import/no-relative-packages': 'error',
      'import/no-relative-parent-imports': 'error',
      'import/no-restricted-paths': 'error',
      'import/no-self-import': 'error',
      'import/no-unresolved': 'off', // Disabled as we use `tsconfig` to resolve paths.
      'import/no-useless-path-segments': 'error',
      'import/no-webpack-loader-syntax': 'off', // Disabled as we don't use webpack.
      // Style
      'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
      'import/dynamic-import-chunkname': 'off', // Disabled as we don't use dynamic imports.
      'import/exports-last': 'error',
      'import/extensions': 'off', // This rule is difficult to configure correctly given the vast number of extensions. Reconsider later.
      'import/first': 'error',
      'import/group-exports': 'off', // Disabled as it's easier to export inline.
      'import/max-dependencies': 'error',
      'import/newline-after-import': 'error',
      'import/no-anonymous-default-export': 'error',
      'import/no-default-export': 'error', // We prefer named exports.
      'import/no-duplicates': 'error',
      'import/no-named-default': 'error',
      'import/no-named-export': 'off', // We prefer named exports.
      'import/no-namespace': 'error',
      'import/no-unassigned-import': 'error',
      'import/order': 'error',
      'import/prefer-default-export': 'off', // We prefer named exports.
      /* END IMPORT RULES */

      /* SONAR fix/to-do rules - will be addressed before release */
      'sonarjs/fixme-tag': 'off',
      'sonarjs/todo-tag': 'off',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.tsx', '**/*.jsx'],
    // Override or add rules here
    rules: {
      'unicorn/no-keyword-prefix': 'off',
    },
  },
  {
    // UI App
    files: ['apps/ui/**/*.ts', 'apps/ui/**/*.tsx', 'apps/ui/**/*.js', 'apps/ui/**/*.jsx'],
    // Override or add rules here
    rules: {
      // Turned off as the UI app has a `package.json` required by NX, and this results in a false positive.
      'import/no-extraneous-dependencies': 'off',
    },
  },
];
