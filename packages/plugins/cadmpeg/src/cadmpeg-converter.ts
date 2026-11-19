import { isNode } from '@taucad/runtime/kernel';
import { createCadmpeg } from 'cadmpeg-ts/core';
import type { Cadmpeg } from 'cadmpeg-ts/core';
import { digests } from 'cadmpeg-ts/digests';
import type { z } from 'zod';

import { createEngineLocator, enginesNotPrepared, resolveEngineBase } from '#cadmpeg-engines.js';
import type { cadmpegEnginesSchema } from '#cadmpeg-engines.js';

/**
 * One converter per engine source in this realm. The wasm-bindgen glue of each module is a realm-wide
 * singleton, so a second converter would only fetch and verify engines the first already loaded.
 */
const converters = new Map<string, Cadmpeg>();

/**
 * Open a converter for this realm.
 *
 * Node.js (desktop, the CLI) resolves `cadmpeg-ts/core` to the native-first entry, which loads the
 * addon and falls back to the packaged WebAssembly on disk; `engines` is not needed there and is
 * ignored (charter D13). Every other realm loads each engine on demand from `engines`, verified
 * against the installed `cadmpeg-ts/digests`, and refuses with `KERNEL_NOT_PREPARED` without it (D9).
 * The kernel and the transcoder share the converter of one engine source.
 *
 * @param engines - The host's engine delivery, when it supplied one.
 * @returns The converter.
 */
export const openCadmpeg = async (engines: z.output<typeof cadmpegEnginesSchema> | undefined): Promise<Cadmpeg> => {
  if (isNode()) {
    return createCadmpeg();
  }
  if (engines === undefined) {
    throw enginesNotPrepared('the host must supply the `engines` option in a browser realm');
  }
  const key = `${engines.layout} ${resolveEngineBase(engines.baseUrl).href}`;
  const shared = converters.get(key);
  if (shared !== undefined) {
    return shared;
  }
  // `createCadmpeg` loads nothing on the WebAssembly backend; engines load on first use.
  const converter = await createCadmpeg({
    backend: 'wasm',
    locateModule: createEngineLocator({ engines, digests }),
  });
  converters.set(key, converter);
  return converter;
};
