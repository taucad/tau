import { describe, expect, it } from 'vitest';
import { replicadDetectPattern } from '#replicad.constants.js';

/** A large model that never imports replicad but mentions `import` on every few lines. */
const largeUnrelatedModel = `import Module from 'manifold-3d';\n${'// import a helper from elsewhere\nconst value = 1;\n'.repeat(16_000)}`;

describe('replicadDetectPattern', () => {
  it.each([
    [`import { makeBox } from 'replicad';`, true],
    [`import * as replicad from "replicad";`, true],
    [`import {\n  makeBox,\n  drawCircle,\n} from 'replicad';`, true],
    [`const { makeBox } = require('replicad');`, true],
    [`const { makeBox, drawCircle } = replicad;`, true],
    [`/** @typedef {import('replicad').Shape3D} Shape */`, true],
    [
      `import { drawSVG } from "https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js";`,
      true,
    ],
    [`import { makeBox } from 'replicad-extra';`, false],
    [`import Module from 'manifold-3d';`, false],
  ])('detects %j as Replicad: %s', (source, expected) => {
    expect(replicadDetectPattern.test(source)).toBe(expected);
  });

  // D-RT-23: `/import.*from…/s` backtracked from every `import` to the end of the file, so a non-replicad entry
  // paid seconds of regex before the next kernel was tried.
  it('rejects a large unrelated entry in linear time', () => {
    const started = performance.now();
    expect(replicadDetectPattern.test(largeUnrelatedModel)).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
