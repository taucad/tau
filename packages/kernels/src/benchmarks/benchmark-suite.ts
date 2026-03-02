/**
 * Benchmark Suite
 *
 * Curated set of geometry operations for benchmarking kernel performance.
 * Each case is a set of source files that produce geometry.
 * Cases are grouped by category for filtering and reporting.
 */

// eslint-disable-next-line @nx/enforce-module-boundaries -- Allowable for devDependencies.
import { loadFixture } from '@taucad/tau-examples/fixtures';

/** A single benchmark case with its files and metadata. */
export type BenchmarkCase = {
  name: string;
  category: string;
  files: Record<string, string>;
  mainFile: string;
};

const defaultMainFile = 'main.ts';

/** Shorthand to create a single-file benchmark case from inline code. */
function inlineCase(name: string, category: string, code: string): BenchmarkCase {
  return { name, category, files: { [defaultMainFile]: code }, mainFile: defaultMainFile };
}

const primitives: BenchmarkCase[] = [
  inlineCase(
    'box',
    'primitives',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      return makeBaseBox(50, 30, 20);
    }
  `,
  ),
  inlineCase(
    'cylinder',
    'primitives',
    `
    import { makeCylinder } from 'replicad';
    export default function main() {
      return makeCylinder(15, 40);
    }
  `,
  ),
  inlineCase(
    'sphere',
    'primitives',
    `
    import { makeSphere } from 'replicad';
    export default function main() {
      return makeSphere(25);
    }
  `,
  ),
];

const booleans: BenchmarkCase[] = [
  inlineCase(
    'fuse-two-boxes',
    'booleans',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      const a = makeBaseBox(30, 30, 30);
      const b = makeBaseBox(20, 20, 40).translate(10, 10, 0);
      return a.fuse(b);
    }
  `,
  ),
  inlineCase(
    'cut-cylinder-from-box',
    'booleans',
    `
    import { makeBaseBox, makeCylinder } from 'replicad';
    export default function main() {
      const box = makeBaseBox(40, 40, 30);
      const hole = makeCylinder(10, 30);
      return box.cut(hole);
    }
  `,
  ),
  inlineCase(
    'n-body-fuse',
    'booleans',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      let result = makeBaseBox(10, 10, 10);
      for (let i = 1; i < 6; i++) {
        result = result.fuse(makeBaseBox(10, 10, 10).translate(i * 8, 0, 0));
      }
      return result;
    }
  `,
  ),
];

const fillets: BenchmarkCase[] = [
  inlineCase(
    'box-fillet-all',
    'fillets',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      return makeBaseBox(40, 30, 20).fillet(3);
    }
  `,
  ),
  inlineCase(
    'box-chamfer-all',
    'fillets',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      return makeBaseBox(40, 30, 20).chamfer(2);
    }
  `,
  ),
];

const extrusions: BenchmarkCase[] = [
  inlineCase(
    'sketch-extrude',
    'extrusions',
    `
    import { draw } from 'replicad';
    export default function main() {
      return draw()
        .movePointerTo([0, 0])
        .lineTo([40, 0])
        .lineTo([40, 30])
        .lineTo([20, 30])
        .lineTo([20, 15])
        .lineTo([0, 15])
        .close()
        .sketchOnPlane("XY")
        .extrude(10);
    }
  `,
  ),
  inlineCase(
    'sketch-revolve',
    'extrusions',
    `
    import { draw } from 'replicad';
    export default function main() {
      return draw()
        .movePointerTo([10, 0])
        .lineTo([20, 0])
        .lineTo([20, 30])
        .lineTo([10, 30])
        .close()
        .sketchOnPlane("XZ")
        .revolve();
    }
  `,
  ),
];

const complex: BenchmarkCase[] = [
  inlineCase(
    'bracket',
    'complex',
    `
    import { makeBaseBox, makeCylinder } from 'replicad';
    export default function main() {
      let bracket = makeBaseBox(60, 40, 5);
      bracket = bracket.fuse(makeBaseBox(5, 40, 30).translate(-27.5, 0, 15));
      bracket = bracket.fuse(makeBaseBox(5, 40, 30).translate(27.5, 0, 15));
      bracket = bracket.cut(makeCylinder(8, 5).translate(-20, 0, 0));
      bracket = bracket.cut(makeCylinder(8, 5).translate(20, 0, 0));
      bracket = bracket.fillet(2);
      return bracket;
    }
  `,
  ),
  inlineCase(
    'enclosure',
    'complex',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      const outer = makeBaseBox(80, 60, 40);
      const inner = makeBaseBox(76, 56, 37).translate(0, 0, 3);
      let enclosure = outer.cut(inner);
      enclosure = enclosure.fillet(3);
      return enclosure;
    }
  `,
  ),
  inlineCase(
    'multi-hole-plate',
    'complex',
    `
    import { makeBaseBox, makeCylinder } from 'replicad';
    export default function main() {
      let plate = makeBaseBox(100, 60, 8);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const x = -40 + col * 20;
          const y = -20 + row * 20;
          plate = plate.cut(makeCylinder(5, 8).translate(x, y, 0));
        }
      }
      plate = plate.fillet(2);
      return plate;
    }
  `,
  ),
];

const examples: BenchmarkCase[] = [
  { name: 'tray', category: 'examples', ...loadFixture('replicad', 'tray') },
  { name: 'birdhouse', category: 'examples', ...loadFixture('replicad', 'birdhouse') },
  { name: 'bottle', category: 'examples', ...loadFixture('replicad', 'bottle') },
  { name: 'gridfinity-box', category: 'examples', ...loadFixture('replicad', 'gridfinity-box') },
  { name: 'vase', category: 'examples', ...loadFixture('replicad', 'vase') },
];

const stress: BenchmarkCase[] = [
  inlineCase(
    'deep-boolean-chain',
    'stress',
    `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      let result = makeBaseBox(10, 10, 10);
      for (let i = 1; i < 12; i++) {
        const dx = (i % 3) * 7;
        const dy = Math.floor(i / 3) * 7;
        result = result.fuse(makeBaseBox(10, 10, 10).translate(dx, dy, 0));
      }
      return result;
    }
  `,
  ),
];

export const benchmarkSuite: BenchmarkCase[] = [
  ...primitives,
  ...booleans,
  ...fillets,
  ...extrusions,
  ...complex,
  ...examples,
  ...stress,
];

/** All available category names. */
export const benchmarkCategories: string[] = [...new Set(benchmarkSuite.map((c) => c.category))];

/**
 * Filter benchmark cases by category names.
 * Returns all cases if no filter provided.
 */
export function filterBenchmarks(filter?: string[]): BenchmarkCase[] {
  if (!filter || filter.length === 0) {
    return benchmarkSuite;
  }

  return benchmarkSuite.filter((c) => filter.includes(c.category));
}
