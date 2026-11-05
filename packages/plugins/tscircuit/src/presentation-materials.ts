/**
 * Presentation materials for component bodies.
 *
 * `circuit-json-to-gltf` gives every part a flat colour with roughness 0.95 and almost no
 * metalness, so leads, terminals and moulded bodies all read as grey clay. The converter (and
 * KiCad's STEP colours) encode intent in those colours: light greys are tinned leads, gold is
 * plating, near-black is moulded epoxy, tan is ceramic. This pass maps each colour family to a
 * physically plausible PBR material, so the parts pick up the viewer's environment reflections.
 */

import type { Material } from '@gltf-transform/core';

type Rgb = readonly [number, number, number];

const toLinear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

type Finish = { color: Rgb; metallic: number; roughness: number };

/** Classify a converter colour (stored as sRGB values) into a presentation finish. */
export const classifyComponentColor = ([r, g, b]: Rgb): Finish => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const luminance = (r + g + b) / 3;
  // Gold plating and brass contacts.
  if (r > 0.65 && g > 0.45 && b < 0.45 && saturation > 0.25 && r >= g && g >= b) {
    return { color: [1, 0.8, 0.45], metallic: 1, roughness: 0.25 };
  }
  // Light, neutral greys are tinned leads, terminations and shields.
  if (saturation < 0.08 && luminance > 0.55 && luminance < 0.95) {
    return { color: [0.83, 0.84, 0.86], metallic: 1, roughness: 0.32 };
  }
  // Near-white is paint or ink (diode bands, markings).
  if (saturation < 0.05 && luminance >= 0.95) {
    return { color: [0.92, 0.92, 0.9], metallic: 0, roughness: 0.55 };
  }
  // Dark, warm brown is KiCad's MLCC body: present it as fired ceramic.
  if (luminance < 0.3 && r > 0.08 && r > g * 1.5 && g >= b) {
    return { color: [0.71, 0.56, 0.42], metallic: 0, roughness: 0.6 };
  }
  // Near-black is moulded epoxy or black plastic.
  if (luminance < 0.4 && saturation < 0.1) {
    return { color: [0.05, 0.05, 0.055], metallic: 0, roughness: 0.48 };
  }
  // Mid greys: plastic housings and ferrite.
  if (saturation < 0.08) {
    return { color: [r, g, b], metallic: 0, roughness: 0.55 };
  }
  // Tan and brown: ceramic bodies.
  if (r > g && g > b && luminance < 0.75 && saturation < 0.4) {
    return { color: [r, g, b], metallic: 0, roughness: 0.6 };
  }
  // Everything else is coloured plastic or a lens.
  return { color: [r, g, b], metallic: 0, roughness: 0.38 };
};

/**
 * Replace a converter material's factors with its presentation finish. Materials with a base
 * colour texture keep their texture.
 *
 * @public
 */
export const applyPresentationMaterial = (material: Material): void => {
  if (material.getBaseColorTexture()) {
    material.setRoughnessFactor(0.6).setMetallicFactor(0);
    return;
  }
  const [r = 0.7, g = 0.7, b = 0.7, a = 1] = material.getBaseColorFactor();
  const finish = classifyComponentColor([r, g, b]);
  material
    .setBaseColorFactor([toLinear(finish.color[0]), toLinear(finish.color[1]), toLinear(finish.color[2]), a])
    .setMetallicFactor(finish.metallic)
    .setRoughnessFactor(finish.roughness);
};
