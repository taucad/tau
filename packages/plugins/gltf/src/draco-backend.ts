import type { DecoderModule, EncoderModule } from 'draco3dgltf';

/** Draco codecs owned by one capability context. */
export type DracoBackend = {
  readonly decoder: DecoderModule;
  readonly encoder: EncoderModule;
};

/** Load Draco codecs for a kernel or transcoder worker context. */
export const loadDracoBackend = async (): Promise<DracoBackend> => {
  const { default: draco } = await import('draco3dgltf');
  const [decoder, encoder] = await Promise.all([
    draco.createDecoderModule({
      locateFile: () => new URL('wasm/draco_decoder_gltf.wasm', import.meta.url).href,
    }),
    draco.createEncoderModule({
      locateFile: () => new URL('wasm/draco_encoder.wasm', import.meta.url).href,
    }),
  ]);
  return { decoder, encoder };
};

/** Register one context's codecs with glTF Transform IO. */
export const dracoDependencies = (backend: DracoBackend): Record<string, unknown> => ({
  'draco3d.decoder': backend.decoder,

  'draco3d.encoder': backend.encoder,
});
