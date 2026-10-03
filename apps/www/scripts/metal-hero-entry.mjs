/** Offline capture of the original Tau metal geometry, TSL material and studio. */
import {
  BufferGeometry,
  BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  Scene,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
// oxlint-disable eslint/no-restricted-imports -- Offline provenance capture compiles the original committed Tau app source; these imports never enter the website bundle.
import {
  getMetalMorphGeometryData,
  metalMorphShapeIds,
} from '../../ui/app/components/geometry/loader/metal-morph-shapes.ts';
import {
  createMetalMorphNodeMaterial,
  metalMorphShapeAttributeName,
  metalMorphDirectionAttributeName,
} from '../../ui/app/components/geometry/loader/metal-morph-material.node.ts';
import { createMetalMorphEnvironment } from '../../ui/app/components/geometry/loader/metal-morph-environment.ts';
// oxlint-enable eslint/no-restricted-imports
const data = getMetalMorphGeometryData(6);
const geometry = new BufferGeometry();
geometry.setAttribute('position', new BufferAttribute(data.directions, 3));
geometry.setIndex(new BufferAttribute(data.index, 1));
for (const [i, id] of metalMorphShapeIds.entries()) {
  const buffer = new InterleavedBuffer(data.shapes[id], 8);
  geometry.setAttribute(metalMorphShapeAttributeName(i), new InterleavedBufferAttribute(buffer, 4, 0));
  geometry.setAttribute(metalMorphDirectionAttributeName(i), new InterleavedBufferAttribute(buffer, 3, 4));
}
const renderer = new WebGPURenderer({ forceWebGL: true, alpha: true, antialias: true });
renderer.setSize(1100, 1100);
renderer.setPixelRatio(2);
await renderer.init();
renderer.setClearColor(0xff_ff_ff, 0);
document.body.append(renderer.domElement);
const scene = new Scene();
const camera = new PerspectiveCamera(26, 1, 0.1, 40);
camera.position.set(0, 0.3, 6.2);
camera.lookAt(0, 0, 0);
const { material } = createMetalMorphNodeMaterial();
const mesh = new Mesh(geometry, material);
mesh.frustumCulled = false;
mesh.quaternion.setFromAxisAngle(new Vector3(0.55, 0.8, 0.25).normalize(), 0.9);
scene.add(mesh);
const env = createMetalMorphEnvironment(renderer, 'light', { size: 256 });
scene.environment = env.texture;
renderer.render(scene, camera);
document.documentElement.dataset.captureReady = 'true';
