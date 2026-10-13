import { describe, expect, it } from 'vitest';
import { protocolWireValue } from '#cli/wire-value.js';

describe('protocolWireValue', () => {
  it('should serialize every supported wire value and reject lossy values', () => {
    expect(protocolWireValue(undefined)).toBeNull();
    expect(protocolWireValue(null)).toBeNull();
    expect(protocolWireValue('value')).toBe('value');
    expect(protocolWireValue(true)).toBe(true);
    expect(protocolWireValue(4)).toBe(4);
    expect(protocolWireValue(new Error('boom'))).toStrictEqual({ name: 'Error', message: 'boom' });
    expect(protocolWireValue(/mount/iu)).toStrictEqual({ type: 'regexp', pattern: 'mount', flags: 'iu' });
    expect(protocolWireValue(new Uint16Array([1, 2]))).toStrictEqual([1, 2]);
    expect(protocolWireValue([1, { keep: true }])).toStrictEqual([1, { keep: true }]);
    expect(protocolWireValue({ keep: 1, drop: undefined })).toStrictEqual({ keep: 1 });
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { value: 1 });
    expect(protocolWireValue(nullPrototype)).toStrictEqual({ value: 1 });

    expect(() => protocolWireValue(Number.NaN)).toThrow(/non-finite/u);
    expect(() => protocolWireValue(() => undefined)).toThrow(/non-wire/u);
    expect(() => protocolWireValue(new Map())).toThrow(/non-plain/u);
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => protocolWireValue(cyclic)).toThrow(/non-wire/u);
  });
});
