import { useEffect, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { Geometry } from '@taucad/types';
import { ModelViewer } from '#components/model-viewer.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { ThemeProvider } from '#hooks/use-theme.js';
import { getViewCameraSession } from '#services/graphics-camera-registry.js';

const views = {
  iso: [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
  front: [0, -1, 0],
  left: [-1, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  underside: [
    Math.cos(Math.asin(1 / Math.sqrt(3)) - (5 * Math.PI) / 12) / Math.sqrt(2),
    -Math.cos(Math.asin(1 / Math.sqrt(3)) - (5 * Math.PI) / 12) / Math.sqrt(2),
    Math.sin(Math.asin(1 / Math.sqrt(3)) - (5 * Math.PI) / 12),
  ],
} as const;

export function RenderingProfile(): React.JSX.Element {
  const [geometry, setGeometry] = useState<Geometry>();
  const [viewName, setViewName] = useState(sessionStorage.getItem('lighting-calibration-view') ?? 'iso');
  const [span, setSpan] = useState(sessionStorage.getItem('lighting-calibration-span') ?? '198.5');
  const [cameraDescription, setCameraDescription] = useState('');
  const graphicsRef = useActorRef(graphicsMachine, {
    input: {
      ...defaultGraphicsSettings,
      measureSnapDistance: 40,
      enablePostProcessing: true,
      upDirection: 'z',
      graphicsBackend: 'webgl',
    },
  });
  const renderingState = useSelector(graphicsRef, (snapshot) =>
    JSON.stringify({
      state: snapshot.value,
      ao: snapshot.context.enablePostProcessing,
      backend: snapshot.context.resolvedGraphicsBackend,
    }),
  );
  useEffect(() => {
    void fetch('/onshape-planetary-reference.glb').then(async (response) => {
      setGeometry({ format: 'gltf', content: new Uint8Array(await response.arrayBuffer()) });
    });
  }, []);
  const setCamera = (name: keyof typeof views, nextSpan = Number(span)): void => {
    const session = getViewCameraSession(graphicsRef);
    if (!session) return;
    const view = session.rig.actorRef.getSnapshot().context.view;
    session.rig.actorRef.send({
      type: 'setView',
      target: view.target,
      direction: views[name],
      up: name === 'top' ? [0, 1, 0] : name === 'bottom' ? [0, -1, 0] : [0, 0, 1],
      verticalSpan: nextSpan,
    });
    sessionStorage.setItem('lighting-calibration-view', name);
    sessionStorage.setItem('lighting-calibration-span', String(nextSpan));
    setViewName(name);
    setCameraDescription(
      JSON.stringify({
        ...session.rig.actorRef.getSnapshot().context.view,
        near: session.rig.activeCamera.near,
        far: session.rig.activeCamera.far,
      }),
    );
  };
  useEffect(() => {
    if (!geometry) return;
    const timer = window.setInterval(() => {
      const session = getViewCameraSession(graphicsRef);
      if (!session || (session.rig.actorRef.getSnapshot().context.view.bounds?.max[0] ?? 0) < 86) return;
      setCamera(viewName as keyof typeof views);
      window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [geometry]);
  return (
    <ThemeProvider specifiedTheme='light' themeAction='/action/set-theme'>
      <main style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'white' }}>
        <div style={{ position: 'absolute', left: 452, right: 0, top: 78, height: 798 }}>
          <ModelViewer
            geometry={geometry}
            graphicsRef={graphicsRef}
            initialVerticalFieldOfView={0}
            graphicsOptions={{
              enableGrid: false,
              enableAxes: false,
              enableGizmo: false,
              enableLines: true,
              viewerClassName: 'bg-white',
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: 440,
            padding: 16,
            overflow: 'hidden',
            background: '#f6f6f6',
            color: 'black',
          }}
        >
          <h1>WebGL lighting calibration</h1>
          <p>{renderingState}</p>
          <p>Same STEP, native BRep edges, orthographic camera</p>
          <div>
            {Object.keys(views).map((name) => (
              <button key={name} style={{ padding: 8 }} onClick={() => setCamera(name as keyof typeof views)}>
                {name}
              </button>
            ))}
          </div>
          <label>
            Scene vertical span
            <input aria-label='Vertical span' value={span} onChange={(event) => setSpan(event.target.value)} />
          </label>
          <button onClick={() => setCamera(viewName as keyof typeof views)}>Apply span</button>
          <button onClick={() => graphicsRef.send({ type: 'setPostProcessingVisibility', payload: false })}>
            AO off
          </button>
          <button onClick={() => graphicsRef.send({ type: 'setPostProcessingVisibility', payload: true })}>
            AO on
          </button>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{cameraDescription}</pre>
        </div>
      </main>
    </ThemeProvider>
  );
}

export default RenderingProfile;
