/**
 * Walk an arbitrarily nested value and collect every unique `ArrayBuffer`
 * that backs a typed array, plus standalone `ArrayBuffer` instances.
 *
 * @param value - Arbitrarily nested value to scan for ArrayBuffers.
 * @returns De-duplicated list of transferable ArrayBuffers.
 * @public
 */
export function extractTransferables(value: unknown): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  function walk(v: unknown): void {
    if (v instanceof ArrayBuffer) {
      seen.add(v);
    } else if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) {
      seen.add(v.buffer);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        walk(item);
      }
    } else if (v !== null && typeof v === 'object') {
      for (const property of Object.values(v)) {
        walk(property);
      }
    }
  }

  walk(value);
  return [...seen];
}
