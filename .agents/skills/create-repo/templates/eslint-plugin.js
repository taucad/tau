import { jsdocQualityRule } from './jsdoc-quality.js';

export const plugin = {
  meta: { name: '@@CREATE_REPO_eslint-plugin-id@@', version: '1.0.0' },
  rules: { 'jsdoc-quality': jsdocQualityRule },
};
