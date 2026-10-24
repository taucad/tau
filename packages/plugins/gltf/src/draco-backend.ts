import type { GLTF } from '@gltf-transform/core';
import type { DecoderModule, EncoderModule } from 'draco3dgltf';
import { loadWasmBinary } from '@taucad/runtime/transcoder';

/** Khronos extension implemented by the injected codecs. */
export const dracoExtensionName = 'KHR_draco_mesh_compression';

const decoderUrl = new URL(import.meta.resolve('draco3dgltf/draco_decoder_gltf.wasm')).href;
const encoderUrl = new URL(import.meta.resolve('draco3dgltf/draco_encoder.wasm')).href;

let decoderPromise: Promise<DecoderModule> | undefined;
/** The decoder once it has loaded, read synchronously for its heap. */
let loadedDecoder: DecoderModule | undefined;
let encoderPromise: Promise<EncoderModule> | undefined;

/**
 * Whether raw glTF declares Draco as used or required.
 *
 * @param json - Raw glTF JSON.
 * @returns Whether the standard Draco extension is declared.
 */
export const usesDracoCompression = (json: GLTF.IGLTF): boolean =>
  json.extensionsUsed?.includes(dracoExtensionName) === true ||
  json.extensionsRequired?.includes(dracoExtensionName) === true;

const createDecoder = async (): Promise<DecoderModule> => {
  const { default: draco } = await import('draco3dgltf');
  return draco.createDecoderModule({ wasmBinary: await loadWasmBinary(decoderUrl) });
};

const createEncoder = async (): Promise<EncoderModule> => {
  const { default: draco } = await import('draco3dgltf');
  return draco.createEncoderModule({ wasmBinary: await loadWasmBinary(encoderUrl) });
};

/**
 * Load and cache the Draco decoder for this worker.
 *
 * @returns The initialized decoder module.
 */
export const loadDracoDecoder = async (): Promise<DecoderModule> => {
  if (decoderPromise) {
    return decoderPromise;
  }
  decoderPromise = createDecoder();
  try {
    loadedDecoder = await decoderPromise;
    return loadedDecoder;
  } catch (error) {
    decoderPromise = undefined;
    throw error;
  }
};

/**
 * Bytes of WebAssembly memory the loaded Draco decoder holds: the decoder module exports no `WebAssembly.Memory`, so
 * this reads Emscripten's byte view over the whole memory, which it replaces on every growth.
 *
 * @returns The decoder's linear-memory size, or `undefined` before a Draco-compressed file has loaded it.
 */
export const dracoDecoderHeapBytes = (): number | undefined => loadedDecoder?.HEAPU8.byteLength;

/**
 * Load and cache the Draco encoder for this worker.
 *
 * @returns The initialized encoder module.
 */
export const loadDracoEncoder = async (): Promise<EncoderModule> => {
  if (encoderPromise) {
    return encoderPromise;
  }
  encoderPromise = createEncoder();
  try {
    return await encoderPromise;
  } catch (error) {
    encoderPromise = undefined;
    throw error;
  }
};
