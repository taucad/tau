import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

export const ephemeralKernelOptions: LazyKernelOptionsFactory = async () => {
  const provideClientOptions = createElectronClientOptions<typeof runtime>({
    config: createUiRuntimeConfig(ENV),
    context: { purpose: 'ephemeral', definition: 'default' },
  });
  const clientOptions = await provideClientOptions();
  return () => clientOptions;
};

/**
 * Bytes a memory-mounted preview sends with its first render. The ephemeral utility serves its own
 * empty memory filesystem (`apps/desktop/src/tau/kernel-host.ts`) and cannot see the renderer's
 * mount, so the preview's bytes travel inline, as every other ephemeral consumer sends them.
 * @param files - The preview's root-relative files.
 * @returns The stage map for the initial render.
 */
export const ephemeralPreviewStage = (
  files: Readonly<Record<string, { readonly content: Uint8Array<ArrayBuffer> }>>,
): Record<string, Uint8Array<ArrayBuffer>> =>
  Object.fromEntries(Object.entries(files).map(([path, file]) => [path, file.content]));
