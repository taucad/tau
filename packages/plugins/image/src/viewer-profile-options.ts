/**
 * Image options nanoraster accepts only from its viewer-parity release (Tau charter
 * `nanoraster-viewer-parity-charter`, W2 and W3, plus `lineColor`). An earlier backend rejects an unknown key, so until
 * the catalog moves to that release the transcoder renders without them instead of failing the whole image.
 *
 * Delete this module, and pass the options straight through, in the change that moves the `nanoraster` catalog pin
 * to the release that declares them.
 */

import type * as Nanoraster from 'nanoraster';

const releaseOptionKeys = ['lineColor', 'toneMapping'] as const;
const releaseAoKeys = ['thicknessRatio', 'denoiseDepthTolerance', 'samples', 'resolutionScale'] as const;

type ReleaseOptionKey = (typeof releaseOptionKeys)[number];
type ReleaseAoKey = (typeof releaseAoKeys)[number];

/** True once the installed nanoraster declares every viewer-parity option. */
type BackendDeclaresViewerProfileOptions = [ReleaseOptionKey] extends [keyof Nanoraster.RenderImageOptions]
  ? [ReleaseAoKey] extends [keyof Nanoraster.RenderAmbientOcclusion]
    ? true
    : false
  : false;

/**
 * Whether the installed backend accepts the viewer-parity options. The annotation stops compiling once the dependency
 * declares them, so the catalog bump that brings them must also turn this on.
 */
export const backendAcceptsViewerProfileOptions: BackendDeclaresViewerProfileOptions = false;

type GatedOptions = Readonly<Record<string, unknown>> &
  Readonly<{ ao?: Readonly<Record<string, unknown>> | undefined }>;

/** Options with the viewer-parity keys removed, member by member of a union. */
export type WithheldViewerProfileOptions<Options extends GatedOptions> = Options extends unknown
  ? Omit<Options, ReleaseOptionKey | 'ao'> &
      (undefined extends Options['ao']
        ? { readonly ao?: Omit<NonNullable<Options['ao']>, ReleaseAoKey> }
        : { readonly ao: Omit<NonNullable<Options['ao']>, ReleaseAoKey> })
  : never;

const present = (record: Readonly<Record<string, unknown>>, keys: readonly string[]): string[] =>
  keys.filter((key) => record[key] !== undefined);

const without = (record: Readonly<Record<string, unknown>>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

/**
 * Remove the viewer-parity options a backend does not accept.
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
  const { ao } = options;
  const withheld = [
    ...present(options, releaseOptionKeys),
    ...(ao === undefined ? [] : present(ao, releaseAoKeys).map((key) => `ao.${key}`)),
  ];
  if (withheld.length > 0) {
    backend.onWithheld(withheld);
  }
  const kept = without(options, releaseOptionKeys);
  return (
    ao === undefined ? kept : { ...kept, ao: without(ao, releaseAoKeys) }
  ) as WithheldViewerProfileOptions<Options>;
};
