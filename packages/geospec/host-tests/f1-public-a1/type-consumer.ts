import { expect } from 'vitest';
import type { GeoSpecAssertionClient } from '@taucad/geospec/vitest';
import type { GeoSpecCanonicalClaimReport, GeoSpecNativeSubject } from '@taucad/geospec/assertion-client';

export const invokeStandalone = async (
  client: GeoSpecAssertionClient,
  subject: GeoSpecNativeSubject,
): Promise<GeoSpecCanonicalClaimReport> => client.expectGeo(subject).toSatisfyRationalPlate();

export const invokeVitest = async (subject: GeoSpecNativeSubject): Promise<void> =>
  expect(subject).toSatisfyRationalPlate();

export const rejectStandaloneArgument = (client: GeoSpecAssertionClient, subject: GeoSpecNativeSubject): void => {
  // @ts-expect-error The fixed native matcher is nullary.
  void client.expectGeo(subject).toSatisfyRationalPlate({});
};

export const rejectVitestArgument = (subject: GeoSpecNativeSubject): void => {
  // @ts-expect-error The installed Vitest matcher is nullary.
  void expect(subject).toSatisfyRationalPlate({});
};
