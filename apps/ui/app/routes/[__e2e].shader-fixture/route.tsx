import * as React from 'react';
import { Color, Mesh, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { createInfiniteGridNodeMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.node.js';
import { createInfiniteGridGlMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';
import { getGeneratedShaderSource } from '#components/geometry/graphics/three/utils/three-shader-debug.test-utils.js';
import { getEnvironment } from '#environment.config.js';

type ShaderFixtureBackend = 'common-webgl' | 'webgpu';
type ShaderFixtureResult = Readonly<{
  actualBackend: ShaderFixtureBackend;
  fragmentShader: string;
  requestedBackend: ShaderFixtureBackend;
  vertexShader: string;
}>;

type ShaderFixtureGlobal = typeof globalThis & { __TAU_SHADER_FIXTURE__?: ShaderFixtureResult };

const getWebGlShaderSource = (
  renderer: WebGLRenderer,
): Pick<ShaderFixtureResult, 'fragmentShader' | 'vertexShader'> => {
  const program = renderer.info.programs?.at(-1);
  if (!program) {
    throw new Error('Three did not expose the compiled WebGL fixture program.');
  }
  const context = renderer.getContext();
  return {
    fragmentShader: context.getShaderSource(program.fragmentShader) ?? '',
    vertexShader: context.getShaderSource(program.vertexShader) ?? '',
  };
};

export const resolveShaderFixtureBackend = (backend: unknown): ShaderFixtureBackend =>
  typeof backend === 'object' && backend !== null && Reflect.get(backend, 'isWebGPUBackend') === true
    ? 'webgpu'
    : 'common-webgl';

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();

  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown Response objects for route control-flow.
    throw new Response('Not found', { status: 404 });
  }

  return Response.json({ ok: true });
};

const ShaderFixtureDebugRoute = (): React.JSX.Element => {
  const canvasReference = React.useRef<HTMLCanvasElement>(null);
  const [result, setResult] = React.useState<ShaderFixtureResult>();
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    const canvas = canvasReference.current;
    if (!canvas) {
      return;
    }

    const requestedBackend: ShaderFixtureBackend =
      new URLSearchParams(globalThis.location.search).get('backend') === 'webgpu' ? 'webgpu' : 'common-webgl';
    const renderer =
      requestedBackend === 'webgpu'
        ? new WebGPURenderer({ antialias: false, canvas })
        : new WebGLRenderer({ antialias: false, canvas });
    const camera = new PerspectiveCamera(60, 1, 0.01, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const geometry = new PlaneGeometry(2, 2);
    const materialProperties = {
      axes: 'xyz',
      color: new Color(0x20_20_20),
      gridDistance: 20,
      largeSize: 5,
      lineOpacity: 1,
      smallSize: 1,
    } as const;
    const { material } =
      requestedBackend === 'webgpu'
        ? createInfiniteGridNodeMaterial(materialProperties)
        : createInfiniteGridGlMaterial(materialProperties);
    const grid = new Mesh(geometry, material);
    grid.frustumCulled = false;
    const scene = new Scene();
    scene.add(grid);
    let disposed = false;

    const run = async (): Promise<void> => {
      try {
        if (renderer instanceof WebGPURenderer) {
          await renderer.init();
        }
        renderer.setPixelRatio(1);
        renderer.setSize(256, 256, false);
        renderer.setClearColor(new Color(0xff_ff_ff), 1);
        renderer.render(scene, camera);
        const source =
          renderer instanceof WebGPURenderer
            ? await getGeneratedShaderSource({ camera, object: grid, renderer, scene })
            : getWebGlShaderSource(renderer);
        if (!source.vertexShader || !source.fragmentShader) {
          throw new Error('Three did not generate both shader stages for the fixture.');
        }
        const actualBackend =
          renderer instanceof WebGPURenderer ? resolveShaderFixtureBackend(renderer.backend) : 'common-webgl';
        const nextResult = {
          actualBackend,
          fragmentShader: source.fragmentShader,
          requestedBackend,
          vertexShader: source.vertexShader,
        } as const;

        if (!disposed) {
          (globalThis as ShaderFixtureGlobal).__TAU_SHADER_FIXTURE__ = nextResult;
          setResult(nextResult);
        }
      } catch (fixtureError) {
        if (!disposed) {
          setError(fixtureError instanceof Error ? fixtureError.message : String(fixtureError));
        }
      }
    };

    void run();

    return () => {
      disposed = true;
      delete (globalThis as ShaderFixtureGlobal).__TAU_SHADER_FIXTURE__;
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <main className='min-h-screen bg-background p-6'>
      <canvas ref={canvasReference} aria-label='Generated shader fixture' className='size-64 border' />
      <output
        data-testid='shader-fixture-result'
        data-status={error ? 'error' : result ? 'ready' : 'pending'}
        data-requested-backend={result?.requestedBackend}
        data-actual-backend={result?.actualBackend}
      >
        {error ?? (result ? `${result.vertexShader.length}:${result.fragmentShader.length}` : 'Compiling')}
      </output>
    </main>
  );
};

export default ShaderFixtureDebugRoute;
