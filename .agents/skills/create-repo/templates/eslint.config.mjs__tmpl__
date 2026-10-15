import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

import { plugin } from './tools/eslint-plugin/index.js';

export default tseslint.config(
  { ignores: ['coverage/**', 'dist/**', 'docs-site/.next/**', 'node_modules/**', 'rust/target/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true } },
    plugins: { '@@CREATE_REPO_eslint-plugin-id@@': plugin },
    rules: { '@@CREATE_REPO_eslint-plugin-id@@/jsdoc-quality': 'error' },
  },
);
