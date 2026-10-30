import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type Manifest = {
  format?: string;
  module?: { path?: string; sha256?: string; byteLength?: number };
};

type Assets = { url: string; sha256: string; module: { path: string; integrity: string } };

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Serve the OpenSCAD language server staged by `openscad-language:prepare` next to the client chunks, under
 * content-addressed names, and define `tauOpenscadLanguageAssets` with the manifest's URL and identity and the module's
 * Subresource Integrity. The chunk that carries the define names the module, so the asset-integrity plugin registers it
 * like every other WASM file the UI ships. Without a stage the define is `undefined` and the editor keeps syntax
 * highlighting only.
 */
export const createOpenscadLanguageAssets = (stage: string): { assets: Assets | undefined; plugin: Plugin } => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let assets: Assets | undefined;
  const manifestPath = path.join(stage, 'assets-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest | undefined;
    const modulePath = manifest?.module?.path;
    if (manifest?.format !== 'tau-openscad-language-v1' || !modulePath || !/^[\w.-]+\.wasm$/u.test(modulePath)) {
      throw new Error('OpenSCAD language staged manifest is invalid.');
    }
    const moduleBytes = Uint8Array.from(readFileSync(path.join(stage, modulePath)));
    const moduleSha256 = sha256(moduleBytes);
    if (moduleBytes.length !== manifest.module?.byteLength || moduleSha256 !== manifest.module.sha256) {
      throw new Error('OpenSCAD language staged module does not match its manifest.');
    }
    const moduleName = `${path.basename(modulePath, '.wasm')}-${moduleSha256.slice(0, 16)}.wasm`;
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify({ ...manifest, module: { ...manifest.module, path: moduleName } }),
    );
    const identity = sha256(manifestBytes);
    const manifestName = `openscad-language-${identity.slice(0, 16)}.json`;
    files.set(`assets/${manifestName}`, manifestBytes);
    files.set(`assets/${moduleName}`, moduleBytes);
    assets = {
      url: `/assets/${manifestName}`,
      sha256: identity,
      module: {
        path: moduleName,
        integrity: `sha384-${createHash('sha384').update(moduleBytes).digest('base64')}`,
      },
    };
  }
  return {
    assets,
    plugin: {
      name: 'tau:openscad-language-assets',
      config: () => ({ define: { tauOpenscadLanguageAssets: assets ? JSON.stringify(assets) : 'undefined' } }),
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const [pathname = ''] = (request.url ?? '').split('?');
          const bytes = files.get(pathname.slice(1));
          if (!bytes) {
            next();
            return;
          }
          const isModule = pathname.endsWith('.wasm');
          response.setHeader('Content-Type', isModule ? 'application/wasm' : 'application/json; charset=utf-8');
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          response.end(bytes);
        });
      },
      generateBundle() {
        if (this.environment.config.consumer !== 'client') {
          return;
        }
        for (const [fileName, source] of files) {
          this.emitFile({ type: 'asset', fileName, source });
        }
      },
    },
  };
};
