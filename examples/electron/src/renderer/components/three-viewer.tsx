import type { JSX } from 'react';

import { useEffect, useRef } from 'react';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ThreeViewerProperties = {
  readonly glb: ArrayBuffer | undefined;
};

const BACKGROUND_HEX = 0x0b_0f_13;

const disposeObjectGraph = (object: THREE.Object3D): void => {
  /* Three.js `Object3D.traverse` widens children to `Object3D`; peel to `THREE.Mesh` first. */

  object.traverse((candidate) => {
    if (!(candidate instanceof THREE.Mesh)) {
      return;
    }

    THREE.BufferGeometry.prototype.dispose.call(candidate.geometry);

    const materialsRaw = candidate.material as THREE.Material | THREE.Material[];
    const materials: THREE.Material[] = Array.isArray(materialsRaw) ? materialsRaw : [materialsRaw];
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) {
        material.map.dispose();
      }
      material.dispose();
    }
  });
};

const fitPerspectiveCameraAndControls = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
): void => {
  const box = new THREE.Box3().setFromObject(object);
  const { radius } = box.getBoundingSphere(new THREE.Sphere());
  let safeRadius = radius;

  if (!Number.isFinite(safeRadius) || safeRadius <= 1e-6) {
    safeRadius = 1;
  }

  const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());

  const fovRadians = THREE.MathUtils.degToRad(camera.fov);
  const denominator = Math.sin(Math.min(fovRadians * 0.5, Math.PI / 2 - Number.EPSILON));
  const fittedDistance = safeRadius / denominator;

  /* Pull the camera outward so framing tracks object size reliably on updates. */

  const marginFactor = 1.28;

  const distance = fittedDistance * marginFactor;

  const direction = new THREE.Vector3(0.82, 0.42, 0.94).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 4096, safeRadius / 8192, 0.001);
  camera.far = Math.max(distance * 32, safeRadius * 96, safeRadius + 1000);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
};

export function ThreeViewer({ glb }: ThreeViewerProperties): JSX.Element {
  const hostReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostReference.current;

    if (!host || glb === undefined || glb.byteLength === 0) {
      return undefined;
    }

    const surface = host;

    let disposed = false;
    let animationFrameIdentifier = 0;
    let loadedRoot: THREE.Object3D | undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_HEX);

    scene.add(new THREE.HemisphereLight(0xff_ff_ff, 0x17_20_2a, 1.1));

    const keyLight = new THREE.DirectionalLight(0xff_ff_ff, 1.7);
    keyLight.position.set(5, 7, 9);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9e_d7_ff, 0.48);
    fillLight.position.set(-6, 4, -5);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(surface.clientWidth, 1) / Math.max(surface.clientHeight, 1),
    );

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.className = 'block h-full w-full';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    surface.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const loader = new GLTFLoader();

    loader.parse(
      glb,
      '',
      (gltf) => {
        if (disposed) {
          disposeObjectGraph(gltf.scene);

          return;
        }

        loadedRoot = gltf.scene;
        scene.add(gltf.scene);

        resizeRendererToHost();

        fitPerspectiveCameraAndControls(camera, controls, gltf.scene);
      },

      (): void => {
        /* Parsing rarely fails once the runtime emits GLB bytes; tolerate silently here. */
      },
    );

    function resizeRendererToHost(): void {
      const clampedHeight = Math.max(surface.clientHeight, 1);
      const clampedWidth = Math.max(surface.clientWidth, 1);
      renderer.setPixelRatio(globalThis.window.devicePixelRatio);
      renderer.setSize(clampedWidth, clampedHeight, false);
      camera.aspect = clampedWidth / clampedHeight;
      camera.updateProjectionMatrix();
      controls.update();
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeRendererToHost();
    });
    resizeObserver.observe(surface);

    resizeRendererToHost();

    function animate(): void {
      if (disposed) {
        return;
      }

      animationFrameIdentifier = globalThis.window.requestAnimationFrame(animate);

      controls.update();

      renderer.render(scene, camera);
    }

    animate();

    return (): void => {
      disposed = true;

      cancelAnimationFrame(animationFrameIdentifier);

      resizeObserver.disconnect();

      controls.dispose();

      if (loadedRoot) {
        scene.remove(loadedRoot);
        disposeObjectGraph(loadedRoot);
      }

      renderer.dispose();

      renderer.domElement.remove();
    };
  }, [glb]);

  const showPlaceholder = glb === undefined || glb.byteLength === 0;

  return (
    <div className='bg-slate-950 min-h-96 flex-1 xl:min-h-0'>
      <div ref={hostReference} className='relative h-full min-h-96 w-full overflow-hidden xl:min-h-0'>
        {showPlaceholder ? (
          <div className='text-slate-500 absolute inset-0 grid place-items-center font-mono text-xs'>
            No geometry yet
          </div>
        ) : null}
      </div>
    </div>
  );
}
