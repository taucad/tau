import { describe, expect, it } from 'vitest';
import { deserializeSelector, serializeSelector } from '#selector/types.js';
import type { FaceSelector, GeometrySelector } from '#selector/types.js';

describe('selector serialization', () => {
  it('should serialize RegExp fields as { pattern, flags } JSON-safe values', () => {
    const selector: GeometrySelector = { kind: 'face', of: /cube[AB]/iu, query: { surfaceType: 'plane' } };

    const serialized = serializeSelector(selector);

    expect(serialized).toEqual({
      kind: 'face',
      of: { __isRegExp: true, pattern: 'cube[AB]', flags: 'iu' },
      query: { surfaceType: 'plane' },
    });
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });

  it('should round-trip a nested selector through JSON preserving RegExp semantics', () => {
    const selector: FaceSelector = {
      kind: 'face',
      of: /cube/u,
      expect: { exactly: 2 },
      query: {
        surfaceType: 'plane',
        normal: { direction: [0, 0, 1], angularToleranceDegrees: 1 },
        allOf: [{ area: { min: 50 } }],
        not: { offset: 0 },
        within: { kind: 'occurrence', name: /Cube/u },
      },
    };

    const wire = JSON.stringify(serializeSelector(selector));
    const roundTripped = deserializeSelector(JSON.parse(wire));

    expect(roundTripped).toEqual(selector);
    const { of } = roundTripped as FaceSelector;
    expect(of).toBeInstanceOf(RegExp);
  });

  it('should not resurrect a plain { pattern, flags } data object as a RegExp', () => {
    const plain = { pattern: 'x', flags: 'g' };
    const selector = { kind: 'face', of: /cube/u, query: { metadata: plain } } as unknown as GeometrySelector;

    const roundTripped = deserializeSelector(JSON.parse(JSON.stringify(serializeSelector(selector))));

    const { query, of } = roundTripped as FaceSelector & { query: { metadata: unknown } };
    expect(of).toBeInstanceOf(RegExp);
    expect((of as RegExp).source).toBe('cube');
    expect(query.metadata).not.toBeInstanceOf(RegExp);
    expect(query.metadata).toEqual(plain);
  });

  it('should pass string shorthand selectors through serialization unchanged', () => {
    expect(serializeSelector('block.deck.left')).toBe('block.deck.left');
    expect(deserializeSelector('block.deck.left')).toBe('block.deck.left');
  });
});
