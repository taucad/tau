import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Inline the viewer's workers. Vite emits each `new Worker(new URL(...))` as
 * its own file, which a page with no origin cannot fetch; each becomes a
 * `blob:` URL built from the worker's code (the resource declares `blob:`).
 * A worker may start another worker, so each unit of code (the page, or a
 * worker) carries one table of the workers it starts. A worker's import of
 * Vite's browser stub for a Node built-in sits on a Node branch and resolves
 * to an empty module.
 */
const inlineWorkers = (): Plugin => ({
  name: 'tau-inline-workers',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const stubs = Object.keys(bundle).filter((fileName) => fileName.startsWith('__vite-browser-external'));
    const sources = new Map<string, string>();
    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type === 'asset' && /\.worker-[\w-]+\.js$/u.test(fileName)) {
        sources.set(
          fileName,
          typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source),
        );
      }
    }
    const resolved = new Map<string, string>();
    const inline = (code: string, seen: ReadonlySet<string>): string => {
      let result = code;
      for (const stub of stubs) {
        result = result.replaceAll(`import(\`./${stub}\`)`, 'Promise.resolve({})');
      }
      const table: string[] = [];
      for (const fileName of sources.keys()) {
        const reference = `new URL(\`${fileName}\`,import.meta.url)`;
        if (!result.includes(reference)) {
          continue;
        }
        if (seen.has(fileName)) {
          throw new Error(`Worker ${fileName} starts itself.`);
        }
        table.push(`${JSON.stringify(fileName)}:${JSON.stringify(resolve(fileName, seen))}`);
        result = result.replaceAll(reference, `new URL(__tauWorkerUrl(${JSON.stringify(fileName)}))`);
      }
      if (table.length === 0) {
        return result;
      }
      const header = `var __tauWorkerCode={${table.join(',')}},__tauWorkerUrls={},__tauWorkerUrl=n=>__tauWorkerUrls[n]??=URL.createObjectURL(new Blob([__tauWorkerCode[n]],{type:"text/javascript"}));`;
      return header + result;
    };
    const resolve = (fileName: string, seen: ReadonlySet<string>): string => {
      const cached = resolved.get(fileName);
      if (cached !== undefined) {
        return cached;
      }
      const code = inline(sources.get(fileName) ?? '', new Set([...seen, fileName]));
      resolved.set(fileName, code);
      return code;
    };
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') {
        output.code = inline(output.code, new Set());
      }
    }
    for (const fileName of [...sources.keys(), ...stubs]) {
      // oxlint-disable-next-line typescript/no-dynamic-delete -- the output bundle is a record Rollup reads after this hook.
      delete bundle[fileName];
    }
  },
});

/**
 * Name the page `app.html` (what `launch.ts` and `tau mcp --viewer-page`
 * read), and fail the build when anything was left outside it.
 */
const renamePage = (): Plugin => ({
  name: 'tau-page-name',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const outside = Object.keys(bundle).filter((fileName) => fileName !== 'index.html');
    if (outside.length > 0) {
      this.error(`The viewer page must be one file; the build also emitted ${outside.join(', ')}.`);
    }
    const page = bundle['index.html'];
    if (page !== undefined) {
      page.fileName = 'app.html';
    }
  },
});

/**
 * The viewer page: one self-contained HTML file (`dist-app/app.html`) that
 * `tau mcp` serves as its `ui://` resource and from its loopback server.
 * MCP Apps hosts load it with no origin and no network (blueprint D2, I2).
 */
export default defineConfig({
  root: 'app',
  // The package folder is the plugin root that hosts load or copy: keep Vite's cache out of it.
  cacheDir: '../../../node_modules/.vite/packages/agent-plugin-app',
  base: './',
  plugins: [react(), tailwindcss(), inlineWorkers(), viteSingleFile({ removeViteModuleLoader: true }), renamePage()],
  build: {
    outDir: '../dist-app',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 16_384,
    rolldownOptions: { input: 'app/index.html' },
  },
  worker: { format: 'es' },
});
