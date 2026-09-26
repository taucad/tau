/**
 * Shared steel outline of every Bambu Lab X1-Carbon build plate.
 *
 * All four X1C plates share one outline and differ only in their top layer,
 * thickness and printed markings (clean-room spec
 * `out/research/x1c-build-plates/spec.md` §0 and §1.4).
 *
 * Frame: millimetres; X right, Y toward the rear, Z up. The origin is the
 * printable area's front-left corner, so the 256 × 256 printable area spans
 * `0..256` in X and Y and the 257 mm body spans `-0.5..256.5`. Z = 0 is the
 * plate's print (top) surface and the plate extends below it.
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- The Replicad kernel provides `replicad` to model sources at export time.
import { draw, drawRoundedRectangle } from 'replicad';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Types of the kernel-provided module.
import type { Drawing } from 'replicad';

/** Body minimum X and Y: the 257 mm body centred on the 256 mm printable area (§0 "Body"). */
export const bodyMin = -0.5;
/** Body maximum X and Y (§0 "Body"). */
export const bodyMax = 256.5;
/** Radius of the body's corners (§0 "Body corner radius"). */
export const bodyCornerRadius = 6;

/** Rear tab top edge, left end (§0 "Rear tab": top width 52 mm, x 102–154). */
export const tabTopMinX = 102;
/** Rear tab top edge, right end (§0 "Rear tab"). */
export const tabTopMaxX = 154;
/** Rear tab height behind the body's rear edge (§0 "Rear tab": y 256.5 → 264.5). */
export const tabHeight = 8;
/**
 * Horizontal run of each 45° tab flank (§0 "Rear tab": 45° flanks).
 *
 * The flank vertices land at x 94 and 162; the 3 mm base fillets start about
 * 1.2 mm up each flank, which is where the spec's "≈66 mm (x 95–161)" base
 * reading comes from.
 */
export const tabFlankRun = tabHeight;
/** Radius of the tab's two top corners (§0 "Rear tab": r≈3). */
export const tabTopRadius = 3;
/** Radius of the concave fillets where the tab meets the body (§0 "Rear tab": ≈3 mm). */
export const tabBaseFillet = 3;

/** Slot length along X (§0 "Slot in rear tab": 42.5 × 1.4 mm). */
export const slotLength = 42.5;
/** Slot width along Y (§0 "Slot in rear tab"). */
export const slotWidth = 1.4;
/** Slot centre X (§0 "Slot in rear tab": centred at x = 128). */
export const slotCenterX = 128;
/** Slot front edge Y (§0 "Slot in rear tab": y≈257.0–258.4). */
export const slotMinY = 257;

/** Lip start X at the body's front edge (§0 "Front lip": x = 70.0). */
export const lipStartX = 70;
/** Lip left end X at the lip's front edge, after the left chamfer (§0 "Front lip": x≈82). */
export const lipChamferEndX = 82;
/** Lip depth in front of the body (§0 "Front lip": y -0.5 → -10.5). */
export const lipDepth = 10;
/** Lip front-right corner radius (§0 "Front lip": ≈6 mm). */
export const lipCornerRadius = 6;
/** Concave fillet where the chamfer meets the body edge (§0 "Front lip": ≈2 mm). */
export const lipChamferFillet = 2;

/** Lip front edge Y. */
export const lipMinY = bodyMin - lipDepth;
/** Rear tab top edge Y. */
export const tabMaxY = bodyMax + tabHeight;

/** Rear (Y max) edge of both lip cut-outs (§0 "Through-cut-outs": y≈-1.0 → -7.0). */
export const cutoutMaxY = -1;
/** Front (Y min) edge of both lip cut-outs (§0 "Through-cut-outs"). */
export const cutoutMinY = -7;
/** Cut-out A vertical left side X (§0 "Through-cut-outs": A x≈223.5–235.5 at mid-height). */
export const firstCutoutMinX = 223.5;
/** Cut-out A right side X at mid-height; that side slopes at 45° (§0 "Through-cut-outs"). */
export const firstCutoutMidMaxX = 235.5;
/** Cut-out B left side X at its rear edge; that side slopes at 45° (§0 "Through-cut-outs": B x≈236–249). */
export const secondCutoutRearMinX = 236;
/**
 * Cut-out B right side X.
 *
 * The spec calls B a parallelogram, but the official top render FAP042 shows
 * its right side vertical and parallel to the lip's right edge; this keeps the
 * spec's x≈249 extent with a vertical right side.
 */
export const secondCutoutMaxX = 249;
/** Corner radius of both cut-outs (§0 "Through-cut-outs": ≈0.5–1 mm). */
export const cutoutCornerRadius = 1;

/**
 * Draws the plate outline, including the front lip.
 *
 * @param options - `tab: false` omits the rear tab, giving the footprint a
 *   sticker covers on the Cool and High Temp plates (spec §2 "Edges/underside").
 * @returns The closed outline without the slot or cut-outs.
 */
export const drawPlateOutline = ({ tab }: { tab: boolean }): Drawing => {
  const pen = draw([bodyMin, bodyMin])
    .lineTo([lipStartX, bodyMin])
    .customCorner(lipChamferFillet)
    .lineTo([lipChamferEndX, lipMinY])
    .lineTo([bodyMax, lipMinY])
    .customCorner(lipCornerRadius)
    .lineTo([bodyMax, bodyMax])
    .customCorner(bodyCornerRadius);
  if (tab) {
    pen
      .lineTo([tabTopMaxX + tabFlankRun, bodyMax])
      .customCorner(tabBaseFillet)
      .lineTo([tabTopMaxX, tabMaxY])
      .customCorner(tabTopRadius)
      .lineTo([tabTopMinX, tabMaxY])
      .customCorner(tabTopRadius)
      .lineTo([tabTopMinX - tabFlankRun, bodyMax])
      .customCorner(tabBaseFillet);
  }

  return pen.lineTo([bodyMin, bodyMax]).customCorner(bodyCornerRadius).closeWithCustomCorner(bodyCornerRadius);
};

/**
 * Draws the stadium slot through the rear tab.
 *
 * @returns The slot outline.
 */
export const drawTabSlot = (): Drawing =>
  drawRoundedRectangle(slotLength, slotWidth, slotWidth / 2).translate(slotCenterX, slotMinY + slotWidth / 2);

/**
 * Draws the two through-cut-outs at the lip's right end.
 *
 * @returns Cut-outs A and B, kept separate so each is cut on its own.
 */
export const drawLipCutouts = (): [Drawing, Drawing] => {
  const halfHeight = (cutoutMaxY - cutoutMinY) / 2;
  const cutoutA = draw([firstCutoutMinX, cutoutMaxY])
    .lineTo([firstCutoutMidMaxX - halfHeight, cutoutMaxY])
    .customCorner(cutoutCornerRadius)
    .lineTo([firstCutoutMidMaxX + halfHeight, cutoutMinY])
    .customCorner(cutoutCornerRadius)
    .lineTo([firstCutoutMinX, cutoutMinY])
    .customCorner(cutoutCornerRadius)
    .closeWithCustomCorner(cutoutCornerRadius);
  const cutoutB = draw([secondCutoutRearMinX, cutoutMaxY])
    .lineTo([secondCutoutMaxX, cutoutMaxY])
    .customCorner(cutoutCornerRadius)
    .lineTo([secondCutoutMaxX, cutoutMinY])
    .customCorner(cutoutCornerRadius)
    .lineTo([secondCutoutRearMinX + 2 * halfHeight, cutoutMinY])
    .customCorner(cutoutCornerRadius)
    .closeWithCustomCorner(cutoutCornerRadius);
  return [cutoutA, cutoutB];
};
