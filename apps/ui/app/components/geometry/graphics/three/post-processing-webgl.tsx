import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { EffectComposer, RenderPass } from 'postprocessing';
// @ts-expect-error -- n8ao 1.10.2 does not publish TypeScript declarations.
import { N8AOPostPass } from 'n8ao';
import type { ThreeCamera } from '@taucad/three/camera';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';

type N8AOPass = {
  configuration: {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    screenSpaceRadius: boolean;
  };
  dispose?: () => void;
};

type EndpointComposer = Readonly<{
  camera: ThreeCamera;
  composer: EffectComposer;
}>;

const createEndpointComposer = ({
  camera,
  gl,
  scene,
  width,
  height,
}: {
  readonly camera: ThreeCamera;
  readonly gl: WebGLRenderer;
  readonly scene: Scene;
  readonly width: number;
  readonly height: number;
}): EndpointComposer => {
  const composer = new EffectComposer(gl, { stencilBuffer: true, multisampling: 4 });
  const renderPass = new RenderPass(scene, camera);
  let aoPass: N8AOPass | undefined;
  let renderPassAdded = false;
  let aoPassAdded = false;
  try {
    aoPass = new N8AOPostPass(scene, camera) as N8AOPass;
    Object.assign(aoPass.configuration, {
      screenSpaceRadius: true,
      aoRadius: 24,
      intensity: 1,
      distanceFalloff: 0,
    });
    composer.addPass(renderPass);
    renderPassAdded = true;
    composer.addPass(aoPass as never);
    aoPassAdded = true;
    composer.setSize(width, height);
    return { camera, composer };
  } catch (error) {
    if (!aoPassAdded) aoPass?.dispose?.();
    if (!renderPassAdded) renderPass.dispose();
    composer.dispose();
    throw error;
  }
};

const disposeEndpointComposer = (resource: EndpointComposer): void => {
  resource.composer.dispose();
};

/** One render owner backed by two persistent, prewarmed endpoint composers. */
export function PostProcessingWebGL(): undefined {
  const { gl, scene, size, invalidate } = useThree();
  const cameraRig = useCameraRig();
  const resourcesRef = useRef<Map<Camera, EndpointComposer> | undefined>(undefined);
  const selectedRef = useRef<EndpointComposer | undefined>(undefined);

  useLayoutEffect(() => {
    const renderer = gl as WebGLRenderer;
    let resources: EndpointComposer[] = [];
    try {
      resources.push(
        createEndpointComposer({
          camera: cameraRig.perspectiveCamera,
          gl: renderer,
          scene,
          width: size.width,
          height: size.height,
        }),
        createEndpointComposer({
          camera: cameraRig.orthographicCamera,
          gl: renderer,
          scene,
          width: size.width,
          height: size.height,
        }),
      );
      for (const resource of resources) {
        resource.composer.autoRenderToScreen = false;
        resource.composer.render(0);
        resource.composer.autoRenderToScreen = true;
      }
    } catch (error) {
      for (const resource of resources) {
        disposeEndpointComposer(resource);
      }
      console.error('Failed to warm WebGL post-processing pipelines', error);
      return undefined;
    }

    resourcesRef.current = new Map(resources.map((resource) => [resource.camera, resource]));
    selectedRef.current = resourcesRef.current.get(cameraRig.activeCamera);
    invalidate();
    return () => {
      resourcesRef.current = undefined;
      selectedRef.current = undefined;
      for (const resource of resources) {
        disposeEndpointComposer(resource);
      }
    };
  }, [cameraRig, gl, invalidate, scene]);

  useLayoutEffect(() => {
    for (const resource of resourcesRef.current?.values() ?? []) {
      resource.composer.setSize(size.width, size.height);
    }
    invalidate();
  }, [invalidate, size.height, size.width]);

  const retarget = useCallback((camera: ThreeCamera): void => {
    selectedRef.current = resourcesRef.current?.get(camera);
  }, []);
  useCameraRetarget(retarget);

  useFrame((state, delta) => {
    const selected = selectedRef.current;
    if (selected) {
      selected.composer.render(delta);
      return;
    }
    state.gl.render(state.scene, state.camera);
  }, 1);

  return undefined;
}
