import { describe, expect, it } from 'vitest';
import { decodeSections, encodeSections, float32ToSection, sectionToFloat32 } from '#cache/section-codec.js';

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => Uint8Array.from(values);

describe('section codec', () => {
  it('should round-trip a header and three sections', () => {
    const positions = Float32Array.from([1.5, -2.25, 3]);
    const frame = encodeSections({ triangleCount: 1, primitive: 'part#0' }, [
      float32ToSection(positions),
      bytes(1, 2, 3, 4, 5),
      bytes(),
    ]);

    const decoded = decodeSections(frame);

    expect(decoded?.header).toEqual({ triangleCount: 1, primitive: 'part#0' });
    expect(decoded?.sections).toHaveLength(3);
    expect([...sectionToFloat32(decoded!.sections[0]!)]).toEqual([1.5, -2.25, 3]);
    expect([...decoded!.sections[1]!]).toEqual([1, 2, 3, 4, 5]);
    expect(decoded!.sections[2]!.byteLength).toBe(0);
  });

  it('should keep every section 8-byte aligned so a typed view needs no copy', () => {
    // Deliberately unaligned lengths: 5 and 3 bytes both need padding.
    const frame = encodeSections({ a: 1 }, [bytes(1, 2, 3, 4, 5), bytes(9, 9, 9)]);
    expect(frame.byteLength % 8).toBe(0);

    // The decoder must find both sections despite the padding.
    const decoded = decodeSections(frame);
    expect([...decoded!.sections[1]!]).toEqual([9, 9, 9]);
  });

  it('should round-trip a payload with no sections at all', () => {
    const decoded = decodeSections(encodeSections({ only: 'header' }, []));
    expect(decoded).toEqual({ header: { only: 'header' }, sections: [] });
  });

  it('should treat a frame shorter than its own prefix as unreadable', () => {
    expect(decodeSections(bytes(1, 2, 3))).toBeUndefined();
  });

  it('should reject foreign magic and future versions rather than misparse them', () => {
    const frame = encodeSections({ a: 1 }, []);
    const foreign = Uint8Array.from(frame);
    foreign[0] = 0;
    expect(decodeSections(foreign)).toBeUndefined();

    const future = Uint8Array.from(frame);
    new DataView(future.buffer).setUint32(4, 99, true);
    expect(decodeSections(future)).toBeUndefined();
  });

  it('should treat a truncated header as unreadable', () => {
    const frame = encodeSections({ padding: 'x'.repeat(64) }, []);
    expect(decodeSections(frame.slice(0, 24))).toBeUndefined();
  });

  it('should treat a truncated section as unreadable', () => {
    const frame = encodeSections({ a: 1 }, [bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)]);
    expect(decodeSections(frame.slice(0, frame.byteLength - 8))).toBeUndefined();
  });

  it('should treat a corrupt header body as unreadable', () => {
    const frame = encodeSections({ a: 1 }, []);
    // Corrupt a byte inside the header body (it starts at the 16-byte prefix).
    frame[17] = 0;
    expect(decodeSections(frame)).toBeUndefined();
  });
});
