import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useRuntime } from '@taucad/react';
import type { UseRuntimeOptions, UseRuntimeTransportPlugin } from '@taucad/react';
import type { RenderStatus } from '@taucad/runtime';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import type { runtime } from '../tau/runtime-definition.js';
import { ParametersPanel } from './components/parameters-panel.js';
import { ThreeViewer } from './components/three-viewer.js';

const mainFile = '/main.scad';

const initialSource = `len=200;
cube([len, len * 5, len ^ 1.5]);
`;

type SourceMode = 'disk' | 'inline';
type InlineSourceFiles = { readonly '/main.scad': string };
type ElectronRuntimeOptions = UseRuntimeOptions<typeof runtime, UseRuntimeTransportPlugin, InlineSourceFiles>;

const clientOptions = createElectronClientOptions<typeof runtime>({ renderTimeout: 60_000 });

const surfaceClassName = 'min-w-0 overflow-hidden rounded-lg border border-slate-400/20 bg-slate-950/90';
const headerClassName =
  'flex min-h-10 items-center justify-between gap-3 border-b border-slate-400/15 bg-slate-900/90 px-3.5 py-2.5';
const statusBadgeBaseClassName = 'shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold capitalize';
const statusBadgeToneClassNames = {
  idle: 'border-slate-400/20 bg-slate-900/90 text-blue-100',
  connecting: 'border-sky-300/30 bg-sky-900/25 text-sky-100',
  rendering: 'border-cyan-300/30 bg-cyan-900/25 text-cyan-100',
  ready: 'border-teal-300/30 bg-teal-700/15 text-sky-300',
  error: 'border-red-400/45 bg-red-900/30 text-red-200',
} satisfies Record<RenderStatus, string>;
const resultToneClassNames = {
  idle: 'bg-slate-900/80 text-slate-400',
  connecting: 'bg-sky-950/30 text-sky-100',
  rendering: 'bg-cyan-950/30 text-cyan-100',
  ready: 'bg-emerald-950/30 text-slate-400',
  error: 'bg-red-950/30 text-red-200',
} satisfies Record<RenderStatus, string>;

export function App(): ReactElement {
  const [source, setSource] = useState(initialSource);
  const [sourceMode, setSourceMode] = useState<SourceMode>('disk');

  const runtimeOptions = useMemo<ElectronRuntimeOptions>(() => {
    if (sourceMode === 'disk') {
      return {
        clientOptions,
        source: { path: mainFile },
      };
    }

    const files: InlineSourceFiles = { [mainFile]: source };
    return {
      clientOptions,
      source: { files },
    };
  }, [source, sourceMode]);
  const runtimeState = useRuntime<typeof runtime, UseRuntimeTransportPlugin, InlineSourceFiles>(runtimeOptions);

  const glb = useMemo(
    () => (runtimeState.geometry?.format === 'gltf' ? runtimeState.geometry.content.buffer : undefined),
    [runtimeState.geometry],
  );

  const { status } = runtimeState;
  const message =
    runtimeState.error?.message ??
    (status === 'ready'
      ? 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.'
      : 'Rendering the OpenSCAD model in an Electron utility process.');

  return (
    <main className='bg-slate-950 flex h-full w-full min-w-0 flex-col gap-3.5 overflow-hidden p-4'>
      <header className='border-slate-400/20 bg-slate-900/85 flex min-h-20 flex-col items-start justify-between gap-4 rounded-lg border px-5 py-4 md:flex-row md:items-center'>
        <div>
          <div className='text-teal-300 text-xs font-bold tracking-normal uppercase'>Electron + Utility Process</div>
          <h1 className='mt-1.5 text-2xl leading-tight font-bold tracking-normal'>Tau Runtime Example</h1>
          <p className='text-slate-400 mt-2 max-w-3xl text-sm leading-normal'>
            Edit OpenSCAD source, tune parameters, and watch @taucad/runtime render through a utility process.
          </p>
        </div>
        <div className={`${statusBadgeBaseClassName} ${statusBadgeToneClassNames[status]}`}>
          <span>{status}</span>
        </div>
      </header>

      <section className='grid min-h-0 flex-1 grid-cols-1 gap-3.5 xl:grid-cols-12' aria-label='Runtime workspace'>
        <section className={`${surfaceClassName} flex min-h-96 flex-col xl:col-span-3 xl:min-h-0`} aria-label='Source'>
          <div className={headerClassName}>
            <h2 className='text-slate-200 text-sm font-bold tracking-normal'>main.scad</h2>
          </div>
          <textarea
            className='bg-slate-900 text-slate-200 min-h-0 flex-1 resize-none border-0 p-4 font-mono text-sm leading-relaxed tab-2 outline-none'
            spellCheck={false}
            value={source}
            onChange={(event) => {
              setSourceMode('inline');
              setSource(event.target.value);
            }}
          />
        </section>

        <section
          className={`${surfaceClassName} flex min-h-96 flex-col xl:col-span-6 xl:min-h-0`}
          aria-label='3D preview'
        >
          <div className={headerClassName}>
            <h2 className='text-slate-200 text-sm font-bold tracking-normal'>Preview</h2>
            <dl className='text-slate-400 flex items-center gap-3 text-xs'>
              <div className='flex items-center gap-1.5'>
                <dt className='text-slate-500 text-xs font-extrabold tracking-normal uppercase'>Transport</dt>
                <dd className='text-slate-50 m-0 text-xs font-bold wrap-anywhere'>electron-utility</dd>
              </div>
            </dl>
          </div>
          <ThreeViewer glb={glb} />
          <div
            className={`border-slate-400/15 grid min-h-14 gap-1 border-t px-3.5 py-3 text-xs ${resultToneClassNames[status]}`}
          >
            <strong className='text-slate-100'>
              {status === 'ready' ? 'Ready' : status === 'error' ? 'Error' : 'Working'}
            </strong>
            <span>{message}</span>
          </div>
        </section>

        <aside className='flex min-h-96 flex-col xl:col-span-3 xl:min-h-0' aria-label='Parameters'>
          <section className={`${surfaceClassName} flex min-h-0 flex-col`}>
            <div className={headerClassName}>
              <h2 className='text-slate-200 text-sm font-bold tracking-normal'>Parameters</h2>
            </div>
            <ParametersPanel
              values={runtimeState.parameters}
              schema={runtimeState.jsonSchema}
              onChange={runtimeState.setParameters}
            />
          </section>
        </aside>
      </section>
    </main>
  );
}
