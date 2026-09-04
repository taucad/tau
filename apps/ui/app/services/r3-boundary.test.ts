// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * R3 (`docs/research/host-agnostic-transport-substrate-blueprint.md`,
 * Recommendations R3 / rule 14): `@taucad/rpc` is a dependency of *packages*,
 * never of apps. Every package ships its own first-party transport exports, so
 * the substrate underneath every consumer can be swapped in one place.
 *
 * The agent host's are `@taucad/agent-host/channel-client`
 * (`createAgentChannelClient`, `connectAgentWorkerChannel`,
 * `serveAgentWorkerChannel`) plus the channel *types* re-exported from the root
 * barrel. Tests are held to the same rule: a test that reaches past the
 * first-party export is a test of the wrong seam.
 */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rpcModuleSpecifier = /^\s*(?:import|export)\b[^\n]*?['"]@taucad\/rpc(?:\/[^'"]*)?['"]/mu;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });

describe('R3 transport boundary', () => {
  it('never imports @taucad/rpc from apps/ui/app', () => {
    const importers = sourceFiles(appRoot)
      .filter((path) => rpcModuleSpecifier.test(readFileSync(path, 'utf8')))
      .map((path) => relative(appRoot, path));

    expect(importers).toEqual([]);
  });
});
