import { expectTypeOf, it } from 'vitest';
import type { expectNativeGeo, GeoSpecNativeAuthoringSubject, GeoSpecNativeRunnerMatcher } from '#index.js';

it('types the explicit native authoring helper without changing legacy expectGeo', () => {
  expectTypeOf<Parameters<typeof expectNativeGeo>[0]>().toEqualTypeOf<GeoSpecNativeAuthoringSubject>();
  expectTypeOf<ReturnType<typeof expectNativeGeo>>().toEqualTypeOf<GeoSpecNativeRunnerMatcher>();

  const contentIdentity = { contentHash: 'sha256:content' } satisfies GeoSpecNativeAuthoringSubject;
  const subjectIdentity = { subjectHash: 'sha256:subject' } satisfies GeoSpecNativeAuthoringSubject;
  // @ts-expect-error Native authoring requires at least one admitted identity.
  const missingIdentity: GeoSpecNativeAuthoringSubject = {};

  void contentIdentity;
  void subjectIdentity;
  void missingIdentity;
});
