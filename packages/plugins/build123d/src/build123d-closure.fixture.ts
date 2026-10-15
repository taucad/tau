// Integration fixture: prepares this host's Build123d closure from the payload seed the `seed` target fills, through
// the same preparation host, sandboxed seal and receipt `tau prepare build123d` uses, so every native test runs the
// shipped closure rather than a separately built tree.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { integrityToHex } from '@taucad/archive-core';
import {
  createPreparationHost,
  detectHostIndicators,
  parsePluginDeployment,
  selectVariant,
} from '@taucad/runtime/preparation/node';
import type { ClosureReceipt, DependencyVariant, PluginDeployment } from '@taucad/runtime/preparation/node';

import { sealBuild123dClosure } from '#build123d-closure.js';

const packageName = '@taucad/build123d';
export const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../../..');
/** The digest-addressed payload seed `pnpm nx run build123d:seed` fills (`blobs/sha256/<hex>`). */
export const seedDirectory = resolve(workspaceRoot, 'out/cache/build123d-seed');
/** The store the native tests share; a sealed closure is reused across files and runs. */
export const storeDirectory = resolve(workspaceRoot, 'out/cache/build123d-store');

export const deployment: PluginDeployment = parsePluginDeployment(
  JSON.parse(readFileSync(join(packageRoot, 'tau-plugin.json'), 'utf8')) as unknown,
  `${packageName} tau-plugin.json`,
);

const selectHostVariant = (): DependencyVariant | undefined => {
  const indicators = detectHostIndicators();
  if (indicators === undefined) {
    return undefined;
  }
  const selection = selectVariant(deployment.dependencies['engine'] ?? [], indicators);
  return selection.status === 'selected' ? selection.variant : undefined;
};

/** This host's `engine` variant, or `undefined` on a host the package declares none for. */
export const hostVariant: DependencyVariant | undefined = selectHostVariant();

/** Whether the seed holds every third-party payload of this host's variant, so a prepare needs no network. */
export const seedPresent: boolean =
  hostVariant?.payloads.every(
    (payload) =>
      payload.origin.kind !== 'url' ||
      existsSync(join(seedDirectory, 'blobs', 'sha256', integrityToHex(payload.integrity).hex)),
  ) === true;

/**
 * Prepare (or reuse) this host's sealed closure from the seed, offline.
 * @returns The `engine` closure's receipt.
 */
export const prepareFromSeed = async (): Promise<ClosureReceipt> => {
  const host = createPreparationHost({
    plugins: [{ package: packageName, deployment, directory: packageRoot, seal: sealBuild123dClosure }],
    store: storeDirectory,
    seed: seedDirectory,
  });
  try {
    const outcome = await host.prepare({
      package: packageName,
      offline: true,
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    if (outcome.status !== 'ready') {
      throw new Error(
        `Preparing ${packageName} from ${seedDirectory} ended ${outcome.status}: ${JSON.stringify(outcome)}`,
      );
    }
    return outcome.receipts['engine']!;
  } finally {
    host.dispose();
  }
};
