import fs from 'node:fs';
import type { Plugin } from 'vite';

/**
 * A simple plugin to load files as base64 strings.
 *
 * Import any file with `?base64` suffix to get its contents as a base64 string.
 * The data encoding for url() imports is not supplied.
 *
 * @public
 */
export const base64Loader: Plugin = {
  name: 'vite:base64-loader',
  transform: {
    filter: { id: /\?base64$/ },
    handler(_, id) {
      const [path, query] = id.split('?');
      if (query !== 'base64' || !path) {
        return;
      }

      const data = fs.readFileSync(path);
      const base64 = data.toString('base64');

      return { code: `export default '${base64}';`, moduleType: 'js' };
    },
  },
};
