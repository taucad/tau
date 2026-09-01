/**
 * Deterministic generator for the `node_modules_read_safety` benchmark fixture.
 *
 * Produces a synthetic ~5 MB `node_modules/fake-cad/index.d.ts` containing
 * declarations that mimic the size and shape of `opencascade.js`'s
 * generated `.d.ts`. The shape matches the involute-gear transcript that
 * motivated the offloading work — large declaration blocks the agent must
 * navigate via narrow `grep` queries rather than wholesale `read_file`s.
 *
 * The generator is intentionally deterministic (no `Math.random()`,
 * no `Date.now()`) so re-runs produce byte-identical output and CI can
 * snapshot the fixture without churn.
 *
 * Usage:
 *
 * ```ts
 * const content = generateFakeOpencascadeDts({ targetBytes: 5 * 1024 * 1024 });
 * await fs.writeFile('node_modules/fake-cad/index.d.ts', content);
 * ```
 *
 * @public
 */

/** Default target size matches the plan's 5 MB synthetic fixture. */
export const defaultTargetBytes = 5 * 1024 * 1024;

/**
 * Builds a single declaration block for a synthetic class. The pattern mirrors
 * the high-density opencascade.js / OCCT-style declarations the agent has to
 * navigate in the transcript: a class with overloaded constructors, several
 * methods, and a few constants.
 */
function buildClassBlock(index: number): string {
  const className = `Bezier_Curve_${index}`;
  return [
    `/** Synthetic CAD class ${index}. Mirrors opencascade.js Bezier_Curve overload set. */`,
    `export declare class ${className} {`,
    `  constructor(degree: number);`,
    `  constructor(degree: number, weights: ReadonlyArray<number>);`,
    `  constructor(degree: number, weights: ReadonlyArray<number>, knots: ReadonlyArray<number>);`,
    `  buildFromPoles(poles: ReadonlyArray<readonly [number, number, number]>): ${className};`,
    `  evaluateAtParameter(parameter: number): readonly [number, number, number];`,
    `  derivative(order: number): ${className};`,
    `  setKnotMultiplicity(index: number, multiplicity: number): void;`,
    `  static readonly DEFAULT_DEGREE: 3;`,
    `  static readonly MAX_POLES: 32;`,
    `}`,
    ``,
  ].join('\n');
}

/**
 * Generates a deterministic synthetic `.d.ts` whose byte length is at least
 * `targetBytes`. Repeats `buildClassBlock` with a monotonically increasing
 * index until the byte budget is satisfied; emits a trailing summary block
 * with the exact symbol count so consumers can sanity-check determinism.
 *
 * @public
 */
export function generateFakeOpencascadeDts(options?: { targetBytes?: number }): string {
  const targetBytes = options?.targetBytes ?? defaultTargetBytes;
  const header = [
    `// Synthetic node_modules_read_safety fixture (deterministic; do not edit).`,
    `// Generator: apps/api/app/benchmarks/fixtures/node-modules-read-safety/generate-fixture.ts`,
    ``,
  ].join('\n');

  const chunks: string[] = [header];
  let bytes = header.length;
  let index = 1;
  while (bytes < targetBytes) {
    const block = buildClassBlock(index);
    chunks.push(block);
    bytes += block.length;
    index += 1;
  }
  const footer = `\n// Total synthetic symbols: ${index - 1}\n`;
  chunks.push(footer);
  return chunks.join('');
}
