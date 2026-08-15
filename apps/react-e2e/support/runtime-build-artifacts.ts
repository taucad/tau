import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { expect } from '@playwright/test';

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

export const expectRuntimeBuildArtifacts = (assetRoot: string, excludedRoot?: string): void => {
  const emitted = artifactNames(assetRoot);
  const excluded = excludedRoot ? artifactNames(excludedRoot) : [];

  for (const [stem, extension] of runtimeAssets) {
    expect(matchingAssets(emitted, stem, extension), `${stem}${extension} in ${assetRoot}`).toHaveLength(1);
    expect(matchingAssets(excluded, stem, extension), `${stem}${extension} absent from ${excludedRoot}`).toHaveLength(
      0,
    );
  }
};

export const buildArtifactNames = artifactNames;
