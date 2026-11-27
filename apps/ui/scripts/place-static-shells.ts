/**
 * Moves each edge shell (progressive loading PL4, `app/lib/route-classes.ts`) from where React Router prerendered it to
 * the file the marketing edge function rewrites to.
 *
 * Called from `react-router.config.ts`'s `buildEnd`, the only hook that runs after prerendering. The Home shell is
 * prerendered at `/`, which writes `index.html` and the root data file at the root of the client output (`_.data` with
 * trailing-slash-aware data requests, `_root.data` without them). Netlify's React Router function is registered with
 * `preferStatic`, so left there those files would answer every `/` and root data request the edge function passes on
 * (no preference, `?app`, `?code=…`, a client navigation's data request) in place of the function. The document moves
 * to `__shell/<id>/index.html`; the data file goes, since a shell hydrates from the data it embeds and client
 * navigations ask the function.
 */
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
/* oxlint-disable-next-line no-restricted-imports -- Called from react-router.config.ts before app aliases exist. */
import { edgeShellClasses, prerenderedFiles, shellDocumentFile } from '../app/lib/route-classes.ts';

/** One shell moved into place, relative to the client output directory. */
export type PlacedShell = Readonly<{ from: string; to: string; removed: readonly string[] }>;

/**
 * Move every edge shell into place.
 *
 * @param clientDirectory - The client build output (`build/client`).
 * @returns What moved and what was removed, per shell.
 * @throws When the prerender wrote no document for a shell, so a deploy cannot ship without its Home shell.
 */
export const placeEdgeShells = (clientDirectory: string): PlacedShell[] =>
  edgeShellClasses.map((routeClass) => {
    const { document, data } = prerenderedFiles(routeClass.shellPath);
    const from = join(clientDirectory, document);
    if (!existsSync(from)) {
      throw new Error(`${routeClass.label}: the prerender wrote no ${document} for ${routeClass.shellPath}`);
    }
    const to = shellDocumentFile(routeClass);
    mkdirSync(dirname(join(clientDirectory, to)), { recursive: true });
    renameSync(from, join(clientDirectory, to));
    const removed = data.filter((file) => existsSync(join(clientDirectory, file)));
    for (const file of removed) {
      rmSync(join(clientDirectory, file));
    }
    return { from: document, to, removed };
  });
