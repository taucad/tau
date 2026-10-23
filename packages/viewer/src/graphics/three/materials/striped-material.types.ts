/**
 * Striped surface material options shared by legacy GLSL and WebGPU/TSL factories.
 */
export type StripedMaterialProperties = {
  /**
   * The frequency of the stripes (distance between stripes in plane-local units).
   * @default 2
   */
  readonly stripeFrequency?: number;
  /**
   * The width of each stripe in plane-local units.
   * @default 0.12
   */
  readonly stripeWidth?: number;
  /**
   * When set, the base colour is this tint and the stripe a contrasting shade of it: darker on a light tint, lighter
   * on a dark one.
   */
  readonly tintColor?: number;
  /**
   * The base color of the material.
   * @default 0xdddddd
   */
  readonly baseColor?: number;
  /**
   * The color of the stripes.
   * @default 0xbbbbbb
   */
  readonly stripeColor?: number;
  /**
   * Stripe angle in radians (plane-local XY). `0` = horizontal modulation along Y, π/4 = diagonal.
   * @default Math.PI / 4
   */
  readonly stripeAngle?: number;
};
