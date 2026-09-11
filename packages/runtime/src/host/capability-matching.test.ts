import { describe, expect, expectTypeOf, it } from 'vitest';
import { matchHostCapabilities } from '#host/capability-matching.js';
import type { HostCapabilityRequirement, MatchHostCapabilitiesInput } from '#host/capability-matching.js';

describe('host capability matching', () => {
  it('should match equals, one-of and at-least finite scalars without slot accounting', () => {
    const requirements = [
      { key: 'executor', condition: 'one-of', values: ['native', 'wasm'] },
      { key: 'memory', condition: 'at-least', value: 8 },
      { key: 'container', condition: 'equals', value: true },
    ] satisfies readonly HostCapabilityRequirement[];
    expect(
      matchHostCapabilities({
        capabilities: { executor: 'native', memory: 16, container: true },
        requirements,
      }),
    ).toEqual({ matched: true });
  });

  const rejectedCases: ReadonlyArray<readonly [string, MatchHostCapabilitiesInput]> = [
    ['missing capability', { capabilities: {}, requirements: [{ key: 'native', condition: 'equals', value: true }] }],
    ['empty one-of', { capabilities: { mode: 'a' }, requirements: [{ key: 'mode', condition: 'one-of', values: [] }] }],
    [
      'non-finite actual',
      { capabilities: { memory: Number.NaN }, requirements: [{ key: 'memory', condition: 'at-least', value: 1 }] },
    ],
    [
      'non-finite threshold',
      {
        capabilities: { memory: 8 },
        requirements: [{ key: 'memory', condition: 'at-least', value: Number.POSITIVE_INFINITY }],
      },
    ],
  ];

  it.each(rejectedCases)('should reject %s', (_name, input) => {
    expect(matchHostCapabilities(input).matched).toBe(false);
  });

  it('should preserve the caller requirement type in an unmatched result', () => {
    const input = {
      capabilities: { memory: 4 },
      requirements: [{ key: 'memory', condition: 'at-least', value: 8 }],
    } as const satisfies MatchHostCapabilitiesInput;
    const result = matchHostCapabilities(input);
    if (!result.matched) {
      expectTypeOf(result.requirement).toEqualTypeOf<(typeof input.requirements)[number]>();
    }
  });

  it('should reject invalid JavaScript values, inherited advertisements and unknown conditions', () => {
    const inherited = Object.create({ container: true }) as Record<string, unknown>;
    const cases = [
      { capabilities: { feature: null }, requirements: [{ key: 'feature', condition: 'equals', value: null }] },
      { capabilities: { feature: {} }, requirements: [{ key: 'feature', condition: 'equals', value: {} }] },
      { capabilities: inherited, requirements: [{ key: 'container', condition: 'equals', value: true }] },
      {
        capabilities: { container: true },
        requirements: [{ key: 'container', condition: 'approximately', value: true }],
      },
    ];
    for (const input of cases) {
      expect(Reflect.apply(matchHostCapabilities, undefined, [input])).toEqual({
        matched: false,
        requirement: input.requirements[0],
      });
    }
  });
});
