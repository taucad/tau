// NASA TM-4741 four-digit thickness law. u = sqrt(x/c) makes it polynomial.
export function choose(n: number, k: number): number {
  let result = 1;
  for (let index = 1; index <= k; index++) {
    result *= (n - index + 1) / index;
  }
  return result;
}

export function nacaHalfThickness(
  x: number,
  chord: number,
  thickness: number,
): number {
  const s = x / chord;
  return (
    5 *
    thickness *
    chord *
    (0.2969 * Math.sqrt(s) -
      0.126 * s -
      0.3516 * s ** 2 +
      0.2843 * s ** 3 -
      0.1015 * s ** 4)
  );
}

// Exact power-to-Bernstein conversion: degree eight, not fitted/sample points.
export function nacaPoles(
  chord: number,
  thickness: number,
  fraction = 1,
): Array<[number, number]> {
  if (
    !(
      chord > 0 &&
      thickness > 0 &&
      thickness <= 0.4 &&
      fraction > 0 &&
      fraction <= 1
    )
  ) {
    throw new Error('Invalid NACA dimensions');
  }
  const u = Math.sqrt(fraction);
  const x = [0, 0, chord * u ** 2, 0, 0, 0, 0, 0, 0];
  const y = [
    0,
    0.2969 * u,
    -0.126 * u ** 2,
    0,
    -0.3516 * u ** 4,
    0,
    0.2843 * u ** 6,
    0,
    -0.1015 * u ** 8,
  ].map((v) => v * 5 * thickness * chord);
  const pole = (a: number[], k: number) =>
    a.reduce(
      (sum, v, index) =>
        sum + (index <= k ? (v * choose(k, index)) / choose(8, index) : 0),
      0,
    );
  return Array.from({ length: 9 }, (_, k): [number, number] => [
    pole(x, k),
    pole(y, k),
  ]);
}
