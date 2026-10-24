import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { positionLocal } from 'three/tsl';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ViewportGizmo } from 'three-viewport-gizmo';
import type { ViewportGizmoStyle } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import { viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';

const regionKey = (normal: Vector3): string =>
  ['x', 'y', 'z']
    .flatMap((axis) => {
      const value = normal.getComponent(axis === 'x' ? 0 : axis === 'y' ? 1 : 2);
      return Math.abs(value) < 1e-5 ? [] : [value < 0 ? `n${axis}` : axis];
    })
    .sort()
    .join(',');

// The library's `userData.face` is axis-indexed, even when `up` changes the label.
// Name the physical views in the same coordinate convention as the camera controls.
const faceLabels: Record<'x' | 'y' | 'z', Readonly<Record<string, string>>> = {
  x: { x: 'Top', nx: 'Bottom', y: 'Front', ny: 'Back', z: 'Right', nz: 'Left' },
  y: { x: 'Right', nx: 'Left', y: 'Top', ny: 'Bottom', z: 'Front', nz: 'Back' },
  z: { x: 'Right', nx: 'Left', y: 'Back', ny: 'Front', z: 'Top', nz: 'Bottom' },
};

/**
 * Partition one closed rounded box into the library's 26 existing pick targets. All parts
 * share the same boundary vertices; independently tessellated cylinders and rotated
 * spheres do not. Positions and label orientation remain owned by three-viewport-gizmo.
 * The returned geometries are owned by the gizmo and disposed with it.
 * @internal
 * @returns The closed surface partitioned by signed axis names.
 */
export const createViewportGizmoSurfaceGeometry = (): Map<string, BufferGeometry> => {
  const source = new RoundedBoxGeometry(2, 2, 2, viewportGizmoMetrics.segments, viewportGizmoMetrics.radius);
  const positions = source.getAttribute('position');
  const normals = source.getAttribute('normal');
  const regions = new Map<string, { positions: number[]; normals: number[] }>();
  const normal = new Vector3();
  const vertex = new Vector3();
  for (let index = 0; index < positions.count; index += 3) {
    normal.set(0, 0, 0);
    for (let offset = 0; offset < 3; offset++) {
      normal.add(vertex.fromBufferAttribute(normals, index + offset));
    }
    const key = regionKey(normal);
    const region = regions.get(key) ?? { positions: [], normals: [] };
    regions.set(key, region);
    for (let offset = 0; offset < 3; offset++) {
      region.positions.push(...vertex.fromBufferAttribute(positions, index + offset).toArray());
      region.normals.push(...vertex.fromBufferAttribute(normals, index + offset).toArray());
    }
  }
  source.dispose();
  return new Map(
    [...regions].map(([key, region]) => [
      key,
      new BufferGeometry()
        .setAttribute('position', new Float32BufferAttribute(region.positions, 3))
        .setAttribute('normal', new Float32BufferAttribute(region.normals, 3)),
    ]),
  );
};

const createFaceTexture = ({
  label,
  color,
  labelColor,
  font,
}: {
  readonly label: string;
  readonly color: number;
  readonly labelColor: number;
  readonly font: string;
}): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = viewportGizmoMetrics.textureSize;
  canvas.height = viewportGizmoMetrics.textureSize;
  const context = canvas.getContext('2d');
  if (context) {
    // Each face fills its own texture to the boundary. Mipmaps cannot sample transparent
    // atlas gutters or adjacent labels, even at grazing angles and fractional DPRs.
    context.fillStyle = new Color(color).getStyle();
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = new Color(labelColor).getStyle();
    context.font = `500 ${viewportGizmoMetrics.fontSize}px ${font}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/**
 * Apply Tau's opaque, continuous surface without replacing the gizmo's picking or controls.
 * @internal
 * @param gizmo - The newly constructed rounded-cube gizmo, before adding axes or scaling it.
 * @param style - Resolved display colors and typography.
 * @param backend - Execution family; both node backends use explicit node materials.
 */
export const applyViewportGizmoSurface = (
  gizmo: ViewportGizmo,
  style: ViewportGizmoStyle,
  backend: ResolvedGraphicsBackend = 'webgl',
): void => {
  const nodeMaterials = new Map<MeshBasicMaterial, MeshBasicNodeMaterial>();
  const toNode = (source: MeshBasicMaterial): MeshBasicNodeMaterial => {
    let material = nodeMaterials.get(source);
    if (!material) {
      material = new MeshBasicNodeMaterial({
        map: source.map,
        color: source.color,
        vertexColors: source.vertexColors,
        opacity: source.opacity,
        transparent: source.transparent,
        side: source.side,
        depthTest: source.depthTest,
        depthWrite: source.depthWrite,
        toneMapped: source.toneMapped,
      });
      // Three r184 can skip a transform after draw order changes. Identity position
      // keeps these moving control surfaces out of the stale observer shortcut.
      material.positionNode = positionLocal;
      nodeMaterials.set(source, material);
    }
    return material;
  };
  const regions = createViewportGizmoSurfaceGeometry();
  const oldGeometries = new Set<Pick<BufferGeometry, 'dispose'>>();
  const oldTextures = new Set<Texture>();
  const labels = faceLabels[gizmo.options.up ?? 'y'];
  for (const object of gizmo.children) {
    if (
      !(object instanceof Mesh) ||
      !(object.geometry instanceof BufferGeometry) ||
      !(object.material instanceof MeshBasicMaterial)
    ) {
      continue;
    }
    const geometry = regions.get(regionKey(object.position));
    const idle: unknown = object.userData['idleMaterial'];
    const hover: unknown = object.userData['hoverMaterial'];
    if (!geometry || !(idle instanceof MeshBasicMaterial) || !(hover instanceof MeshBasicMaterial)) {
      continue;
    }
    object.updateMatrix();
    geometry.applyMatrix4(new Matrix4().copy(object.matrix).invert());
    oldGeometries.add(object.geometry);
    object.geometry = geometry;

    for (const material of [idle, hover]) {
      if (material.map) {
        oldTextures.add(material.map);
      }
      material.map = null;
      material.transparent = false;
      material.opacity = 1;
      material.depthTest = true;
      material.depthWrite = true;
      material.toneMapped = false;
      material.needsUpdate = true;
    }
    // The original cube gives corners the face tone. Keep those eight targets
    // distinct from the lighter edge bands, including at the three-way junctions.
    idle.color.set(object.userData['kind'] === 'corner' ? style.face : style.bevel);
    idle.vertexColors = false;
    hover.color.set(style.hover);

    if (object.userData['kind'] === 'face') {
      const label = labels[regionKey(object.position)] ?? '';
      const uvs: number[] = [];
      const positions = geometry.getAttribute('position');
      const faceLength = 2 * (1 - viewportGizmoMetrics.radius);
      for (let index = 0; index < positions.count; index++) {
        uvs.push(positions.getX(index) / faceLength + 0.5, positions.getY(index) / faceLength + 0.5);
      }
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      idle.color.setScalar(1);
      hover.color.setScalar(1);
      idle.map = createFaceTexture({
        label,
        color: style.face,
        labelColor: style.label,
        font: style.font,
      });
      hover.map = createFaceTexture({ label, color: style.hover, labelColor: style.hoverLabel, font: style.font });
    }
  }
  if (backend === 'webgpu') {
    for (const object of gizmo.children) {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshBasicMaterial)) {
        continue;
      }
      const idle: unknown = object.userData['idleMaterial'];
      const hover: unknown = object.userData['hoverMaterial'];
      if (idle instanceof MeshBasicMaterial && hover instanceof MeshBasicMaterial) {
        object.userData['idleMaterial'] = toNode(idle);
        object.userData['hoverMaterial'] = toNode(hover);
        object.material = toNode(object.material);
      }
    }
    for (const source of nodeMaterials.keys()) {
      source.dispose();
    }
  }
  for (const geometry of oldGeometries) {
    geometry.dispose();
  }
  for (const texture of oldTextures) {
    texture.dispose();
  }
};
