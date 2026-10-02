import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createRuntimeClient, isOperationTimeoutError, isRuntimeTerminatedError } from '@taucad/runtime/client';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import type { runtime } from '../main/runtime-definition.js';
import { RuntimeFixture } from '../../../../support/runtime-fixture';
import type { RuntimeFixtureOptions } from '../../../../support/runtime-fixture';
import { mainFile } from '../../../../support/replicad-cylinder';

const clientOptions = createElectronClientOptions<typeof runtime>({ operationTimeout: 60_000 });
const timeoutClientOptions = createElectronClientOptions<typeof runtime>({ operationTimeout: 60_000 });
const runtimeOptions = {
  clientOptions,
  initialParameters: { radius: 10, height: 24 },
  source: { path: mainFile },
} satisfies RuntimeFixtureOptions<typeof runtime>;

type TimeoutPhase = 'idle' | 'running' | 'render timed out' | 'runtime terminated after timeout' | 'failed';

const TimeoutRuntimeHarness = (): ReactElement => {
  const [phase, setPhase] = useState<TimeoutPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const activeClient = useRef<{ terminate(): void } | undefined>(undefined);

  useEffect(
    () => () => {
      activeClient.current?.terminate();
      activeClient.current = undefined;
    },
    [],
  );

  const runBlockingRender = async (): Promise<void> => {
    setErrorMessage(undefined);
    setPhase('running');

    try {
      const client = createRuntimeClient(await timeoutClientOptions());
      activeClient.current = client;
      try {
        const description = await client.describe({ source: { path: 'blocking.block' } });
        if (!description.success) {
          throw new Error(description.issues.map(({ message }) => message).join('; '));
        }
        client.setOperationTimeout(5000);
        try {
          const document = client.open({ source: { path: 'blocking.block' }, watch: false });
          try {
            await document.evaluation();
          } finally {
            document.close();
          }
          throw new Error('The blocking render unexpectedly settled.');
        } catch (error) {
          if (!isOperationTimeoutError(error)) {
            throw error;
          }
        }

        setPhase('render timed out');
        try {
          const document = client.open({ source: { path: 'main.ts' }, watch: false });
          try {
            await document.view().rendering();
          } finally {
            document.close();
          }
          throw new Error('The timed-out runtime unexpectedly accepted another render.');
        } catch (error) {
          if (!isRuntimeTerminatedError(error) || error.causeKind !== 'operation-timeout') {
            throw error;
          }
        }
        setPhase('runtime terminated after timeout');
      } finally {
        client.terminate();
        if (activeClient.current === client) {
          activeClient.current = undefined;
        }
      }
    } catch (error) {
      setPhase('failed');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const isRunning = phase === 'running' || phase === 'render timed out';
  return (
    <section aria-labelledby='timeout-runtime-heading'>
      <h2 id='timeout-runtime-heading'>Electron timeout recovery</h2>
      <p role='status' aria-label='Timeout runtime status'>
        {phase}
      </p>
      {errorMessage ? (
        <p role='alert' aria-label='Timeout runtime error'>
          {errorMessage}
        </p>
      ) : null}
      <button
        type='button'
        disabled={isRunning}
        onClick={() => {
          void runBlockingRender();
        }}
      >
        Run blocking render
      </button>
    </section>
  );
};

createRoot(document.querySelector('#root')!).render(
  <>
    <RuntimeFixture<typeof runtime> options={runtimeOptions} />
    <TimeoutRuntimeHarness />
  </>,
);
