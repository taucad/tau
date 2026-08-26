import * as THREE from 'three';

/**
 * Options for creating a morphing points material.
 */
export type MorphingPointsMaterialOptions = {
  /**
   * Base color for the particles.
   * @default '#14b8a6' (teal)
   */
  color?: string;
  /**
   * Target color to transition to (optional).
   * If provided, particles will interpolate from color to targetColor.
   */
  targetColor?: string;
  /**
   * Base point size in pixels.
   * @default 3
   */
  pointSize?: number;
  /**
   * Explosion strength - how far particles expand at midpoint.
   * @default 2
   */
  explosionStrength?: number;
  /**
   * Opacity of particles.
   * @default 1
   */
  opacity?: number;
};

const defaultOptions: Required<Omit<MorphingPointsMaterialOptions, 'targetColor'>> = {
  color: '#14b8a6',
  pointSize: 2,
  explosionStrength: 2,
  opacity: 1,
};

/**
 * Vertex shader for morphing points.
 *
 * Handles:
 * - Interpolation between source and target positions
 * - Explosion effect at midpoint of transition
 * - Organic movement using noise/random offsets
 * - Dynamic point sizing
 */
const vertexShader = /* glsl */ `
  attribute vec3 aTargetPosition;
  attribute float aRandomOffset;

  uniform float uProgress;
  uniform float uExplosionStrength;
  uniform float uTime;
  uniform float uPointSize;
  uniform vec3 uPointer;
  uniform float uPointerStrength;
  uniform float uPointerRadius;

  varying float vProgress;
  varying float vRandomOffset;

  // Simple noise function for organic movement
  float noise(float x) {
    return sin(x * 1.0) * 0.5 + sin(x * 2.3) * 0.3 + sin(x * 5.7) * 0.2;
  }

  void main() {
    vProgress = uProgress;
    vRandomOffset = aRandomOffset;

    // Calculate the midpoint between source and target
    vec3 midPoint = mix(position, aTargetPosition, 0.5);

    // Add explosion effect - particles move outward at midpoint
    vec3 explosionDir = normalize(position);
    float explosionAmount = sin(uProgress * 3.14159) * uExplosionStrength;
    midPoint += explosionDir * explosionAmount;

    // Add organic swirl motion during transition
    // Maximum effect at progress = 0.5, zero at 0 and 1
    float transitionIntensity = 1.0 - abs(uProgress - 0.5) * 2.0;
    float noiseX = noise(aRandomOffset * 10.0 + uTime * 0.5);
    float noiseY = noise(aRandomOffset * 15.0 + uTime * 0.7 + 1.0);
    float noiseZ = noise(aRandomOffset * 20.0 + uTime * 0.6 + 2.0);
    vec3 swirlOffset = vec3(noiseX, noiseY, noiseZ) * transitionIntensity * 0.5;
    midPoint += swirlOffset;

    // Interpolate through the midpoint
    // 0 -> 0.5: position -> midPoint
    // 0.5 -> 1: midPoint -> aTargetPosition
    vec3 morphed;
    if (uProgress < 0.5) {
      float t = uProgress * 2.0;
      // Ease in-out for smoother animation
      t = t * t * (3.0 - 2.0 * t);
      morphed = mix(position, midPoint, t);
    } else {
      float t = (uProgress - 0.5) * 2.0;
      // Ease in-out for smoother animation
      t = t * t * (3.0 - 2.0 * t);
      morphed = mix(midPoint, aTargetPosition, t);
    }

    // Pointer interaction: a soft breeze that brushes nearby points off the
    // surface, with a tangential swirl for organic drift. Gaussian falloff has
    // no hard shell (a linear falloff folds every inner point onto one radius,
    // which reads as a solid saturated ring under additive blending), and the
    // displacement is bounded by uPointerStrength. Per-point time wobble breaks
    // the displaced region into turbulence instead of a stamped dent.
    // Branch-free direction (toPointer / (dist + eps)) avoids a normalize NaN
    // at coincidence. uPointer is in local/object space (MorphingPoints
    // converts from world space each frame).
    vec3 toPointer = morphed - uPointer;
    float pointerDist = length(toPointer);
    vec3 pointerDir = toPointer / (pointerDist + 0.0001);
    float pointerNorm = pointerDist / uPointerRadius;
    float pointerFalloff = exp(-3.0 * pointerNorm * pointerNorm);
    float pointerWobble = 0.75 + 0.25 * noise(aRandomOffset * 40.0 + uTime * 3.0);
    vec3 pointerCurl = cross(pointerDir, vec3(0.0, 0.0, 1.0));
    morphed += (pointerDir + pointerCurl * 0.4) * pointerFalloff * pointerWobble * uPointerStrength;

    // Dynamic point size - larger at midpoint for visual impact
    float sizeFactor = 1.0 + transitionIntensity * 0.3;
    // Add slight size variation per particle
    sizeFactor *= 0.9 + aRandomOffset * 0.2;

    vec4 mvPosition = modelViewMatrix * vec4(morphed, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Scale point size based on distance for perspective
    // Use a smaller base multiplier for reasonable particle sizes
    gl_PointSize = uPointSize * sizeFactor * (80.0 / -mvPosition.z);
  }
`;

/**
 * Fragment shader for morphing points.
 *
 * Handles:
 * - Circular point rendering (discard corners)
 * - Color interpolation between source and target
 * - Opacity control
 */
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uTargetColor;
  uniform float uOpacity;
  uniform bool uHasTargetColor;

  varying float vProgress;
  varying float vRandomOffset;

  void main() {
    // Create circular points by discarding corners
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) {
      discard;
    }

    // Soft edge for smoother appearance
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    alpha *= uOpacity;

    // Interpolate color if target color is provided
    vec3 finalColor = uColor;
    if (uHasTargetColor) {
      finalColor = mix(uColor, uTargetColor, vProgress);
    }

    // Add subtle brightness variation per particle
    finalColor *= 0.9 + vRandomOffset * 0.2;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Creates a ShaderMaterial for morphing point cloud animations.
 *
 * This material animates particles between two sets of positions with:
 * - Explosion effect at midpoint
 * - Organic noise-based movement
 * - Dynamic point sizing
 * - Optional color interpolation
 *
 * @param options - Material configuration options
 * @returns ShaderMaterial configured for morphing points
 */
export function createMorphingPointsMaterial(options?: MorphingPointsMaterialOptions): THREE.ShaderMaterial {
  const { color, pointSize, explosionStrength, opacity } = { ...defaultOptions, ...options };
  const { targetColor } = options ?? {};

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uExplosionStrength: { value: explosionStrength },
      uPointSize: { value: pointSize },
      uPointer: { value: new THREE.Vector3(0, 0, 0) },
      uPointerStrength: { value: 0 },
      uPointerRadius: { value: 3 },
      uColor: { value: new THREE.Color(color) },
      uTargetColor: { value: new THREE.Color(targetColor ?? color) },
      uHasTargetColor: { value: targetColor !== undefined },
      uOpacity: { value: opacity },
    },
    vertexShader,
    fragmentShader,
  });
}

/**
 * Updates the progress uniform of a morphing points material.
 *
 * @param material - The morphing points material
 * @param progress - Animation progress (0 to 1)
 */
export function updateMorphProgress(material: THREE.ShaderMaterial, progress: number): void {
  if (material.uniforms['uProgress']) {
    material.uniforms['uProgress'].value = progress;
  }
}

/**
 * Updates the time uniform of a morphing points material.
 *
 * @param material - The morphing points material
 * @param time - Current time value for animations
 */
export function updateMorphTime(material: THREE.ShaderMaterial, time: number): void {
  if (material.uniforms['uTime']) {
    material.uniforms['uTime'].value = time;
  }
}

/**
 * Updates the colors of a morphing points material.
 *
 * @param material - The morphing points material
 * @param color - Source color
 * @param targetColor - Target color (optional)
 */
export function updateMorphColors(material: THREE.ShaderMaterial, color: string, targetColor?: string): void {
  if (material.uniforms['uColor']) {
    (material.uniforms['uColor'].value as THREE.Color).set(color);
  }

  if (targetColor && material.uniforms['uTargetColor'] && material.uniforms['uHasTargetColor']) {
    (material.uniforms['uTargetColor'].value as THREE.Color).set(targetColor);
    material.uniforms['uHasTargetColor'].value = true;
  }
}

/**
 * Updates the opacity uniform of a morphing points material.
 *
 * @param material - The morphing points material
 * @param opacity - Opacity value (0 to 1)
 */
export function updateMorphOpacity(material: THREE.ShaderMaterial, opacity: number): void {
  if (material.uniforms['uOpacity']) {
    material.uniforms['uOpacity'].value = opacity;
  }
}

/**
 * Updates the pointer repulsion uniforms of a morphing points material.
 * Pass `strength = 0` to disable the effect (e.g. reduced-motion).
 *
 * @param material - The morphing points material
 * @param pointer - Pointer position in the points' local/object space
 * @param strength - Repulsion displacement magnitude (0 disables)
 */
export function updateMorphPointer(material: THREE.ShaderMaterial, pointer: THREE.Vector3, strength: number): void {
  if (material.uniforms['uPointer']) {
    (material.uniforms['uPointer'].value as THREE.Vector3).copy(pointer);
  }

  if (material.uniforms['uPointerStrength']) {
    material.uniforms['uPointerStrength'].value = strength;
  }
}
