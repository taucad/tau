import xo from 'xo';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

// Export default xo.xoToEslintConfig([{space: true, react: true, prettier: 'compat'}]);
/**
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  ...xo.xoToEslintConfig([{ space: true, react: true, prettier: 'compat' }]),
  eslintPluginPrettierRecommended,
  {
    rules: {
      // Require a description for each ESLint rule comment. This informs co-authors about the rule and why it is being applied.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
    },
  },
  {
    // UI App
    files: ['apps/ui/**/*.ts', 'apps/ui/**/*.tsx'],
    rules: {
      // Turned off as the UI app has a `package.json` required by NX, and this results in a false positive.
      'import-x/no-extraneous-dependencies': 'off',
      'n/no-extraneous-import': 'off',
    },
  },
];

export default config;
