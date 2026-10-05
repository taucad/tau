/** Small GLB 2.0 fixture with optional JSON and BIN content. @internal */
export const testGlb = (document: Record<string, unknown>, binary = new Uint8Array()): Uint8Array<ArrayBuffer> => {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binaryLength = Math.ceil(binary.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength + (binaryLength === 0 ? 0 : 8 + binaryLength));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.fill(0x20, 20);
  bytes.set(json, 20);
  if (binaryLength > 0) {
    const offset = 20 + jsonLength;
    view.setUint32(offset, binaryLength, true);
    view.setUint32(offset + 4, 0x00_4e_49_42, true);
    bytes.set(binary, offset + 8);
  }
  return bytes;
};

/** Minimal valid GLB 2.0 for runtime-private publication tests. @internal */
export const emptyGlb = (): Uint8Array<ArrayBuffer> =>
  testGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 });
