export type GraphicsVector3 = readonly [number, number, number];

/** Resolve Tau's section controls to a renderer-neutral retained-half-space plane. */
export const resolveSectionViewPlane = ({
  baseNormal,
  pivot,
  rotation,
  direction,
}: {
  readonly baseNormal: GraphicsVector3;
  readonly pivot: GraphicsVector3;
  readonly rotation: GraphicsVector3;
  readonly direction: 1 | -1;
}): { readonly point: GraphicsVector3; readonly normal: GraphicsVector3 } => {
  const [x, y, z] = baseNormal;
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy;
  const z2 = -x * sy + z1 * cy;
  const rotated: GraphicsVector3 = [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
  const length = Math.hypot(...rotated);
  const retainedScale = -direction / length;
  return {
    point: [...pivot],
    normal: [rotated[0] * retainedScale, rotated[1] * retainedScale, rotated[2] * retainedScale],
  };
};
