import { siteConfiguration } from '#app/config.server.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import netlifyReactRouter from '@netlify/vite-plugin-react-router';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

siteConfiguration(process.env);
// The agent page names the plugin release this deploy was built beside.
const { version: pluginVersion } = createRequire(import.meta.url)('../../packages/agent-plugin/package.json') as {
  version: string;
};

const isGraph = Reflect.get(globalThis, 'NX_GRAPH_CREATION') === true;
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  publicDir: command === 'serve' ? fileURLToPath(new URL('../../out/www-public/', import.meta.url)) : false,
  define: {
    'import.meta.env.WWW_INSTALLER_CATALOG': JSON.stringify(process.env['WWW_INSTALLER_CATALOG'] ?? 'false'),
    'import.meta.env.WWW_LAUNCH': JSON.stringify(process.env['WWW_LAUNCH'] ?? 'false'),
    'import.meta.env.WWW_ORIGIN': JSON.stringify(process.env['WWW_ORIGIN'] ?? ''),
    'import.meta.env.WWW_ANALYTICS_ENDPOINT': JSON.stringify(process.env['WWW_ANALYTICS_ENDPOINT'] ?? ''),
    'import.meta.env.WWW_PLUGIN_VERSION': JSON.stringify(pluginVersion),
  },
  cacheDir: '../../node_modules/.vite/apps/www',
  plugins: [...(isGraph ? [] : [reactRouter(), netlifyReactRouter()]), tailwindcss()],
  ssr: { noExternal: [/^@taucad\//u] },
  build: { target: 'es2022', assetsDir: '_www/bundles' },
  server: { port: 3003 },
}));
