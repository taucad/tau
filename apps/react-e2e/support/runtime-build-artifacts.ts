import { readdirSync } from 'node:fs';
import { basename } from 'node:path';

const runtimeAssets = [
  ['replicad_single', '.js'],
  ['replicad_single', '.wasm'],
  ['replicad_multi', '.js'],
  ['replicad_multi', '.wasm'],
  ['Geist-Regular', '.ttf'],
  ['replicad.js', '.map'],
] as const;

const artifactNames = (root: string): string[] =>
  readdirSync(root, { recursive: true }).map((file) => basename(String(file)));

const matchingAssets = (names: readonly string[], stem: string, extension: string): string[] =>
  names.filter((name) => name.startsWith(stem) && name.endsWith(extension));

export type RuntimeBuildArtifactReport = Readonly<
  Record<string, { readonly emitted: number; readonly excluded: number }>
>;

export const runtimeBuildArtifactReport = (assetRoot: string, excludedRoot?: string): RuntimeBuildArtifactReport => {
  const emitted = artifactNames(assetRoot);
  const excluded = excludedRoot ? artifactNames(excludedRoot) : [];
  return Object.fromEntries(
    runtimeAssets.map(([stem, extension]) => [
      `${stem}${extension}`,
      {
        emitted: matchingAssets(emitted, stem, extension).length,
        excluded: matchingAssets(excluded, stem, extension).length,
      },
    ]),
  );
};

export const buildArtifactNames = artifactNames;
