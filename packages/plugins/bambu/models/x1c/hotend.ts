/**
 * Bambu Lab X1-Carbon hotend tip: silicone sock and hardened-steel nozzle.
 *
 * Clean-room model from `out/research/x1c-build-plates/spec.md` §5 (front-view
 * silhouette of the official FAH001 render, 47.3 mm hotend). Frame:
 * millimetres; X right, Y toward the rear, Z up; the nozzle tip's flat is the
 * origin, so the model stands on Z = 0 like the printed layer it deposits.
 *
 * ponytail: the heatsink above the sock and the sock's embossed brand text are
 * omitted; the viewer only needs the part that meets the print.
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- The Replicad kernel provides `replicad` to model sources at export time.
import { draw } from 'replicad';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Types of the kernel-provided module.
import type { Shape3D } from 'replicad';

/** Hotend length, top to nozzle tip (§5: 47.3 mm); converts the spec's downward Z to height above the tip. */
const hotendLength = 47.3;
const height = (specZ: number): number => hotendLength - specZ;

/** Nozzle tip flat diameter (§5: Ø≈1.0–1.1 mm at z 47.3). */
const nozzleTipDiameter = 1;
/** Nozzle diameter at the cone's top (§5: Ø≈3.1 mm at z 45.8). */
const nozzleBaseDiameter = 3.1;
/** Top of the nozzle cone (§5: z 45.8). */
const nozzleConeTop = height(45.8);
/** Silicone sock bottom face (§5: sock spans z 25.5–45.3). */
const sockBottom = height(45.3);
/** Top of the sock's bottom chamfer (§5: chamfered 15.2 → ~10 mm over z 43.2–45.3). */
const sockChamferTop = height(43.2);
/** Top of the sock's full-width section (§5: 15.2 mm constant from z 29.8). */
const sockBodyTop = height(29.8);
/** Sock top (§5: z 25.5, 11 mm wide at z 25.7). */
const sockTop = height(25.5);
/** Sock width in the front view (§5: 15.2 mm). */
const sockWidth = 15.2;
/** Sock depth front to back (§5: not measurable, ≈13–15 mm assumed). */
const sockDepth = 14;
/** Sock bottom face width (§5: ~10 mm). */
const sockBottomWidth = 10;
/** Sock top width (§5: 11 mm). */
const sockTopWidth = 11;
/** Sock colour (§5: #2C3035). */
const sockColor = '#2C3035';
/** Nozzle colour (§5: metallic grey ≈#BAB5AF). */
const nozzleColor = '#BAB5AF';

/**
 * Draws one side-view silhouette of the sock, with the same chamfer insets on every face.
 *
 * @param span - Silhouette width at the sock's widest section.
 * @returns The closed silhouette in sketch coordinates (u across, v up).
 */
const sockProfile = (span: number) => {
  const bottomInset = (sockWidth - sockBottomWidth) / 2;
  const topInset = (sockWidth - sockTopWidth) / 2;
  const half = span / 2;
  return draw([-half + bottomInset, sockBottom])
    .lineTo([half - bottomInset, sockBottom])
    .lineTo([half, sockChamferTop])
    .lineTo([half, sockBodyTop])
    .lineTo([half - topInset, sockTop])
    .lineTo([-half + topInset, sockTop])
    .lineTo([-half, sockBodyTop])
    .lineTo([-half, sockChamferTop])
    .close();
};

/**
 * Builds the X1C hotend tip.
 *
 * @returns The silicone sock and the nozzle.
 */
export default function main(): Array<
  Readonly<{ shape: Shape3D; name: string; color: string; roughness: number; metalness: number }>
> {
  // Offsetting each sketch plane back by half its extrusion centres the profile on the origin.
  const front = sockProfile(sockWidth)
    .sketchOnPlane('XZ', -sockDepth / 2)
    .extrude(sockDepth);
  const side = sockProfile(sockDepth)
    .sketchOnPlane('YZ', -sockWidth / 2)
    .extrude(sockWidth);
  const nozzle = draw([0, 0])
    .lineTo([nozzleTipDiameter / 2, 0])
    .lineTo([nozzleBaseDiameter / 2, nozzleConeTop])
    .lineTo([nozzleBaseDiameter / 2, sockBottom])
    .lineTo([0, sockBottom])
    .close()
    .sketchOnPlane('XZ')
    .revolve();

  return [
    { shape: front.intersect(side), name: 'sock', color: sockColor, roughness: 0.8, metalness: 0 },
    { shape: nozzle, name: 'nozzle', color: nozzleColor, roughness: 0.3, metalness: 1 },
  ];
}
