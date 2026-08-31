import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Box3, Vector3, Object3D } from 'three';
import type { Group } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';
import { Loader } from '#components/ui/loader.js';
import { useSharedRenderer } from '#components/docs/shared-renderer.js';
import { useRuntime } from '@taucad/react';
import { cn } from '#utils/ui.utils.js';
import { applyCanonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

const gltfLoader = new GLTFLoader();

const kernelModelViewRuntime = defineRuntime({
  plugins: [replicad(), esbuild()],
});
const kernelModelViewClientOptions = {
  runtime: kernelModelViewRuntime,
  transport: inProcessTransport({ runtime: kernelModelViewRuntime, fileSystem: fromMemoryFs() }),
};

type KernelModelViewProps = {
  readonly code: string;
  readonly className?: string;
};

/**
 * Renders a Replicad model using `useRuntime` and the shared Three.js renderer.
 *
 * Lifecycle:
 * 1. Lazily starts rendering when the component enters the viewport
 * 2. `useRuntime` produces GLTF geometry via an in-memory RuntimeClient
 * 3. Loads GLTF into a Three.js scene
 * 4. Uses OrbitControls on the visible canvas for interaction
 * 5. Delegates actual WebGL rendering to the SharedRenderer
 */
export function KernelModelView({ code, className }: KernelModelViewProps): React.JSX.Element {
  const sharedRenderer = useSharedRenderer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<Scene | undefined>(undefined);
  const cameraRef = useRef<PerspectiveCamera | undefined>(undefined);
  const controlsRef = useRef<OrbitControls | undefined>(undefined);
  const gltfSceneRef = useRef<Group | undefined>(undefined);

  const [isVisible, setIsVisible] = useState(false);

  // eslint-disable-next-line @typescript-eslint/naming-convention -- file path key
  const renderCode = useMemo(() => ({ 'main.ts': code }), [code]);

  const { geometry, status, error } = useRuntime({
    clientOptions: kernelModelViewClientOptions,
    source: { files: renderCode },
    enabled: isVisible,
  });

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!canvas || !scene || !camera) {
      return;
    }

    sharedRenderer.render(scene, camera, canvas);
  }, [sharedRenderer]);

  // Scene + camera setup
  useEffect(() => {
    // Loaded glTF is adapted once into Tau's Z-up presentation world.
    const zUp = new Vector3(0, 0, 1);
    Object3D.DEFAULT_UP.copy(zUp);

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 10_000);
    camera.up.copy(zUp);
    camera.position.set(150, -150, 150);
    camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight(0xff_ff_ff, 0.8);
    const directional = new DirectionalLight(0xff_ff_ff, 1.2);
    directional.position.set(100, -150, 200);
    scene.add(ambient, directional);

    sceneRef.current = scene;
    cameraRef.current = camera;

    return () => {
      sceneRef.current = undefined;
      cameraRef.current = undefined;
    };
  }, []);

  // OrbitControls
  useEffect(() => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) {
      return;
    }

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.addEventListener('change', renderFrame);
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener('change', renderFrame);
      controls.dispose();
      controlsRef.current = undefined;
    };
  }, [renderFrame]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Load GLTF geometry into Three.js scene
  useEffect(() => {
    if (geometry?.format !== 'gltf') {
      return;
    }

    let cancelled = false;

    // oxlint-disable-next-line tau-lint/no-async-iife -- async IIFE is unavoidable here
    void (async () => {
      const gltf = await gltfLoader.parseAsync(geometry.content.buffer, '');
      applyCanonicalGltfWorld(gltf.scene);

      // oxlint-disable-next-line eslint/no-constant-condition, typescript/no-unnecessary-condition -- cancelled is mutated by cleanup after await
      if (cancelled) {
        return;
      }

      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!scene || !camera) {
        return;
      }

      if (gltfSceneRef.current) {
        scene.remove(gltfSceneRef.current);
      }

      scene.add(gltf.scene);
      gltfSceneRef.current = gltf.scene;

      const box = new Box3().setFromObject(gltf.scene);
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2;

      camera.position.set(center.x + distance * 0.7, center.y - distance * 0.7, center.z + distance * 0.5);
      camera.lookAt(center);
      camera.near = distance * 0.01;
      camera.far = distance * 10;
      camera.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }

      renderFrame();
    })();

    return () => {
      cancelled = true;
    };
  }, [geometry, renderFrame]);

  // Resize handling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      const camera = cameraRef.current;
      if (camera && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      if (status === 'ready') {
        renderFrame();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [status, renderFrame]);

  const viewState = isVisible ? status : 'idle';

  return (
    <div ref={containerRef} className={cn('relative size-full', className)}>
      <canvas ref={canvasRef} className='size-full' style={{ display: 'block' }} />
      {(viewState === 'connecting' || viewState === 'rendering') && (
        <div className='absolute inset-0 flex items-center justify-center bg-background/50'>
          <Loader className='size-8' />
        </div>
      )}
      {(viewState === 'error' || error) && (
        <div className='absolute inset-0 flex items-center justify-center bg-background/50'>
          <span className='max-w-48 text-center text-xs text-destructive'>{error?.message ?? 'Render failed'}</span>
        </div>
      )}
      {viewState === 'idle' && (
        <div className='absolute inset-0 flex items-center justify-center bg-background/50'>
          <span className='text-xs text-muted-foreground'>Scroll to load</span>
        </div>
      )}
    </div>
  );
}
