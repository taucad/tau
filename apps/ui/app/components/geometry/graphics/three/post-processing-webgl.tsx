import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ShaderMaterial } from 'three';
import type { Camera, Scene, Texture, WebGLRenderer } from 'three';
import { EffectComposer, Pass, RenderPass } from 'postprocessing';
// @ts-expect-error -- n8ao 1.10.2 does not publish TypeScript declarations.
import { N8AOPostPass as N8AoPostPassUntyped } from 'n8ao';
import type { ThreeCamera } from '@taucad/three/camera';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';
import { useOverlayDepthRestore } from '#components/geometry/graphics/three/scene-overlay.js';

type N8AoPass = Pass & {
  configuration: {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    screenSpaceRadius: boolean;
  };
  dispose?: () => void;
};

const N8AoPostPass = N8AoPostPassUntyped as unknown as new (scene: Scene, camera: ThreeCamera) => N8AoPass;

type EndpointComposer = Readonly<{
  camera: ThreeCamera;
  composer: EffectComposer;
  depthRestore: CanvasDepthRestorePass;
}>;

/** Receives the composer's stable depth texture, then writes it to canvas on demand. */
class CanvasDepthRestorePass extends Pass {
  public constructor() {
    super('TauCanvasDepthRestorePass');
    this.needsDepthTexture = true;
    this.needsSwap = false;
    this.fullscreenMaterial = new ShaderMaterial({
      colorWrite: false,
      depthTest: false,
      depthWrite: true,
      uniforms: { depthBuffer: { value: null } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D depthBuffer;
        varying vec2 vUv;
        void main() {
          gl_FragDepth = texture2D(depthBuffer, vUv).r;
          gl_FragColor = vec4(0.0);
        }
      `,
    });
  }

  public override setDepthTexture(depthTexture: Texture): void {
    (this.fullscreenMaterial as ShaderMaterial).uniforms['depthBuffer']!.value = depthTexture;
  }

  /** Composer insertion is only for stable depth delivery; restoration runs after final colour. */
  public override render(): void {
    return undefined;
  }

  public restore(renderer: WebGLRenderer): void {
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    try {
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  }
}

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
  const depthRestore = new CanvasDepthRestorePass();
  let aoPass: N8AoPass | undefined;
  let renderPassAdded = false;
  let depthRestoreAdded = false;
  let aoPassAdded = false;
  try {
    aoPass = new N8AoPostPass(scene, camera);
    Object.assign(aoPass.configuration, {
      screenSpaceRadius: true,
      aoRadius: 24,
      intensity: 1,
      distanceFalloff: 0,
    });
    composer.addPass(renderPass);
    renderPassAdded = true;
    composer.addPass(depthRestore);
    depthRestoreAdded = true;
    composer.addPass(aoPass);
    aoPassAdded = true;
    composer.setSize(width, height);
    return { camera, composer, depthRestore };
  } catch (error) {
    if (!aoPassAdded) {
      aoPass?.dispose();
    }
    if (!depthRestoreAdded) {
      depthRestore.dispose();
    }
    if (!renderPassAdded) {
      renderPass.dispose();
    }
    composer.dispose();
    throw error;
  }
};

const disposeEndpointComposer = (resource: EndpointComposer): void => {
  resource.composer.dispose();
};

/** One render owner backed by two persistent, prewarmed endpoint composers. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- WebGL acronym matches the public component API.
export function PostProcessingWebGL(): undefined {
  const { gl, scene, size, invalidate } = useThree();
  const cameraRig = useCameraRig();
  const resourcesRef = useRef<Map<Camera, EndpointComposer> | undefined>(undefined);
  const selectedRef = useRef<EndpointComposer | undefined>(undefined);

  useLayoutEffect(() => {
    const renderer = gl;
    const resources: EndpointComposer[] = [];
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

  const restoreDepth = useCallback((): void => {
    selectedRef.current?.depthRestore.restore(gl);
  }, [gl]);
  useOverlayDepthRestore(restoreDepth);

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
