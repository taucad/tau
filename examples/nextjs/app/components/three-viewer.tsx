'use client';

import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type ThreeViewerProperties = {
  readonly glb: ArrayBuffer | undefined;
};

const disposeObjectGraph = (object: THREE.Object3D): void => {
  object.traverse((candidate) => {
    if (!(candidate instanceof THREE.Mesh)) {
      return;
    }

    const { geometry } = candidate as { readonly geometry?: unknown };
    if (geometry instanceof THREE.BufferGeometry) {
      geometry.dispose();
    }

    const { material } = candidate as { readonly material?: unknown };
    const materialList = Array.isArray(material) ? material : [material];
    for (const material of materialList) {
      if (!(material instanceof THREE.Material)) {
        continue;
      }
      const texture: unknown = Reflect.get(material, 'map');
      if (texture instanceof THREE.Texture) {
        texture.dispose();
      }
      material.dispose();
    }
  });
};

const fitCamera = (camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D): void => {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 1e-6 ? sphere.radius : 1;
  const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.35;
  const direction = new THREE.Vector3(0.78, 0.46, 0.72).normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 4096, 0.001);
  camera.far = Math.max(distance * 32, radius * 96);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
};

export function ThreeViewer({ glb }: ThreeViewerProperties): ReactElement {
  const hostReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostReference.current;
    if (!host || !glb || glb.byteLength === 0) {
      return undefined;
    }

    let disposed = false;
    let frame = 0;
    let loadedRoot: THREE.Object3D | undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b_0f_13);
    scene.add(new THREE.HemisphereLight(0xff_ff_ff, 0x17_20_2a, 1.1));

    const keyLight = new THREE.DirectionalLight(0xff_ff_ff, 1.7);
    keyLight.position.set(5, 7, 9);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9e_d7_ff, 0.48);
    fillLight.position.set(-6, 4, -5);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.className = 'block h-full w-full';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const resize = (): void => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      controls.update();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    new GLTFLoader().parse(
      glb,
      '',
      (gltf) => {
        if (disposed) {
          disposeObjectGraph(gltf.scene);
          return;
        }
        loadedRoot = gltf.scene;
        scene.add(gltf.scene);
        fitCamera(camera, controls, gltf.scene);
      },
      () => undefined,
    );

    const animate = (): void => {
      if (disposed) {
        return;
      }
      frame = globalThis.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      globalThis.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      if (loadedRoot) {
        scene.remove(loadedRoot);
        disposeObjectGraph(loadedRoot);
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [glb]);

  return (
    <div className='bg-slate-950 min-h-96 flex-1 xl:min-h-0'>
      <div ref={hostReference} className='relative h-full min-h-96 w-full overflow-hidden xl:min-h-0'>
        {!glb || glb.byteLength === 0 ? (
          <div className='text-slate-500 absolute inset-0 grid place-items-center font-mono text-xs'>
            Awaiting geometry
          </div>
        ) : null}
      </div>
    </div>
  );
}
