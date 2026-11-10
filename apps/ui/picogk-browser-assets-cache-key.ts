import path from 'node:path';
// oxlint-disable-next-line eslint/no-restricted-imports -- Nx cache input runs directly in Node outside app aliases.
import { createPicogkBrowserAssets } from './picogk-browser-assets.vite-plugin.ts';

// The same sources `vite.config.ts` names, so a mirror base or a new pin is a new build.
const prepared = createPicogkBrowserAssets(process.env['PICOGK_BROWSER_ASSETS_ROOT'], {
  base: process.env['PICOGK_BROWSER_MIRROR_BASE'],
  pin: path.resolve(import.meta.dirname, '../../packages/plugins/picogk/browser-host.pin.json'),
});
process.stdout.write(`${prepared.assets ? `${prepared.assets.url} ${prepared.assets.sha256}` : 'none'}\n`);
