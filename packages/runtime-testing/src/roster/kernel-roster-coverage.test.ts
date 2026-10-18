import { describe, expect, it } from 'vitest';

import { assertKernelRosterCoverage } from '#roster/kernel-roster-coverage.js';
import type { RosterCatalogEntry, RosterRuntime } from '#roster/kernel-roster-coverage.js';

const catalog: readonly RosterCatalogEntry[] = [
  { id: 'replicad', mainFile: 'main.ts' },
  { id: 'openscad', mainFile: 'main.scad' },
  { id: 'zoo', mainFile: 'main.kcl' },
  { id: 'build123d', mainFile: 'src/main.py' },
];

const runtime: RosterRuntime = {
  kernels: [
    { id: 'replicad', extensions: ['ts', 'js'] },
    { id: 'openrscad', extensions: ['scad'] },
    { id: 'assimp', extensions: ['3ds', 'obj'] },
  ],
};

describe('assertKernelRosterCoverage', () => {
  it('should pass when every catalog entry is routed by extension or omitted with a reason', () => {
    expect(() => {
      assertKernelRosterCoverage({
        runtime,
        catalog,
        omitted: {
          zoo: 'credentialed: the fixture has no proxy token',
          build123d: 'native: composed from the payload store',
        },
      });
    }).not.toThrow();
  });

  it('should name each catalog entry that no kernel routes and no omission names', () => {
    expect(() => {
      assertKernelRosterCoverage({ runtime, catalog });
    }).toThrow(
      new Error(
        [
          'The kernel roster does not cover the catalog:',
          '- zoo: no kernel claims ".kcl" (main.kcl) and no omission names it.',
          '- build123d: no kernel claims ".py" (src/main.py) and no omission names it.',
        ].join('\n'),
      ),
    );
  });

  it('should fail on a stale omission: a routed entry, an unknown id, or an empty reason', () => {
    expect(() => {
      assertKernelRosterCoverage({
        runtime,
        catalog,
        omitted: { openscad: 'browser only', zoo: '  ', build123d: 'native', jscad: 'retired' },
      });
    }).toThrow(
      new Error(
        [
          'The kernel roster does not cover the catalog:',
          '- openscad: omitted ("browser only"), but the openrscad kernel claims ".scad"; drop the omission.',
          '- zoo: omitted without a reason.',
          '- jscad: omitted, but no catalog entry has this id; drop the omission.',
        ].join('\n'),
      ),
    );
  });

  it('should treat a main file without an extension as routed by nothing', () => {
    expect(() => {
      assertKernelRosterCoverage({
        runtime: { kernels: [{ id: 'dotfile', extensions: [''] }] },
        catalog: [{ id: 'bare', mainFile: 'dir.d/.profile' }],
      });
    }).toThrow('bare: no kernel claims "." (dir.d/.profile) and no omission names it.');
  });
});
