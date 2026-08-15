import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useRuntime } from '@taucad/react';
import type { UseRuntimeOptions, UseRuntimeTransportPlugin } from '@taucad/react';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { summarizeGlb } from './glb-bounds';

type InlineSourceFiles = { readonly '/main.ts': string };
export type RuntimeFixtureOptions<Runtime extends AnyRuntimeDefinition> = UseRuntimeOptions<
  Runtime,
  UseRuntimeTransportPlugin,
  InlineSourceFiles
>;

type RuntimeFixtureProperties<Runtime extends AnyRuntimeDefinition> = {
  readonly options: RuntimeFixtureOptions<Runtime>;
};

export function RuntimeFixture<Runtime extends AnyRuntimeDefinition>({
  options,
}: RuntimeFixtureProperties<Runtime>): ReactElement {
  const [browserCapabilities, setBrowserCapabilities] = useState<{
    readonly isolation: 'isolated' | 'non-isolated';
    readonly sharedMemory: 'available' | 'unavailable';
  }>();
  const runtimeState = useRuntime<Runtime, UseRuntimeTransportPlugin, InlineSourceFiles>(options);
  const parameters = runtimeState.parameters as { radius?: unknown; height?: unknown };
  const radius = Number(parameters.radius ?? 10);
  const height = Number(parameters.height ?? 24);
  const geometrySummary = useMemo(() => {
    if (runtimeState.geometry?.format !== 'gltf') {
      return undefined;
    }
    return summarizeGlb(new Uint8Array(runtimeState.geometry.content));
  }, [runtimeState.geometry]);

  useEffect(() => {
    setBrowserCapabilities({
      isolation: globalThis.crossOriginIsolated ? 'isolated' : 'non-isolated',
      sharedMemory: typeof globalThis.SharedArrayBuffer === 'function' ? 'available' : 'unavailable',
    });
  }, []);

  return (
    <main>
      <h1>Tau React Runtime E2E</h1>
      <section aria-labelledby='browser-capabilities-heading'>
        <h2 id='browser-capabilities-heading'>Browser capabilities</h2>
        <dl>
          <dt>Isolation</dt>
          <dd>
            <output aria-label='Browser isolation'>{browserCapabilities?.isolation ?? 'checking'}</output>
          </dd>
          <dt>Shared memory</dt>
          <dd>
            <output aria-label='Shared memory'>{browserCapabilities?.sharedMemory ?? 'checking'}</output>
          </dd>
        </dl>
      </section>
      <p role='status' aria-label='Runtime status'>
        {runtimeState.error ? 'error' : runtimeState.status}
      </p>
      {runtimeState.error ? (
        <p role='alert' aria-label='Runtime error'>
          {runtimeState.error.message}
        </p>
      ) : null}
      {geometrySummary ? (
        <section aria-labelledby='geometry-summary-heading'>
          <h2 id='geometry-summary-heading'>Geometry summary</h2>
          <dl>
            <dt>Mesh count</dt>
            <dd>
              <output aria-label='Geometry mesh count'>{geometrySummary.meshes}</output>
            </dd>
            <dt>Primitive count</dt>
            <dd>
              <output aria-label='Geometry primitive count'>{geometrySummary.primitives}</output>
            </dd>
            <dt>Width</dt>
            <dd>
              <output aria-label='Geometry width'>{geometrySummary.size[0]}</output>
            </dd>
            <dt>Height</dt>
            <dd>
              <output aria-label='Geometry height'>{geometrySummary.size[1]}</output>
            </dd>
            <dt>Depth</dt>
            <dd>
              <output aria-label='Geometry depth'>{geometrySummary.size[2]}</output>
            </dd>
          </dl>
        </section>
      ) : null}
      <label>
        Radius
        <input
          type='number'
          value={radius}
          onChange={(event) => {
            runtimeState.setParameters((current) => ({ ...current, radius: Number(event.target.value) }));
          }}
        />
      </label>
      <label>
        Height
        <input
          type='number'
          value={height}
          onChange={(event) => {
            runtimeState.setParameters((current) => ({ ...current, height: Number(event.target.value) }));
          }}
        />
      </label>
    </main>
  );
}
