import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { z } from 'zod';

const entry = z.object({
  path: z
    .string()
    .regex(/^[\w./-]+$/u)
    .refine((name) => name.split('/').every((part) => part && part !== '.' && part !== '..')),
  sha256: z.string().regex(/^[a-f\d]{64}$/u),
  byteLength: z.number().int().nonnegative(),
});
const variant = z.object({ runtimeFiles: z.array(entry), references: z.array(entry) });
const inventory = z.object({ single: variant, multi: variant.optional() });
const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** Serve the exact prepared bundle in development and preserve its directory layout in builds. */
export const createPicogkBrowserAssets = (
  stage: string | undefined,
): {
  assets: { url: string; sha256: string } | undefined;
  plugin: Plugin;
} => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let sha256: string | undefined;
  if (stage) {
    const bytes = Uint8Array.from(readFileSync(path.join(stage, 'assets-manifest.json')));
    sha256 = digest(bytes);
    const receipt = z
      .object({ sha256: z.literal(sha256) })
      .parse(JSON.parse(readFileSync(path.join(stage, 'assets-receipt.json'), 'utf8')));
    const manifest = inventory.parse(JSON.parse(new TextDecoder().decode(bytes)));
    files.set('assets-manifest.json', bytes);
    for (const selected of [manifest.single, manifest.multi]) {
      if (!selected) {
        continue;
      }
      for (const file of [...selected.runtimeFiles, ...selected.references]) {
        const contents = Uint8Array.from(readFileSync(path.join(stage, file.path)));
        if (contents.length !== file.byteLength || digest(contents) !== file.sha256) {
          throw new Error(`PicoGK staged browser resource changed: ${file.path}`);
        }
        const prior = files.get(file.path);
        if (prior && digest(prior) !== file.sha256) {
          throw new Error(`PicoGK staged browser resource conflicts: ${file.path}`);
        }
        files.set(file.path, contents);
      }
    }
    sha256 = receipt.sha256;
  }
  const prefix = `picogk-browser/${sha256 ?? 'unprepared'}/`;
  let base = '/';
  return {
    assets: sha256 ? { url: `/${prefix}assets-manifest.json`, sha256 } : undefined,
    plugin: {
      name: 'tau:picogk-browser-assets',
      applyToEnvironment: (environment) => environment.config.consumer === 'client',
      configResolved(config) {
        base = config.base;
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = (request.url ?? '').split('?')[0]!;
          const start = `${base}${prefix}`;
          const bytes = pathname.startsWith(start) ? files.get(pathname.slice(start.length)) : undefined;
          if (!bytes) {
            next();
            return;
          }
          response.setHeader(
            'Content-Type',
            pathname.endsWith('.wasm')
              ? 'application/wasm'
              : pathname.endsWith('.js') || pathname.endsWith('.mjs')
                ? 'text/javascript; charset=utf-8'
                : 'application/octet-stream',
          );
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
