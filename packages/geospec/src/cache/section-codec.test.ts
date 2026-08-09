import { describe, expect, it } from 'vitest';
import {
  decodeSectionedPayload,
  encodeSectionedPayload,
  sectionToFloat64,
  sectionToUint32,
  typedArrayBytes,
} from '#cache/section-codec.js';

describe('sectioned evidence payload codec', () => {
  it('should round-trip a JSON header with float64 and uint32 sections', () => {
    const positions = new Float64Array([1.5, -2.25, 3.125, 0, 9.75, -0.5]);
    const indices = new Uint32Array([0, 1, 2, 2, 1, 0, 7]);
    const header = { kind: 'test', counts: { vertices: 2 } };

    const encoded = encodeSectionedPayload(header, [typedArrayBytes(positions), typedArrayBytes(indices)]);
    const decoded = decodeSectionedPayload(encoded);

    expect(decoded.header).toEqual(header);
    expect(decoded.sections).toHaveLength(2);
    expect([...sectionToFloat64(decoded.sections[0]!)]).toEqual([...positions]);
    expect([...sectionToUint32(decoded.sections[1]!)]).toEqual([...indices]);
  });

  it('should round-trip zero sections and empty sections', () => {
    const headerOnly = decodeSectionedPayload(encodeSectionedPayload({ empty: true }, []));
    expect(headerOnly.header).toEqual({ empty: true });
    expect(headerOnly.sections).toEqual([]);

    const withEmpty = decodeSectionedPayload(
      encodeSectionedPayload({ n: 1 }, [typedArrayBytes(new Float64Array(0)), typedArrayBytes(new Uint32Array([5]))]),
    );
    expect(sectionToFloat64(withEmpty.sections[0]!)).toHaveLength(0);
    expect([...sectionToUint32(withEmpty.sections[1]!)]).toEqual([5]);
  });

  it('should decode from a misaligned view by copying', () => {
    const payload = encodeSectionedPayload({ v: 1 }, [typedArrayBytes(new Float64Array([42.5, -1]))]);
    // Place the payload at an odd offset inside a larger buffer, as a raw
    // (uncompressed) store body slice would.
    const shifted = new Uint8Array(payload.byteLength + 3);
    shifted.set(payload, 3);
    const view = shifted.subarray(3);

    const decoded = decodeSectionedPayload(view);

    expect(decoded.header).toEqual({ v: 1 });
    expect([...sectionToFloat64(decoded.sections[0]!)]).toEqual([42.5, -1]);
  });

  it('should keep every section 8-byte aligned regardless of header length', () => {
    // Header lengths 1..24 sweep every padding remainder.
    for (let padding = 1; padding <= 24; padding += 1) {
      const header = { pad: 'x'.repeat(padding) };
      const first = new Float64Array([1e-9, 2e9]);
      const second = new Uint32Array([3, 4, 5]);
      const decoded = decodeSectionedPayload(
        encodeSectionedPayload(header, [typedArrayBytes(first), typedArrayBytes(second)]),
      );
      expect([...sectionToFloat64(decoded.sections[0]!)]).toEqual([...first]);
      expect([...sectionToUint32(decoded.sections[1]!)]).toEqual([...second]);
    }
  });
});
