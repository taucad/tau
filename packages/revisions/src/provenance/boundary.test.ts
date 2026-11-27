/**
 * The provenance module is an import-free leaf (blueprint D1, contracts § 1):
 * its source imports nothing outside `src/provenance/`, no zod and no other
 * module of this package, so the storage worker, tau-api and every client run
 * the same reader. The client entry exposes no address and no writer (I11, P5).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as provenance from '#provenance/index.js';
import * as server from '#provenance/server.js';

const directory = import.meta.dirname;
const sources = readdirSync(directory).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.test-utils.ts'),
);

describe('@taucad/revisions/provenance boundary', () => {
  it.each(sources)('%s imports only from the provenance module', (file) => {
    const source = readFileSync(join(directory, file), 'utf8');
    const specifiers = [...source.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gmu)].map(
      ([, specifier]) => specifier ?? '',
    );
    expect(specifiers.filter((specifier) => !specifier.startsWith('#provenance/'))).toEqual([]);
    /* A side-effect import has no `from` (M2 review m4). */
    expect(source).not.toMatch(/^\s*import\s+['"]/mu);
    expect(source).not.toMatch(/\bimport\(/u);
    expect(source).not.toMatch(/\brequire\(/u);
  });

  it('keeps the address-reading helpers out of the client entry', () => {
    expect(Object.keys(provenance).toSorted()).toEqual([
      'attributionOf',
      'historyNewArguments',
      'isAccountShaped',
      'provenanceRules',
      'readCommit',
      'readTag',
      'recognisedAgents',
    ]);
    expect(Object.keys(server).toSorted()).toEqual(['claimMatches', 'coverageOf']);
  });

  it('is imported by no rendering surface through the server entry (D1, rule 2)', () => {
    const root = resolve(directory, '../../../..');
    const surfaces = ['apps/ui/app', 'apps/desktop/src', 'apps/libs/revisions-ui/src', 'apps/libs/ui-core/src'];
    const offenders = surfaces.flatMap((surface) =>
      readdirSync(join(root, surface), { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(?:ts|tsx)$/u.test(file) && !file.includes('node_modules'))
        .filter((file) => statSync(join(root, surface, file)).isFile())
        .filter((file) =>
          readFileSync(join(root, surface, file), 'utf8').includes('@taucad/revisions/provenance/server'),
        )
        .map((file) => `${surface}/${file}`),
    );
    expect(offenders).toEqual([]);
  });
});
