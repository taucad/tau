import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Group, LineSegments, Vector2 } from 'three';
import { InterleavedBufferAttribute } from 'three';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from 'three/addons';

/**
 * Default line width in pixels for edge rendering.
 * This is screen-space width, not world units.
 */
const defaultLineWidth = 1;

/**
 * Edge color for fat line materials.
 * Default: black (matching middleware)
 */
const defaultEdgeColor = 0x00_00_00;

/**
 * Base depth bias factor for edge lines with logarithmic depth buffer.
 *
 * This multiplicative factor is applied to vFragDepth BEFORE taking log2.
 * Due to logarithm properties (log(a*b) = log(a) + log(b)), this produces
 * a constant additive offset in log space, which scales correctly with
 * scene size and depth precision.
 *
 * FOV-ADAPTIVE SCALING:
 *
 * The shader dynamically adjusts this bias based on camera FOV to maintain
 * correct occlusion at all FOV values. At low FOV (near-orthographic), the
 * camera is far away, and the depth buffer range for geometry becomes
 * compressed. A fixed bias would be too aggressive, causing lines to
 * incorrectly show through occluding geometry.
 *
 * The adjustment formula uses: adjustedBias = pow(baseBias, fovScale)
 * where fovScale = tan(fov/2) / tan(30°)
 *
 * Effective values at different FOV:
 * - At 60° FOV: adjustedBias = 0.9999 (unchanged, this is the reference)
 * - At 6° FOV:  adjustedBias ≈ 0.99999 (10x less bias)
 * - At 0.6° FOV: adjustedBias ≈ 0.999999 (100x less bias)
 *
 * IMPORTANT TRADE-OFF (MSAA vs Occlusion):
 *
 * Writing to gl_FragDepth (required for logarithmic depth buffer) breaks MSAA
 * anti-aliasing at the subsample level:
 *
 * - With subtle bias (0.999): Some subsamples see the line, some don't due to
 *   z-fighting. This causes partial coverage → lines appear thinner/rougher.
 *
 * - With aggressive bias (0.99): ALL subsamples agree the line is visible.
 *   Full coverage → smooth lines. BUT lines may incorrectly show through
 *   geometry that should occlude them.
 *
 * This is a fundamental limitation of gl_FragDepth + MSAA. Alternatives:
 * - Use `reverseDepthBuffer: true` instead of `logarithmicDepthBuffer: true`
 *   (avoids gl_FragDepth, restores MSAA, requires EXT_clip_control support)
 * - Use post-process AA (FXAA/SMAA) instead of MSAA
 * - Accept the trade-off and tune this value for your use case
 */
const depthBiasFactor = 0.999;

/**
 * Extract positions from indexed geometry with InterleavedBufferAttribute.
 */
function extractFromInterleavedIndexed(
  positionAttribute: InterleavedBufferAttribute,
  indices: Iterable<number>,
): number[] {
  const interleavedBuffer = positionAttribute.data;
  const { stride } = interleavedBuffer;
  const { offset } = positionAttribute;
  const { array } = interleavedBuffer;
  const positions: number[] = [];

  for (const index of indices) {
    const vertexIndex = index * stride + offset;
    const x = array[vertexIndex] ?? 0;
    const y = array[vertexIndex + 1] ?? 0;
    const z = array[vertexIndex + 2] ?? 0;
    positions.push(x, y, z);
  }

  return positions;
}

/**
 * Extract positions from non-indexed geometry with InterleavedBufferAttribute.
 */
function extractFromInterleavedNonIndexed(positionAttribute: InterleavedBufferAttribute): number[] {
  const interleavedBuffer = positionAttribute.data;
  const { stride } = interleavedBuffer;
  const { offset } = positionAttribute;
  const { array } = interleavedBuffer;
  const { count } = positionAttribute;
  const positions: number[] = [];

  for (let i = 0; i < count; i++) {
    const vertexIndex = i * stride + offset;
    const x = array[vertexIndex] ?? 0;
    const y = array[vertexIndex + 1] ?? 0;
    const z = array[vertexIndex + 2] ?? 0;
    positions.push(x, y, z);
  }

  return positions;
}

/**
 * Extract positions from indexed geometry with regular BufferAttribute.
 */
function extractFromRegularIndexed(array: Float32Array, indices: Iterable<number>): number[] {
  const positions: number[] = [];

  for (const index of indices) {
    const vertexIndex = index * 3;
    const x = array[vertexIndex] ?? 0;
    const y = array[vertexIndex + 1] ?? 0;
    const z = array[vertexIndex + 2] ?? 0;
    positions.push(x, y, z);
  }

  return positions;
}

/**
 * Extract positions from a LineSegments geometry, handling both regular and interleaved buffers.
 * Expands indexed geometry to non-indexed positions as required by LineSegmentsGeometry.
 *
 * @param lineSegments - The LineSegments object to extract positions from
 * @returns Array of position values [x1, y1, z1, x2, y2, z2, ...] or undefined if extraction fails
 */
function extractPositions(lineSegments: LineSegments): number[] | undefined {
  const { geometry } = lineSegments;
  const positionAttribute = geometry.attributes['position'];

  if (!positionAttribute) {
    console.warn('[FatLines] No position attribute found on LineSegments');
    return undefined;
  }

  const indexAttribute = geometry.index;

  // Handle InterleavedBufferAttribute (GLTFLoader optimization)
  if (positionAttribute instanceof InterleavedBufferAttribute) {
    if (indexAttribute) {
      return extractFromInterleavedIndexed(positionAttribute, indexAttribute.array);
    }

    return extractFromInterleavedNonIndexed(positionAttribute);
  }

  // Regular BufferAttribute
  const array = positionAttribute.array as Float32Array;

  if (indexAttribute) {
    return extractFromRegularIndexed(array, indexAttribute.array);
  }

  // Non-indexed regular buffer - copy directly
  return [...array];
}

/**
 * Create a LineMaterial with FOV-adaptive logarithmic depth bias for edge rendering.
 *
 * Uses onBeforeCompile to modify the fragment shader's logarithmic depth
 * calculation, applying a multiplicative bias to vFragDepth before the log2
 * operation. The bias is dynamically scaled based on camera FOV (derived from
 * the projection matrix) to maintain correct occlusion at all FOV values,
 * from wide-angle perspective to near-orthographic views.
 *
 * @param resolution - The viewport resolution for line width calculation
 * @returns A configured LineMaterial with FOV-adaptive depth bias
 */
function createEdgeLineMaterial(resolution: Vector2): LineMaterial {
  const material = new LineMaterial({
    color: defaultEdgeColor,
    linewidth: defaultLineWidth,
    worldUnits: false, // Screen-space pixels
    resolution: resolution.clone(),
    // Keep depth test enabled for proper occlusion
  });

  // Apply depth bias in fragment shader for logarithmic depth buffer.
  // This prevents z-fighting between edge lines and co-planar mesh surfaces.
  //
  // MATHEMATICAL REASONING:
  // The logarithmic depth formula is: gl_FragDepth = log2(vFragDepth) * logDepthBufFC * 0.5
  // Our biased version multiplies vFragDepth by a factor < 1.0:
  //   gl_FragDepth = log2(vFragDepth * depthBias) * logDepthBufFC * 0.5
  //
  // Due to logarithm properties: log2(a * b) = log2(a) + log2(b)
  // So: log2(vFragDepth * 0.999) = log2(vFragDepth) + log2(0.999)
  //
  // Since log2(0.999) ≈ -0.00144 is a CONSTANT, this multiplicative approach
  // produces a CONSTANT ADDITIVE OFFSET in logarithmic space.
  //
  // This is ideal because:
  // 1. Logarithmic depth distributes precision logarithmically - near objects
  //    get high precision, far objects get less.
  // 2. A constant offset in log space means the bias is always proportional
  //    to the available precision at that depth.
  // 3. It scales automatically with scene size (logDepthBufFC is derived from
  //    the camera's far plane).
  //
  // Result: The bias works consistently for any scene size - from tiny precision
  // parts to massive architectural models - without needing depth-dependent tuning.
  // Create shared uniform object so it can be updated at runtime
  const depthBiasUniform = { value: depthBiasFactor };

  material.onBeforeCompile = (shader) => {
    // Add depthBias uniform for runtime adjustment (shared reference)
    shader.uniforms['depthBias'] = depthBiasUniform;

    // Add varying to pass FOV scale from vertex to fragment shader.
    // projectionMatrix is only available in vertex shader for LineMaterial.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_pars_vertex>',
      `#include <logdepthbuf_pars_vertex>
      varying float vFovScale;`,
    );

    // Calculate FOV scale in vertex shader and pass to fragment
    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_vertex>',
      `#include <logdepthbuf_vertex>
      // FOV scale for adaptive depth bias
      // Check if perspective camera (projectionMatrix[3][3] == 0 for perspective)
      if (projectionMatrix[3][3] == 0.0) {
        // projectionMatrix[1][1] = 1 / tan(fov/2) for perspective cameras
        float tanHalfFov = 1.0 / projectionMatrix[1][1];
        float tanHalfRefFov = 0.57735; // tan(30°) for 60° reference FOV
        vFovScale = tanHalfFov / tanHalfRefFov;
      } else {
        // Orthographic camera - use default scale
        vFovScale = 1.0;
      }`,
    );

    // Declare the varying and uniform in fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <logdepthbuf_pars_fragment>',
      `#include <logdepthbuf_pars_fragment>
      uniform float depthBias;
      varying float vFovScale;`,
    );

    // Use the varying in the depth calculation
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <logdepthbuf_fragment>',
      `#if defined( USE_LOGDEPTHBUF )
        // FOV-adaptive depth bias for correct occlusion at all FOV values.
        // At low FOV (near-orthographic), camera distance is large and a fixed bias
        // becomes too aggressive relative to geometry depth separation.
        // vFovScale is calculated in vertex shader from projectionMatrix.
        float adjustedBias = pow(depthBias, vFovScale);

        float biasedFragDepth = vFragDepth * adjustedBias;
        #if defined( USE_LOGDEPTHBUF_EXT )
          gl_FragDepthEXT = log2( biasedFragDepth ) * logDepthBufFC * 0.5;
        #else
          gl_FragDepth = log2( biasedFragDepth ) * logDepthBufFC * 0.5;
        #endif
      #endif`,
    );
  };

  // Store reference to uniform for runtime updates
  // To adjust: material.userData['depthBiasUniform'].value = 0.995;
  material.userData['depthBiasUniform'] = depthBiasUniform;

  return material;
}

/**
 * Convert a LineSegments object to LineSegments2 for fat line rendering.
 *
 * @param lineSegments - The LineSegments object to convert
 * @param resolution - The viewport resolution for line width calculation
 * @returns A LineSegments2 object or undefined if conversion fails
 */
function convertToLineSegments2(lineSegments: LineSegments, resolution: Vector2): LineSegments2 | undefined {
  const positions = extractPositions(lineSegments);

  if (!positions || positions.length === 0) {
    console.warn('[FatLines] Failed to extract positions from LineSegments');
    return undefined;
  }

  // Create LineSegmentsGeometry with expanded positions
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  // Create LineMaterial with custom depth bias via onBeforeCompile
  const material = createEdgeLineMaterial(resolution);

  const lineSegments2 = new LineSegments2(geometry, material);

  // Copy transforms from original
  lineSegments2.position.copy(lineSegments.position);
  lineSegments2.rotation.copy(lineSegments.rotation);
  lineSegments2.scale.copy(lineSegments.scale);
  lineSegments2.quaternion.copy(lineSegments.quaternion);

  // Copy name and userData
  lineSegments2.name = lineSegments.name;
  lineSegments2.userData = { ...lineSegments.userData };

  // Render lines after meshes
  lineSegments2.renderOrder = 1;

  return lineSegments2;
}

/**
 * Apply fat line segments to a GLTF scene by converting LineSegments to LineSegments2.
 *
 * This function traverses the GLTF scene, finds all LineSegments objects (created by
 * the edge detection middleware), and converts them to LineSegments2 for fat line
 * rendering with constant screen-space width.
 *
 * @param gltf - The GLTF scene to process
 * @param resolution - The viewport resolution for line width calculation
 */
export function applyFatLineSegments(gltf: GLTF, resolution: Vector2): void {
  // Collect LineSegments for replacement (avoid modifying during traversal)
  const replacements: Array<{
    parent: Group;
    oldChild: LineSegments;
    newChild: LineSegments2;
  }> = [];

  gltf.scene.traverse((object) => {
    if (object.type === 'LineSegments') {
      const lineSegments = object as LineSegments;
      const parent = lineSegments.parent as Group | undefined;

      if (parent) {
        const lineSegments2 = convertToLineSegments2(lineSegments, resolution);
        if (lineSegments2) {
          replacements.push({ parent, oldChild: lineSegments, newChild: lineSegments2 });
        }
      }
    }
  });

  // Perform replacements
  for (const { parent, oldChild, newChild } of replacements) {
    parent.remove(oldChild);
    parent.add(newChild);

    // Dispose old geometry and material
    oldChild.geometry.dispose();
    if (Array.isArray(oldChild.material)) {
      for (const material of oldChild.material) {
        material.dispose();
      }
    } else {
      oldChild.material.dispose();
    }
  }
}

/**
 * Update the resolution of all LineMaterial instances in a scene.
 * Call this when the viewport size changes to maintain correct line widths.
 *
 * @param scene - The scene to update
 * @param resolution - The new viewport resolution
 */
export function updateLineMaterialResolution(scene: Group, resolution: Vector2): void {
  scene.traverse((object) => {
    if (object instanceof LineSegments2) {
      const { material } = object;
      if ('resolution' in material) {
        (material as { resolution: Vector2 }).resolution.copy(resolution);
      }
    }
  });
}
