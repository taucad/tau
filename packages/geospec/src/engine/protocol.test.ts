import { describe, expect, it } from 'vitest';
import {
  assertGeoSpecJsonValue,
  decodeGeoSpecCanonicalJson,
  encodeGeoSpecCanonicalJson,
  isGeoSpecJsonValue,
  toGeoSpecProtocolJson,
} from '#engine/protocol.js';

class LiveHandle {
  public get id(): number {
    return 1;
  }
}

describe('Contract-B JSON boundary', () => {
  it('accepts only finite, acyclic JSON values', () => {
    expect(isGeoSpecJsonValue({ ok: [1, true, null, 'x'] })).toBe(true);
    expect(isGeoSpecJsonValue({ value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isGeoSpecJsonValue({ value: () => undefined })).toBe(false);
    expect(isGeoSpecJsonValue(new Map())).toBe(false);
    expect(isGeoSpecJsonValue(new LiveHandle())).toBe(false);
    expect(isGeoSpecJsonValue(/face/giu)).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(isGeoSpecJsonValue(cycle)).toBe(false);
    expect(() => {
      assertGeoSpecJsonValue({ value: () => undefined });
    }).toThrow(TypeError);
  });

  it('canonicalizes object keys recursively', () => {
    const encoded = encodeGeoSpecCanonicalJson({ z: 1, a: { y: 2, b: 3 } });

    expect(new TextDecoder().decode(encoded)).toBe('{"a":{"b":3,"y":2},"z":1}');
    expect(decodeGeoSpecCanonicalJson(encoded)).toStrictEqual({ a: { b: 3, y: 2 }, z: 1 });
  });

  it('serializes the two explicit TypeScript bindings and rejects live objects', () => {
    expect(toGeoSpecProtocolJson(/bolt-(?<id>\d+)/giu)).toStrictEqual({
      type: 'regexp',
      pattern: String.raw`bolt-(?<id>\d+)`,
      flags: 'giu',
    });
    expect(toGeoSpecProtocolJson({ subjectId: 'subject-7', ignored: new LiveHandle() })).toStrictEqual({
      type: 'subject-reference',
      subjectId: 'subject-7',
    });
    expect(() => toGeoSpecProtocolJson(new Map())).toThrow(TypeError);
    expect(() => toGeoSpecProtocolJson(new LiveHandle())).toThrow(TypeError);
    expect(() => toGeoSpecProtocolJson({ callback: () => undefined })).toThrow(TypeError);
    expect(toGeoSpecProtocolJson(undefined)).toBeNull();
    expect(() => toGeoSpecProtocolJson(Number.NaN)).toThrow('non-finite');
  });
});
