import { describe, expect, it } from 'vitest';
import { opencascadeDetectPattern } from '#opencascade.constants.js';

/** A large model that never imports libcascade but mentions `import` on every few lines. */
const largeUnrelatedModel = `import { makeBox } from 'replicad';\n${'// import a helper from elsewhere\nconst value = 1;\n'.repeat(16_000)}`;

describe('opencascadeDetectPattern', () => {
  it.each([
    [`import init from 'libcascade';`, true],
    [`import oc, { BRepPrimAPI_MakeBox } from "libcascade";`, true],
    [`import {\n  BRepPrimAPI_MakeBox,\n  gp_Pnt,\n} from 'libcascade';`, true],
    [`const { BRepPrimAPI_MakeBox } = require('libcascade');`, true],
    [`import init from 'opencascade';`, false],
    [`import init from 'opencascade.js';`, false],
    [`import { makeBox } from 'replicad';`, false],
  ])('detects %j as OpenCascade: %s', (source, expected) => {
    expect(opencascadeDetectPattern.test(source)).toBe(expected);
  });

  // D-RT-23: `/import.*from…/s` backtracked from every `import` to the end of the file, so a 512 KB entry took
  // about ten seconds before any kernel was chosen; it runs first for every `.ts`/`.js` entry.
  it('rejects a large unrelated entry in linear time', () => {
    const started = performance.now();
    expect(opencascadeDetectPattern.test(largeUnrelatedModel)).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
