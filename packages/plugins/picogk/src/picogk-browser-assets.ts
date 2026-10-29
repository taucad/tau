import { sha256Bytes } from '@taucad/runtime/kernel';
import { z } from 'zod';
import { picogkBrowserProtocolVersion } from '#picogk.protocol.js';
import type { PicogkBrowserAssets } from '#picogk-browser-session.js';

const digest = z.string().regex(/^[a-f\d]{64}$/u);
const path = z
  .string()
  .regex(/^[\w./-]+$/u)
  .refine((value) => value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));
const file = z.object({ path, sha256: digest, byteLength: z.number().int().nonnegative() });
const variant = z.object({
  archiveInputReceipt: digest,
  bootstrap: path,
  compilerIdentity: digest,
  runtimeFiles: z.array(file).min(1),
  references: z.array(file).min(1),
});
/** Immutable browser bundle format shared by preparation and admission. @internal */
export const picogkBrowserManifestSchema = z.object({
  format: z.literal('tau-picogk-browser-v2'),
  protocolVersion: z.literal(picogkBrowserProtocolVersion),
  toolchain: z.object({
    sdk: z.literal('11.0.100-rc.3.26522.148'),
    workload: z.literal('11.0.100-rc.3.26524.4'),
    emscriptenPackage: z.literal('6.0.2'),
    emscriptenCompiler: z.literal('6.0.3'),
    emscriptenRevision: z.literal('6ea9c28c38cdd40c1032fa04400c9d16230ee180'),
  }),
  single: variant,
  multi: variant.optional(),
});

/**
 * Admit an immutable browser host manifest and select only an available, supported execution mode.
 * @internal
 * @param options - Manifest content identity, desired threading policy and host isolation admission.
 * @returns The exact runtime/compiler resources passed to the worker, plus the selected mode.
 */
export const loadPicogkBrowserAssets = async (options: {
  readonly manifest: { readonly url: string; readonly sha256: string };
  readonly wasm: 'auto' | 'single' | 'multi';
  readonly isolated: boolean;
  readonly signal: AbortSignal;
}): Promise<{ readonly assets: PicogkBrowserAssets; readonly mode: 'single' | 'multi' }> => {
  options.signal.throwIfAborted();
  const url = new URL(options.manifest.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Invalid PicoGK browser manifest URL.');
  }
  digest.parse(options.manifest.sha256);
  const response = await fetch(url.href, { signal: options.signal, redirect: 'error' });
  if (!response.ok) {
    throw new Error(`PicoGK browser manifest download failed: ${response.status}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await sha256Bytes(bytes)) !== options.manifest.sha256) {
    throw new Error('PicoGK browser manifest integrity mismatch.');
  }
  const manifest = picogkBrowserManifestSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
  const mode = options.wasm === 'auto' ? (options.isolated && manifest.multi ? 'multi' : 'single') : options.wasm;
  if (mode === 'multi' && !options.isolated) {
    throw new Error('PicoGK multi-threaded execution requires cross-origin isolation.');
  }
  const selected = manifest[mode];
  if (!selected) {
    throw new Error('The PicoGK browser bundle does not contain the requested execution mode.');
  }
  const inventory = new Set<string>();
  for (const entry of [...selected.runtimeFiles, ...selected.references]) {
    const key = entry.path.toLocaleLowerCase('en-US');
    if (inventory.has(key)) {
      throw new Error('The PicoGK browser manifest contains duplicate resource paths.');
    }
    inventory.add(key);
  }
  if (!selected.runtimeFiles.some((entry) => entry.path === selected.bootstrap && entry.path.endsWith('.js'))) {
    throw new Error('The PicoGK browser manifest does not identify its bootstrap module.');
  }
  options.signal.throwIfAborted();
  return {
    mode,
    assets: {
      bootstrapUrl: new URL(selected.bootstrap, url).href,
      compilerIdentity: selected.compilerIdentity,
      runtimeFiles: selected.runtimeFiles.map((entry) => ({ ...entry, url: new URL(entry.path, url).href })),
      references: selected.references.map((entry) => ({ ...entry, url: new URL(entry.path, url).href })),
    },
  };
};
