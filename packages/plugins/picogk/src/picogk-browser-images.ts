/* oxlint-disable no-await-in-loop -- Decode and close one frame at a time, retaining no raster copies. */
import { validatePicogkPng } from '#picogk-browser-png.js';

const invalid = (): Error => new Error('PicoGK material must contain a complete valid PNG, JPEG or WebP image.');

const webpFrames = (bytes: Uint8Array<ArrayBuffer>): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    view.getUint32(0) !== 0x52_49_46_46 ||
    view.getUint32(8) !== 0x57_45_42_50 ||
    view.getUint32(4, true) + 8 !== bytes.length
  ) {
    throw invalid();
  }
  const state = { frames: 0, animation: false };
  const chunks = (start: number, end: number, nested: boolean): void => {
    let offset = start;
    let raster = false;
    while (offset < end) {
      if (offset + 8 > end) {
        throw invalid();
      }
      const size = view.getUint32(offset + 4, true);
      const payload = offset + 8;
      const next = payload + size + (size % 2);
      if (next > end || (size % 2 === 1 && bytes[next - 1] !== 0)) {
        throw invalid();
      }
      const type = view.getUint32(offset);
      if (type === 0x56_50_38_58 && !nested) {
        if (size !== 10) {
          throw invalid();
        }
        // oxlint-disable-next-line no-bitwise -- WebP stores the animation flag in bit 1.
        state.animation = (bytes[payload]! & 2) !== 0;
      }
      if (type === 0x41_4e_4d_46) {
        if (nested || !state.animation || size < 24) {
          throw invalid();
        }
        state.frames++;
        chunks(payload + 16, payload + size, true);
      }
      if (type === 0x56_50_38_20 || type === 0x56_50_38_4c) {
        if (raster || size === 0) {
          throw invalid();
        }
        raster = true;
      }
      offset = next;
    }
    if (nested && !raster) {
      throw invalid();
    }
  };
  chunks(12, bytes.length, false);
  if (state.animation && state.frames === 0) {
    throw invalid();
  }
  return state.animation ? state.frames : 1;
};

/**
 * Validate immutable material image bytes before publishing a browser build.
 * @internal
 * @param options - Encoded bytes and format already admitted by the managed size/header guard.
 * @returns Completion after strict container checks and every decoder frame succeeds.
 */
export const validatePicogkBrowserImage = async (options: {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
}): Promise<void> => {
  const { bytes, mimeType } = options;
  let expectedFrames: number;
  switch (mimeType) {
    case 'image/png': {
      expectedFrames = await validatePicogkPng(bytes);
      break;
    }
    case 'image/webp': {
      expectedFrames = webpFrames(bytes);
      break;
    }
    case 'image/jpeg': {
      if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
        throw invalid();
      }
      expectedFrames = 1;
      break;
    }
    default: {
      throw invalid();
    }
  }
  if (typeof ImageDecoder === 'undefined') {
    throw new TypeError('PicoGK material image validation requires the browser ImageDecoder API.');
  }
  const decoder = new ImageDecoder({ data: bytes, type: mimeType, preferAnimation: true });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const count = decoder.tracks.selectedTrack?.frameCount;
    if (count === undefined || count < 1 || count !== expectedFrames) {
      throw invalid();
    }
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      const { image, complete } = await decoder.decode({ frameIndex, completeFramesOnly: true });
      try {
        if (
          !complete ||
          image.displayWidth < 1 ||
          image.displayHeight < 1 ||
          image.displayWidth * image.displayHeight > (256 * 1024 * 1024) / 4
        ) {
          throw invalid();
        }
      } finally {
        image.close();
      }
    }
  } finally {
    decoder.close();
  }
};
