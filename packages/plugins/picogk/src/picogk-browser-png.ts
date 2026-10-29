/* oxlint-disable no-await-in-loop -- Raster streams are consumed serially to bound memory and validate every frame. */
/* oxlint-disable no-bitwise -- PNG CRC32 is defined over bit shifts and XOR. */
const maximumRasterBytes = 256 * 1024 * 1024;
const invalid = (): Error => new Error('PicoGK material must contain a complete valid PNG raster.');

const crc32 = (bytes: Uint8Array<ArrayBuffer>): number => {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xed_b8_83_20);
    }
  }
  return ~crc >>> 0;
};

type Raster = { width: number; height: number; parts: Array<Uint8Array<ArrayBuffer>> };

const validateRaster = async (
  raster: Raster,
  options: { depth: number; channels: number; interlace: number },
): Promise<void> => {
  const { depth, channels, interlace } = options;
  const passes =
    interlace === 0
      ? [[0, 0, 1, 1]]
      : [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ];
  const rows: Array<{ count: number; length: number }> = [];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const width = Math.max(0, Math.ceil((raster.width - x!) / dx!));
    const height = Math.max(0, Math.ceil((raster.height - y!) / dy!));
    if (width === 0 || height === 0) {
      continue;
    }
    const length = 1 + Math.ceil((width * channels * depth) / 8);
    expected += length * height;
    rows.push({ count: height, length });
  }
  // 16-bit PNG uses more bytes per sample than its admitted RGBA8 presentation.
  if (raster.parts.length === 0) {
    throw invalid();
  }
  const reader = new Blob(raster.parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let consumed = 0;
  let pass = 0;
  let row = 0;
  let column = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let cursor = 0;
      while (cursor < value.length) {
        const layout = rows[pass];
        if (layout === undefined || (column === 0 && value[cursor]! > 4)) {
          throw invalid();
        }
        const count = Math.min(layout.length - column, value.length - cursor);
        consumed += count;
        column += count;
        cursor += count;
        if (column === layout.length) {
          column = 0;
          row++;
          if (row === layout.count) {
            row = 0;
            pass++;
          }
        }
      }
    }
    if (consumed !== expected) {
      throw invalid();
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
};

/**
 * Reject truncated or concealed PNG raster failures before browser image decoding.
 * @internal
 * @param bytes - Owned encoded PNG bytes after the managed dimension admission check.
 * @returns The animation frame count after every default/APNG raster passes validation.
 */
export const validatePicogkPng = async (bytes: Uint8Array<ArrayBuffer>): Promise<number> => {
  if (bytes.length < 33) {
    throw invalid();
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const depth = bytes[24]!;
  const color = bytes[25]!;
  const channels = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]).get(color);
  const interlace = bytes[28]!;
  if (
    width === 0 ||
    height === 0 ||
    width * height > maximumRasterBytes / 4 ||
    channels === undefined ||
    ![1, 2, 4, 8, 16].includes(depth) ||
    (color === 3 && depth === 16) ||
    (color !== 0 && color !== 3 && depth < 8) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    interlace > 1
  ) {
    throw invalid();
  }
  const rasters: Raster[] = [{ width, height, parts: [] }];
  let current = rasters[0]!;
  let declaredFrames = 0;
  let frames = 0;
  let sequence = 0;
  let ended = false;
  let idatSeen = false;
  for (let offset = 8; offset < bytes.length; ) {
    if (offset + 12 > bytes.length) {
      throw invalid();
    }
    const length = view.getUint32(offset);
    const end = offset + length + 12;
    if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) {
      throw invalid();
    }
    const kind = String.fromCodePoint(...bytes.subarray(offset + 4, offset + 8));
    const payload = offset + 8;
    if (offset === 8 && (kind !== 'IHDR' || length !== 13)) {
      throw invalid();
    }
    switch (kind) {
      case 'acTL': {
        if (length !== 8 || idatSeen || declaredFrames !== 0) {
          throw invalid();
        }
        declaredFrames = view.getUint32(payload);
        if (declaredFrames === 0) {
          throw invalid();
        }
        break;
      }
      case 'fcTL': {
        if (declaredFrames === 0 || length !== 26 || view.getUint32(payload) !== sequence++) {
          throw invalid();
        }
        const frameWidth = view.getUint32(payload + 4);
        const frameHeight = view.getUint32(payload + 8);
        if (
          frameWidth === 0 ||
          frameHeight === 0 ||
          frameWidth + view.getUint32(payload + 12) > width ||
          frameHeight + view.getUint32(payload + 16) > height ||
          bytes[payload + 24]! > 2 ||
          bytes[payload + 25]! > 1
        ) {
          throw invalid();
        }
        frames++;
        if (idatSeen) {
          current = { width: frameWidth, height: frameHeight, parts: [] };
          rasters.push(current);
        } else if (frames !== 1 || frameWidth !== width || frameHeight !== height) {
          throw invalid();
        }
        break;
      }
      case 'IDAT': {
        if (current !== rasters[0]) {
          throw invalid();
        }
        idatSeen = true;
        current.parts.push(bytes.slice(payload, payload + length));
        break;
      }
      case 'fdAT': {
        if (!idatSeen || current === rasters[0] || length < 4 || view.getUint32(payload) !== sequence++) {
          throw invalid();
        }
        current.parts.push(bytes.slice(payload + 4, payload + length));
        break;
      }
      case 'IEND': {
        if (length !== 0 || end !== bytes.length) {
          throw invalid();
        }
        ended = true;
        break;
      }
      default: {
        break;
      }
    }
    offset = end;
  }
  if (!ended || !idatSeen || frames !== declaredFrames) {
    throw invalid();
  }
  for (const raster of rasters) {
    await validateRaster(raster, { depth, channels, interlace });
  }
  return declaredFrames === 0 ? 1 : declaredFrames;
};
