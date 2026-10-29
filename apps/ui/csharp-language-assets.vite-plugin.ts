import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { CsharpLanguageAssets } from '@taucad/csharp-language/protocol';

type ManifestFile = { path?: unknown; sha256?: unknown; byteLength?: unknown };
type Manifest = { format?: unknown; bootstrap?: unknown; references?: unknown; files?: unknown };

const manifestName = 'assets-manifest.json';
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const isAssetPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[\w./-]+$/u.test(value) &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

const contentTypes: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

/**
 * Admit the C# language server stage that `csharp-language:prepare` writes, verifying every file against its
 * manifest, and serve it content-addressed under `/csharp-language/<manifest sha256>/`. Without a stage the build
 * carries no C# language service and `.cs` files keep syntax editing only.
 */
export const createCsharpLanguageAssets = (
  stage: string | undefined,
): { assets: CsharpLanguageAssets | undefined; plugin: Plugin } => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let assets: CsharpLanguageAssets | undefined;
  let prefix = '';
  if (stage) {
    const manifestBytes = Uint8Array.from(readFileSync(path.join(stage, manifestName)));
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest | undefined;
    const entries = Array.isArray(manifest?.files) ? (manifest.files as ManifestFile[]) : [];
    if (
      manifest?.format !== 'tau-csharp-language-v1' ||
      !isAssetPath(manifest.bootstrap) ||
      !isAssetPath(manifest.references) ||
      entries.length === 0
    ) {
      throw new Error('C# language staged manifest is invalid.');
    }
    for (const entry of entries) {
      if (!isAssetPath(entry.path) || typeof entry.sha256 !== 'string' || typeof entry.byteLength !== 'number') {
        throw new Error('C# language staged manifest lists an invalid file.');
      }
      const bytes = Uint8Array.from(readFileSync(path.join(stage, entry.path)));
      if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
        throw new Error(`C# language staged file does not match its manifest: ${entry.path}`);
      }
      files.set(entry.path, bytes);
    }
    if (!files.has(manifest.bootstrap) || !files.has(manifest.references)) {
      throw new Error('C# language staged manifest does not list its bootstrap and reference bundle.');
    }
    files.set(manifestName, manifestBytes);
    const identity = sha256(manifestBytes);
    prefix = `csharp-language/${identity}/`;
    assets = { url: `/${prefix}${manifestName}`, sha256: identity };
  }
  return {
    assets,
    plugin: {
      name: 'tau:csharp-language-assets',
      applyToEnvironment: (environment) => environment.config.consumer === 'client',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = (request.url ?? '').split('?', 1)[0] ?? '';
          const bytes =
            prefix && pathname.startsWith(`/${prefix}`) ? files.get(pathname.slice(prefix.length + 1)) : undefined;
          if (!bytes) {
            next();
            return;
          }
          response.setHeader('Content-Type', contentTypes[path.extname(pathname)] ?? 'application/octet-stream');
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          response.end(bytes);
        });
      },
      generateBundle() {
        for (const [name, bytes] of files) {
          this.emitFile({ type: 'asset', fileName: `${prefix}${name}`, source: bytes });
        }
      },
    },
  };
};
