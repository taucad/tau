import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type Manifest = {
  format?: string;
  module?: { path?: string; sha256?: string; byteLength?: number };
};

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Serve the OpenSCAD language server staged by `openscad-language:prepare` under a content-addressed path, and define
 * `tauOpenscadLanguageAssets` with the manifest's URL and identity. Without a stage the define is `undefined` and the
 * editor keeps syntax highlighting only.
 */
export const createOpenscadLanguageAssets = (
  stage: string,
): { assets: { url: string; sha256: string } | undefined; plugin: Plugin } => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let assets: { url: string; sha256: string } | undefined;
  const manifestPath = path.join(stage, 'assets-manifest.json');
  if (existsSync(manifestPath)) {
    const manifestBytes = Uint8Array.from(readFileSync(manifestPath));
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest | undefined;
    const modulePath = manifest?.module?.path;
    if (manifest?.format !== 'tau-openscad-language-v1' || !modulePath || !/^[\w.-]+\.wasm$/u.test(modulePath)) {
      throw new Error('OpenSCAD language staged manifest is invalid.');
    }
    const moduleBytes = Uint8Array.from(readFileSync(path.join(stage, modulePath)));
    if (moduleBytes.length !== manifest.module?.byteLength || sha256(moduleBytes) !== manifest.module.sha256) {
      throw new Error('OpenSCAD language staged module does not match its manifest.');
    }
    const identity = sha256(manifestBytes);
    const directory = `openscad-language/${identity.slice(0, 16)}`;
    files.set(`${directory}/assets-manifest.json`, manifestBytes);
    files.set(`${directory}/${modulePath}`, moduleBytes);
    assets = { url: `/${directory}/assets-manifest.json`, sha256: identity };
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
