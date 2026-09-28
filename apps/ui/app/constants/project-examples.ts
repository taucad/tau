import { builtinExamples } from '@taucad/tau-examples/builtin';
import type { BuiltinExample } from '@taucad/tau-examples/builtin';
import type { ProjectManifest } from '@taucad/types';

export type ProjectFiles = Record<string, { readonly content: Uint8Array<ArrayBuffer> }>;

/** Gallery-facing metadata for a manifest-backed builtin project. */
export type BuiltinProjectCardModel = {
  readonly locator: string;
  readonly kernel: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: { readonly name: string; readonly avatar: string };
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly assets: ProjectManifest['assets'];
  readonly thumbnail: string;
  readonly fileAssets: BuiltinExample['assets'];
};

/** Load one builtin's bytes only when a preview or Remix action needs them. */
export const loadBuiltinProjectFiles = async ({
  project,
  signal,
}: {
  readonly project: BuiltinProjectCardModel;
  readonly signal?: AbortSignal;
}): Promise<ProjectFiles> =>
  Object.fromEntries(
    await Promise.all(
      project.fileAssets.map(async ({ path, load }) => {
        signal?.throwIfAborted();
        const content = await load();
        signal?.throwIfAborted();
        return [path, { content }] as const;
      }),
    ),
  );

const builtinCatalog: readonly BuiltinExample[] = builtinExamples;

export const sampleProjects: readonly BuiltinProjectCardModel[] = builtinCatalog.flatMap((example) => {
  const { thumbnailUrl } = example;
  return thumbnailUrl
    ? [
        {
          locator: example.locator,
          kernel: example.kernel,
          id: example.manifest.id,
          name: example.manifest.name,
          description: example.manifest.description,
          author: { name: 'Tau Team', avatar: '/avatar-sample.png' },
          tags: example.manifest.tags,
          createdAt: 1_740_702_000_000,
          assets: example.manifest.assets,
          thumbnail: thumbnailUrl,
          fileAssets: example.assets,
        },
      ]
    : [];
});

/**
 * The Community showcase, in display order: the strongest builtins only. Starter and
 * toy models stay in `@taucad/tau-examples` and remain reachable by their `/s/builtin~` link.
 */
export const communityLocators = [
  'replicad.kestrel-240-quadcopter',
  'replicad.v8-engine',
  'replicad.bench-vise',
  'replicad.turbofan',
  'openscad.arq5-racing-quadcopter',
  'replicad.six-axis-arm',
  'replicad.heat-exchanger',
  'replicad.worm-gear-system',
  'replicad.standing-fan',
  'replicad.spur-gearbox',
  'replicad.planetary-gear-system',
  'replicad.wheelbarrow',
  'replicad.copper-lampshade',
  'openscad.cyber-chess-set',
  'jscad.planetary-gear-system',
  'openscad.dollhouse',
  'replicad.gridfinity-box',
  'openscad.fluted-vase',
  'replicad.cycloidal-gear',
  'replicad.wavy-vase',
] as const;

const sampleProjectsByLocator = new Map(sampleProjects.map((project) => [project.locator, project]));

// ponytail: a locator without a builtin is dropped here; project-examples.test.ts fails on it.
export const galleryProjects: readonly BuiltinProjectCardModel[] = communityLocators.flatMap((locator) => {
  const project = sampleProjectsByLocator.get(locator);
  return project ? [project] : [];
});
