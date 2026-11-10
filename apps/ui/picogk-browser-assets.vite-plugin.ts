import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

/*
 * The committed pin of the published browser host (`packages/plugins/picogk/browser-host.pin.json`, interim
 * charter D8), schema version 1 as `scripts/src/picogk-browser-host-pin.ts` writes and parses it. The UI uses only
 * the manifest digest; the rest is checked so a malformed or foreign file fails the build. Unknown keys (the `//`
 * provenance note) are ignored. Whether `inputsKey` matches the tree is the producer's check, not the build's.
 */
const hostPin = z.object({
  schemaVersion: z.literal(1),
  inputsKey: z.string().regex(/^picogk-browser-host-v\d+-[\da-f]{40}-[\w.+-]+-[\da-f]{64}-[\da-f]{64}$/u),
  manifest: z.object({ sha256: z.string().regex(/^[\da-f]{64}$/u), byteLength: z.number().int().positive() }),
  files: z.object({ count: z.number().int().positive(), byteLength: z.number().int().nonnegative() }),
});

/**
 * Read the pinned browser host manifest identity, or nothing when no host has been pinned yet.
 *
 * @param file - The pin file.
 * @returns The pinned manifest's sha256 and byte length.
 */
export const readPicogkBrowserHostPin = (
  file: string,
): { readonly sha256: string; readonly byteLength: number } | undefined =>
  existsSync(file) ? hostPin.parse(JSON.parse(readFileSync(file, 'utf8'))).manifest : undefined;

/**
 * Locate the pinned manifest blob on a digest mirror.
 *
 * @param base - The mirror base (`PICOGK_BROWSER_MIRROR_BASE`), with or without a trailing `/`.
 * @param pin - The pin file.
 * @returns The manifest's `<base>/blobs/sha256/<sha256>` URL and its digest.
 * @throws When the base is not a plain HTTP(S) URL or no host is pinned.
 */
const locatePinnedManifest = (base: string, pin: string): { url: string; sha256: string } => {
  const root = new URL(base.endsWith('/') ? base : `${base}/`);
  if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password || root.search || root.hash) {
    throw new Error(`Invalid PICOGK_BROWSER_MIRROR_BASE: ${base}`);
  }
  const pinned = readPicogkBrowserHostPin(pin);
  if (!pinned) {
    throw new Error(`PICOGK_BROWSER_MIRROR_BASE is set, but no browser host is pinned at ${pin}.`);
  }
  return { url: new URL(`blobs/sha256/${pinned.sha256}`, root).href, sha256: pinned.sha256 };
};

/**
 * Where a build loads the PicoGK browser host from. Exactly one source may be named:
 *
 * - `mirror.base` (deploys): the pinned host on the digest mirror, `<base>/blobs/sha256/<manifest sha256>`,
 *   every file its own blob. Nothing is copied into the build. A base without a pin fails the build.
 * - `stage` (development and e2e): a prepared bundle served same-origin under `picogk-browser/<sha256>/`.
 *
 * Naming both fails the build; naming neither leaves the browser PicoGK kernel unadvertised.
 *
 * @param stage - The prepared bundle directory (`PICOGK_BROWSER_ASSETS_ROOT`).
 * @param mirror - The mirror base (`PICOGK_BROWSER_MIRROR_BASE`) and the pin file it serves.
 * @returns The manifest identity to define for the app, and the plugin that serves or emits a staged bundle.
 */
export const createPicogkBrowserAssets = (
  stage: string | undefined,
  mirror?: { readonly base: string | undefined; readonly pin: string },
): {
  assets: { url: string; sha256: string } | undefined;
  plugin: Plugin;
} => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let sha256: string | undefined;
  if (mirror?.base && stage) {
    throw new Error('Set either PICOGK_BROWSER_MIRROR_BASE or PICOGK_BROWSER_ASSETS_ROOT, not both.');
  }
  const mirrored = mirror?.base ? locatePinnedManifest(mirror.base, mirror.pin) : undefined;
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
    assets: mirrored ?? (sha256 ? { url: `/${prefix}assets-manifest.json`, sha256 } : undefined),
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
