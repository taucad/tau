/**
 * Image options nanoraster accepts only from its viewer-parity release (Tau charter
 * `nanoraster-viewer-parity-charter`, W1–W3, plus `lineColor`). An earlier backend rejects an unknown key, so until
 * the catalog moves to that release the transcoder renders without them instead of failing the whole image. The
 * lighting rig is rewritten in the earlier backend's terms where they say the same thing: a lit view-space headlamp
 * becomes the first directional light, and a card-less environment becomes `'studio'`, the same neutral room.
 *
 * Delete this module, and pass the options straight through, in the change that moves the `nanoraster` catalog pin
 * to the release that declares them.
 */

import type * as Nanoraster from 'nanoraster';
import { renderImageMaxLights } from 'nanoraster';

const releaseOptionKeys = ['lineColor', 'toneMapping'] as const;
const releaseAoKeys = ['thicknessRatio', 'denoiseDepthTolerance', 'samples', 'resolutionScale'] as const;
/** The backend aims its headlamp this many scene radii ahead of the camera: view direction `[right, up, 2]`. */
const headlampAimRadii = 2;

type ReleaseOptionKey = (typeof releaseOptionKeys)[number];
type ReleaseAoKey = (typeof releaseAoKeys)[number];

/** True once the installed nanoraster declares every viewer-parity option. */
type BackendDeclaresViewerProfileOptions = [ReleaseOptionKey] extends [keyof Nanoraster.RenderImageOptions]
  ? [ReleaseAoKey] extends [keyof Nanoraster.RenderAmbientOcclusion]
    ? ['headlamp'] extends [keyof Exclude<Nanoraster.RenderLighting, 'studio'>]
      ? true
      : false
    : false
  : false;

/**
 * Whether the installed backend accepts the viewer-parity options. The annotation stops compiling once the dependency
 * declares them, so the catalog bump that brings them must also turn this on.
 */
export const backendAcceptsViewerProfileOptions: BackendDeclaresViewerProfileOptions = false;

type Headlamp = Readonly<{ intensity: number; rightOffset: number; upOffset: number }>;
type LightingRig = Readonly<{
  lights: ReadonlyArray<Readonly<{ direction: readonly number[]; color: readonly number[] }>>;
  headlamp?: Headlamp | undefined;
  environment?: 'studio' | 'none' | Readonly<{ intensity: number; cards?: readonly unknown[] | undefined }> | undefined;
  space?: 'view' | 'world' | undefined;
}>;

type GatedOptions = Readonly<Record<string, unknown>> &
  Readonly<{
    ao?: Readonly<Record<string, unknown>> | undefined;
    lighting?: 'studio' | LightingRig | undefined;
  }>;

/** A lighting rig in the earlier backend's terms: no headlamp, a named environment. */
type WithheldLighting<Lighting> = Lighting extends LightingRig
  ? Omit<Lighting, 'headlamp' | 'environment'> & { readonly environment?: Extract<Lighting['environment'], string> }
  : Lighting;

/** Options with the viewer-parity keys removed, member by member of a union. */
export type WithheldViewerProfileOptions<Options extends GatedOptions> = Options extends unknown
  ? Omit<Options, ReleaseOptionKey | 'ao' | 'lighting'> &
      (undefined extends Options['ao']
        ? { readonly ao?: Omit<NonNullable<Options['ao']>, ReleaseAoKey> }
        : { readonly ao: Omit<NonNullable<Options['ao']>, ReleaseAoKey> }) &
      (undefined extends Options['lighting']
        ? { readonly lighting?: WithheldLighting<NonNullable<Options['lighting']>> }
        : { readonly lighting: WithheldLighting<Options['lighting']> })
  : never;

const present = (record: Readonly<Record<string, unknown>>, keys: readonly string[]): string[] =>
  keys.filter((key) => record[key] !== undefined);

const without = (record: Readonly<Record<string, unknown>>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

/**
 * The rig in the earlier backend's terms. A lit headlamp in a view-space rig with a free light slot is the same light
 * as a view-space directional light along `[rightOffset, upOffset, 2]` placed first, as nanoraster orders it; a
 * card-less environment at intensity 1 is `'studio'`. Anything else has no equivalent and is named as withheld.
 *
 * @param lighting - The validated rig.
 * @param withheld - Collects the dotted names of the options with no equivalent.
 * @returns The rig to render with.
 */
const withholdLighting = (lighting: LightingRig, withheld: string[]): Record<string, unknown> => {
  const { headlamp, environment, ...rig } = lighting;
  let { lights } = rig;
  if (headlamp !== undefined && headlamp.intensity > 0) {
    if ((rig.space ?? 'view') === 'view' && lights.length < renderImageMaxLights) {
      const { intensity, rightOffset, upOffset } = headlamp;
      lights = [
        { direction: [rightOffset, upOffset, headlampAimRadii], color: [intensity, intensity, intensity] },
        ...lights,
      ];
    } else {
      withheld.push('lighting.headlamp');
    }
  }
  if (typeof environment === 'object') {
    if (environment.cards !== undefined) {
      withheld.push('lighting.environment.cards');
    }
    if (environment.intensity !== 1) {
      withheld.push('lighting.environment.intensity');
    }
  }
  return {
    ...rig,
    lights,
    ...(environment === undefined ? {} : { environment: typeof environment === 'object' ? 'studio' : environment }),
  };
};

/**
 * Remove the viewer-parity options a backend does not accept, rewriting the lighting rig in its terms where they
 * render the same light.
 *
 * @param options - Validated image export options.
 * @param backend - Whether the backend accepts the viewer-parity options, and who to tell about removed ones.
 * @param backend.accepted - Whether the backend accepts the viewer-parity options.
 * @param backend.onWithheld - Called with the dotted names of the supplied options that were removed, if any.
 * @returns The options to render with.
 */
export const withholdViewerProfileOptions = <Options extends GatedOptions>(
  options: Options,
  backend: Readonly<{ accepted: boolean; onWithheld: (names: readonly string[]) => void }>,
): WithheldViewerProfileOptions<Options> => {
  if (backend.accepted) {
    return options as unknown as WithheldViewerProfileOptions<Options>;
  }
  const { ao, lighting } = options;
  const withheld = [
    ...present(options, releaseOptionKeys),
    ...(ao === undefined ? [] : present(ao, releaseAoKeys).map((key) => `ao.${key}`)),
  ];
  const kept = without(options, releaseOptionKeys);
  if (ao !== undefined) {
    kept['ao'] = without(ao, releaseAoKeys);
  }
  if (typeof lighting === 'object') {
    kept['lighting'] = withholdLighting(lighting, withheld);
  }
  if (withheld.length > 0) {
    backend.onWithheld(withheld);
  }
  return kept as WithheldViewerProfileOptions<Options>;
};
