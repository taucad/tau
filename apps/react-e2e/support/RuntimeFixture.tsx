import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useRuntime, type UseRuntimeClientOptionsProvider, type UseRuntimeTransportPlugin } from '@taucad/react';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { cylinderSource, mainFile } from './replicad-cylinder';

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Intentional test-only browser probe.
  interface Window {
    __tauReactE2eGlb?: Uint8Array<ArrayBuffer>;
    __tauReactE2eGeometryVersion?: number;
    __tauReactE2eState?: {
      readonly capabilities: boolean;
      readonly defaultParameterKeys: readonly string[];
      readonly error: string | undefined;
      readonly status: string;
    };
  }
}

type RuntimeFixtureProperties<Runtime extends AnyRuntimeDefinition> = {
  readonly clientOptions: UseRuntimeClientOptionsProvider<Runtime, UseRuntimeTransportPlugin>;
  readonly mode?: 'inline' | 'file';
};

export function RuntimeFixture<Runtime extends AnyRuntimeDefinition>({
  clientOptions,
  mode = 'inline',
}: RuntimeFixtureProperties<Runtime>): ReactElement {
  const runtimeState = useRuntime({
    clientOptions,
    initialParameters: { radius: 10, height: 24 },
    ...(mode === 'file' ? { source: { path: mainFile } } : { source: { files: { [mainFile]: cylinderSource } } }),
  });
  const parameters = runtimeState.parameters as { radius?: unknown; height?: unknown };
  const radius = Number(parameters.radius ?? 10);
  const height = Number(parameters.height ?? 24);

  useEffect(() => {
    window.__tauReactE2eState = {
      capabilities: runtimeState.capabilities !== undefined,
      defaultParameterKeys: Object.keys(runtimeState.defaultParameters),
      error: runtimeState.error?.message,
      status: runtimeState.status,
    };
  }, [runtimeState.capabilities, runtimeState.defaultParameters, runtimeState.error, runtimeState.status]);

  useEffect(() => {
    if (runtimeState.geometry?.format !== 'gltf') {
      return;
    }
    window.__tauReactE2eGlb = new Uint8Array(runtimeState.geometry.content);
    window.__tauReactE2eGeometryVersion = (window.__tauReactE2eGeometryVersion ?? 0) + 1;
  }, [runtimeState.geometry]);

  return (
    <main>
      <h1>Tau React Runtime E2E</h1>
      <p role='status'>{runtimeState.error ? 'error' : runtimeState.status}</p>
      {runtimeState.error ? <p role='alert'>{runtimeState.error.message}</p> : null}
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
