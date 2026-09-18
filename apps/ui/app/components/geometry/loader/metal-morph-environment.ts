import {
  BackSide,
  BufferAttribute,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from 'three';
import { PMREMGenerator } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { metalMorphEnvironmentPalettes } from '#components/geometry/loader/metal-morph.constants.js';
import type { MetalMorphEnvironmentPalette } from '#components/geometry/loader/metal-morph.constants.js';

export type MetalMorphEnvironmentVariant = keyof typeof metalMorphEnvironmentPalettes;

/** A prefiltered studio for `scene.environment`; the owner disposes it. */
export type StudioEnvironment = ReturnType<PMREMGenerator['fromScene']>;

export type MetalMorphEnvironment = StudioEnvironment;

/** One rectangular emitter of the studio, looking at the origin. */
export type StudioEmitter = Readonly<{
  color: Color;
  height: number;
  position: readonly [number, number, number];
  width: number;
}>;

/** Dome radiance from the floor, through the horizon, to the zenith. */
export type StudioDome = Readonly<{
  bottom: Color;
  horizon: Color;
  top: Color;
}>;

/** Render units; the dome only has to enclose every emitter. */
const domeRadius = 30;
/** Side length of the cube map the studio is prefiltered into. */
const environmentResolution = 256;
/** Radians of pre-blur; enough to soften emitter edges without dissolving the highlight streaks. */
const environmentBlurRadians = 0.02;

const scaled = (color: Color, intensity: number): Color => color.clone().multiplyScalar(intensity);

const white = new Color(1, 1, 1);

/**
 * A photographic studio for chrome: one big key softbox, two long rim strips for signature streaks, a soft fill,
 * a brand-teal accent, black cards for dark reflections and a graded dome. Everything looks at the origin.
 */
const studioEmitters = (palette: MetalMorphEnvironmentPalette): StudioEmitter[] => [
  // A tall soft window front-right: the broad bright reflection every chrome product shot leans on.
  { color: scaled(white, palette.keyIntensity * 0.6), position: [10, 5, 13], width: 16, height: 11 },
  // Key softbox overhead, slightly forward.
  { color: scaled(white, palette.keyIntensity), position: [0, 15, 6], width: 12, height: 7 },
  // Long thin rim strips behind the body for the signature streaks.
  { color: scaled(white, palette.rimIntensity), position: [16, 6, -10], width: 0.6, height: 16 },
  { color: scaled(white, palette.rimIntensity * 0.55), position: [-14, 9, -12], width: 0.5, height: 12 },
  // Broad low fill opposite the key.
  { color: scaled(white, palette.fillIntensity), position: [-16, 2, 6], width: 9, height: 8 },
  // Brand accent, low and behind.
  { color: scaled(palette.accentColor, palette.accentIntensity), position: [-6, -5, -14], width: 0.5, height: 10 },
  // Floor bounce.
  { color: scaled(palette.domeHorizon, 0.8), position: [0, -16, 0], width: 14, height: 14 },
  // Black cards give the mirror dark reflections to read its shape against.
  { color: palette.cardRadiance, position: [13, -1, 2], width: 8, height: 14 },
  { color: palette.cardRadiance, position: [-12, -2, 4], width: 8, height: 12 },
  { color: palette.cardRadiance, position: [2, -9, 12], width: 12, height: 5 },
];

const buildDome = (dome: StudioDome): Mesh<SphereGeometry, MeshBasicMaterial> => {
  const geometry = new SphereGeometry(domeRadius, 48, 32);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const colour = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const elevation = positions.getY(index) / domeRadius;
    if (elevation >= 0) {
      const t = Math.min(1, elevation / 0.75);
      colour.copy(dome.horizon).lerp(dome.top, t * t * (3 - 2 * t));
    } else {
      const t = Math.min(1, -elevation / 0.6);
      colour.copy(dome.horizon).lerp(dome.bottom, t * t * (3 - 2 * t));
    }
    colors[index * 3] = colour.r;
    colors[index * 3 + 1] = colour.g;
    colors[index * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return new Mesh(geometry, new MeshBasicMaterial({ side: BackSide, vertexColors: true }));
};

const buildEmitter = (emitter: StudioEmitter): Mesh<PlaneGeometry, MeshBasicMaterial> => {
  const mesh = new Mesh(
    new PlaneGeometry(emitter.width, emitter.height),
    new MeshBasicMaterial({ color: emitter.color, side: DoubleSide }),
  );
  mesh.position.set(...emitter.position);
  mesh.lookAt(0, 0, 0);
  return mesh;
};

const disposeMeshes = (meshes: ReadonlyArray<Mesh<PlaneGeometry | SphereGeometry, MeshBasicMaterial>>): void => {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
};

/**
 * Prefilter a studio of emitters under a graded dome into a PMREM environment for `scene.environment`. The
 * caller owns the returned target and disposes it when the loader unmounts or switches theme. Requires an
 * initialised node renderer.
 */
export const prefilterStudio = (
  renderer: WebGPURenderer,
  studioDesign: Readonly<{ dome: StudioDome; emitters: readonly StudioEmitter[] }>,
  options?: Readonly<{ size?: number }>,
): StudioEnvironment => {
  const studio = new Scene();
  const meshes = [buildDome(studioDesign.dome), ...studioDesign.emitters.map((emitter) => buildEmitter(emitter))];
  studio.add(...meshes);

  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, environmentBlurRadians, 0.1, domeRadius * 2, {
      size: options?.size ?? environmentResolution,
    });
  } finally {
    generator.dispose();
    disposeMeshes(meshes);
  }
};

/** The chrome studio for one theme; see {@link prefilterStudio}. */
export const createMetalMorphEnvironment = (
  renderer: WebGPURenderer,
  variant: MetalMorphEnvironmentVariant,
  options?: Readonly<{ size?: number }>,
): MetalMorphEnvironment => {
  const palette = metalMorphEnvironmentPalettes[variant];
  return prefilterStudio(
    renderer,
    {
      dome: { bottom: palette.domeBottom, horizon: palette.domeHorizon, top: palette.domeTop },
      emitters: studioEmitters(palette),
    },
    options,
  );
};
