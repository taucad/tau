import fs from 'node:fs';
import type { Plugin } from 'vite';

/**
 * A simple plugin to load files as base64 strings.
 *
 * Import any file with `?base64` suffix to get its contents as a base64 string.
 * The data encoding for url() imports is not supplied.
 *
 * The bytes are read in `load`, not `transform`: a production (Rolldown) build loads an id no plugin loads with its
 * native loader, which treats the query as part of the path and fails, and a binary file has no text to transform.
 *
 * @public
 */
export const base64Loader: Plugin = {
  name: 'vite:base64-loader',
  load: {
    filter: { id: /\?base64$/ },
    handler(id) {
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
