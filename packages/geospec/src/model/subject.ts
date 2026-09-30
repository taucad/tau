/** Private admission ownership for canonical model subjects. @module */

import type { GeoSpecAssertionClient, GeoSpecAssertionClientOptions } from '#assertion-client/client.js';
import type { GeoSpecNativeSubject } from '#engine/client.js';
import type { GeoSpecModelLoadEvidence } from '#model/native-model-loader.js';

declare const subjectBrand: unique symbol;

/** A model admitted by one live GeoSpec host scope. Load it through `geospec/model`. @public */
export type GeoSpecSubject = { readonly [subjectBrand]: true };

type Admission = {
  readonly client: GeoSpecAssertionClient;
  readonly engine: GeoSpecAssertionClientOptions['engine'];
  readonly identity: GeoSpecNativeSubject;
  readonly isLive: () => boolean;
  readonly load?: GeoSpecModelLoadEvidence;
  readonly ensureResident?: () => void;
};

const rawResidency = new WeakMap<GeoSpecNativeSubject, () => void>();

/**
 * Associate the final raw load wrapper with its private residency owner.
 * @internal
 * @param subject - The final wrapper returned by the native model loader.
 * @param ensureResident - Synchronous restoration under the loader's live scope.
 */
export const bindRawSubjectResidency = (subject: GeoSpecNativeSubject, ensureResident: () => void): void => {
  rawResidency.set(subject, ensureResident);
};

/**
 * Preserve private residency when a host binds the final raw load wrapper.
 * @internal
 * @param subject - The exact final load wrapper, not a copied hash descriptor.
 * @returns Its private restoration callback, when owned by a native loader.
 */
export const rawSubjectResidency = (subject: GeoSpecNativeSubject): (() => void) | undefined =>
  rawResidency.get(subject);

// oxlint-disable-next-line typescript/no-restricted-types -- WeakMap keys must accept arbitrary opaque objects without structural authority.
const admissions = new WeakMap<object, Admission>();

/**
 * Bind one successful host admission to its live owning scope.
 * @internal
 * @param options - The initialized client, identity and lifetime owned by the host.
 * @returns An opaque authoring subject.
 */
export const bindGeoSpecSubject = (options: {
  readonly client: GeoSpecAssertionClient;
  readonly engine: GeoSpecAssertionClientOptions['engine'];
  readonly identity: GeoSpecNativeSubject;
  readonly isLive: () => boolean;
  readonly load?: GeoSpecModelLoadEvidence;
  readonly ensureResident?: () => void;
}): GeoSpecSubject => {
  const subject = Object.freeze({});
  admissions.set(subject, {
    client: options.client,
    engine: options.engine,
    identity: options.identity,
    isLive: options.isLive,
    ...(options.load === undefined ? {} : { load: options.load }),
    ...(options.ensureResident === undefined ? {} : { ensureResident: options.ensureResident }),
  });
  // The brand has no runtime representation: only this private map establishes admission.
  return subject as GeoSpecSubject;
};

/**
 * Resolve a live subject without treating its digest as authority.
 * @internal
 * @param subject - The opaque subject returned by admission.
 * @param engine - Optional expected engine owner.
 * @returns The live private admission.
 */
export const resolveGeoSpecSubject = (subject: unknown, engine?: Admission['engine']): Admission => {
  const admission = typeof subject === 'object' && subject !== null ? admissions.get(subject) : undefined;
  if (admission === undefined || !admission.isLive() || (engine !== undefined && admission.engine !== engine)) {
    throw Object.assign(
      new TypeError('This subject is not admitted by the active GeoSpec host. Reload it within its live scope.'),
      {
        code: 'GEOSPEC_SUBJECT_INVALID',
      },
    );
  }
  admission.ensureResident?.();
  return admission;
};
