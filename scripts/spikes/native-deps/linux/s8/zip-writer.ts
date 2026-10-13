/**
 * Spike S8 helper: a minimal zip writer for synthesized wheel variants (spike code only).
 * Writes stored or deflated members, directory entries, optional ZIP64 extras on every entry
 * and an optional ZIP64 end of central directory, so the reader's ZIP64 path is exercised
 * without a 4 GiB fixture.
 */

/* oxlint-disable no-bitwise -- zip records are bit fields. */

import { crc32, deflateRawSync } from 'node:zlib';

/** One member; a name ending in `/` is a directory. */
export type ZipInput = {
  name: string;
  data?: Uint8Array<ArrayBuffer>;
  method?: 0 | 8;
  /** Writes a different method number over the member's bytes (an unsupported-method fixture). */
  labelMethod?: number;
  mode?: number;
};

/**
 * Writes a zip archive.
 *
 * @param entries - Members in order.
 * @param options - `zip64` forces ZIP64 extras and the ZIP64 end records.
 * @returns Zip bytes.
 */
export const writeZip = (entries: readonly ZipInput[], options: { zip64?: boolean } = {}): Uint8Array<ArrayBuffer> => {
  const zip64 = options.zip64 === true;
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  const central: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data ?? new Uint8Array();
    const method = entry.name.endsWith('/') ? 0 : (entry.method ?? 8);
    const body = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const label = entry.labelMethod ?? method;
    const crc = crc32(data);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    const localExtra = Buffer.alloc(zip64 ? 20 : 0);
    if (zip64) {
      extra.writeUInt16LE(0x00_01, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(data.byteLength), 4);
      extra.writeBigUInt64LE(BigInt(body.byteLength), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
      localExtra.writeUInt16LE(0x00_01, 0);
      localExtra.writeUInt16LE(16, 2);
      localExtra.writeBigUInt64LE(BigInt(data.byteLength), 4);
      localExtra.writeBigUInt64LE(BigInt(body.byteLength), 12);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(zip64 ? 45 : 20, 4);
    local.writeUInt16LE(0x08_00, 6);
    local.writeUInt16LE(label, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : body.byteLength, 18);
    local.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : data.byteLength, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    chunks.push(local, name, localExtra, body);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02_01_4b_50, 0);
    record.writeUInt16LE((3 << 8) | 45, 4);
    record.writeUInt16LE(zip64 ? 45 : 20, 6);
    record.writeUInt16LE(0x08_00, 8);
    record.writeUInt16LE(label, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : body.byteLength, 20);
    record.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : data.byteLength, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(extra.length, 30);
    const mode = entry.mode ?? (entry.name.endsWith('/') ? 0x41_ed : 0x81_a4);
    record.writeUInt32LE((mode << 16) >>> 0, 38);
    record.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : offset, 42);
    central.push(record, name, extra);
    offset += local.length + name.length + localExtra.length + body.length;
  }
  const centralBytes = Buffer.concat(central);
  const tail: Array<Uint8Array<ArrayBuffer>> = [];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06_06_4b_50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(entries.length), 24);
    record.writeBigUInt64LE(BigInt(entries.length), 32);
    record.writeBigUInt64LE(BigInt(centralBytes.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07_06_4b_50, 0);
    locator.writeBigUInt64LE(BigInt(offset + centralBytes.length), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(zip64 ? 0xff_ff : entries.length, 8);
  end.writeUInt16LE(zip64 ? 0xff_ff : entries.length, 10);
  end.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : centralBytes.length, 12);
  end.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, centralBytes, ...tail, end]));
};
