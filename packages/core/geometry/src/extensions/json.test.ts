import { describe, expect, it } from 'vitest';
import { cloneJson, decodeJsonObject, encodeJsonObject, isJsonObject } from '#extensions/json.js';

describe('JSON extension helpers', () => {
  it('should encode, decode, and clone JSON extension payloads', () => {
    const payload = {
      schemaVersion: 1,
      components: [{ id: 'component:body', primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] }],
    };

    const decoded = decodeJsonObject(encodeJsonObject(payload));
    const cloned = cloneJson(decoded);

    expect(decoded).toEqual(payload);
    expect(cloned).toEqual(payload);
    expect(cloned).not.toBe(decoded);
    expect(isJsonObject(decoded)).toBe(true);
    expect(isJsonObject([])).toBe(false);
  });
});
