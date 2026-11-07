import type { NurbsCurve } from '#utils/smlib-kernel.js';

/**
 * The knot span a parameter lies in: the largest `span` with `knots[span] <= t < knots[span + 1]`,
 * clamped to the curve's domain so its last parameter falls in the last non-empty span.
 * @param curve - The curve: its knots, degree and control points.
 * @param t - The parameter.
 * @returns The span's index.
 */
function findSpan({ knots, degree, poles }: NurbsCurve, t: number): number {
  const last = poles.length - 1;
  if (t >= knots[last + 1]!) {
    return last;
  }
  if (t <= knots[degree]!) {
    return degree;
  }
  let low = degree;
  let high = last + 1;
  let middle = Math.floor((low + high) / 2);
  while (t < knots[middle]! || t >= knots[middle + 1]!) {
    if (t < knots[middle]!) {
      high = middle;
    } else {
      low = middle;
    }
    middle = Math.floor((low + high) / 2);
  }
  return middle;
}

/**
 * Evaluate a (rational) B-spline curve with de Boor's algorithm, in homogeneous coordinates.
 * @param curve - The curve, as `ext.curve_data(curve, true)` gives it.
 * @param t - The parameter, in the curve's own parameterisation.
 * @returns The point `[x, y, z]`.
 */
export function evaluateNurbs(curve: NurbsCurve, t: number): number[] {
  const { degree, poles, knots, weights } = curve;
  const span = findSpan(curve, t);
  // The degree + 1 control points that act on the span, as [w·x, w·y, w·z, w].
  const points: number[][] = [];
  for (let index = 0; index <= degree; index++) {
    const pole = poles[span - degree + index]!;
    const weight = weights ? weights[span - degree + index]! : 1;
    points.push([pole[0]! * weight, pole[1]! * weight, pole[2]! * weight, weight]);
  }
  for (let level = 1; level <= degree; level++) {
    for (let index = degree; index >= level; index--) {
      const knot = span - degree + index;
      const denominator = knots[knot + degree - level + 1]! - knots[knot]!;
      const alpha = denominator === 0 ? 0 : (t - knots[knot]!) / denominator;
      const point = points[index]!;
      const previous = points[index - 1]!;
      for (let axis = 0; axis < 4; axis++) {
        point[axis] = (1 - alpha) * previous[axis]! + alpha * point[axis]!;
      }
    }
  }
  const [x, y, z, w] = points[degree]!;
  return [x! / w!, y! / w!, z! / w!];
}
