import { describe, expectTypeOf, it } from 'vitest';
import type { expectGeo, GeoSpecAssertion, GeoSpecMatcher, GeoSpecSubject } from 'geospec';
import type { GeoSpecMatcherName } from 'geospec/engine';

describe('canonical authoring types', () => {
  it('should expose completed assertions, negation and fixed capabilities on opaque subjects', () => {
    expectTypeOf<Parameters<typeof expectGeo>[0]>().toEqualTypeOf<GeoSpecSubject>();
    expectTypeOf<ReturnType<typeof expectGeo>>().toEqualTypeOf<GeoSpecMatcher>();
    expectTypeOf<ReturnType<GeoSpecMatcher['toBeWatertight']>>().toEqualTypeOf<GeoSpecAssertion>();
    expectTypeOf<GeoSpecMatcher['not']['toHaveBoundingBox']>().toEqualTypeOf<GeoSpecMatcher['toHaveBoundingBox']>();
    expectTypeOf<Parameters<GeoSpecMatcher['toSatisfyRationalPlate']>['length']>().toEqualTypeOf<0>();
    expectTypeOf<Parameters<GeoSpecMatcher['toSatisfyParallelPlaneDistance']>['length']>().toEqualTypeOf<0>();
    // @ts-expect-error -- Hash identity does not establish host admission.
    const forged: GeoSpecSubject = { subjectHash: 'a'.repeat(64) };
    // @ts-expect-error -- Chain modifiers are not matcher methods.
    const modifier: GeoSpecMatcherName = 'not';
    void forged;
    void modifier;
  });
});
