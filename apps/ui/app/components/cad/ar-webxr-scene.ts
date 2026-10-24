import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Fallback distance in front of the starting pose when the session offers no hit testing, in metres. */
const fallbackDistance = 1.2;

function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const { geometry, material } = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    geometry?.dispose();
    for (const each of Array.isArray(material) ? material : material ? [material] : []) {
      each.dispose();
    }
  });
}

async function requestHitTestSource(session: XRSession): Promise<XRHitTestSource | undefined> {
  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    return await session.requestHitTestSource?.({ space: viewerSpace });
  } catch {
    // The optional feature was not granted: place the model in front of the starting pose instead.
    return undefined;
  }
}

/**
 * Render the GLB in a granted `immersive-ar` session at true scale. The GLB is canonical glTF (Y up, metres), which is
 * WebXR's world convention, so it needs no unit or axis conversion. A floor reticle follows the hit test, and a tap
 * places the model there, turned to face the person; without hit testing the model stands in front of the starting
 * pose.
 *
 * @param session - The granted session.
 * @param glb - The model's GLB bytes.
 * @param hooks - `onPlaced` runs after each placement.
 * @returns A disposer that stops rendering and frees the scene's GPU resources.
 */
export async function presentGlbInArSession(
  session: XRSession,
  glb: Uint8Array<ArrayBuffer>,
  hooks: Readonly<{ onPlaced: () => void }>,
): Promise<() => void> {
  const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(globalThis.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  try {
    await renderer.xr.setSession(session);
  } catch (error) {
    disposeObject(gltf.scene);
    renderer.dispose();
    throw error;
  }

  const scene = new Scene();
  scene.add(new HemisphereLight(0xff_ff_ff, 0x44_44_44, 2.5));
  const sun = new DirectionalLight(0xff_ff_ff, 1.5);
  sun.position.set(1, 3, 2);
  scene.add(sun);
  const camera = new PerspectiveCamera();

  // Stand the model on its lowest point, centred on the placement.
  const bounds = new Box3().setFromObject(gltf.scene);
  const center = bounds.getCenter(new Vector3());
  gltf.scene.position.set(-center.x, -bounds.min.y, -center.z);
  const model = new Group();
  model.add(gltf.scene);
  scene.add(model);

  const reticle = new Mesh(
    new RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xff_ff_ff }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const hitTestSource = await requestHitTestSource(session);
  if (hitTestSource) {
    model.visible = false;
  } else {
    model.position.set(0, -0.5, -Math.max(fallbackDistance, bounds.getSize(new Vector3()).length() * 1.5));
    hooks.onPlaced();
  }

  const placement = new Vector3();
  const onSelect = (): void => {
    if (!reticle.visible) {
      return;
    }

    placement.setFromMatrixPosition(reticle.matrix);
    model.position.copy(placement);
    const viewer = renderer.xr.getCamera().position;
    model.rotation.set(0, Math.atan2(viewer.x - placement.x, viewer.z - placement.z), 0);
    model.visible = true;
    hooks.onPlaced();
  };
  session.addEventListener('select', onSelect);

  renderer.setAnimationLoop((_time, frame) => {
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (hitTestSource && referenceSpace) {
      const pose = frame.getHitTestResults(hitTestSource)[0]?.getPose(referenceSpace);
      reticle.visible = Boolean(pose);
      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
      }
    }

    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    session.removeEventListener('select', onSelect);
    hitTestSource?.cancel();
    disposeObject(scene);
    renderer.dispose();
  };
}
