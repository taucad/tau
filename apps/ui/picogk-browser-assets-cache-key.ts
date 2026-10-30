// oxlint-disable-next-line eslint/no-restricted-imports -- Nx cache input runs directly in Node outside app aliases.
import { createPicogkBrowserAssets } from './picogk-browser-assets.vite-plugin.ts';

const prepared = createPicogkBrowserAssets(process.env['PICOGK_BROWSER_ASSETS_ROOT']);
process.stdout.write(`${prepared.assets?.sha256 ?? 'none'}\n`);
