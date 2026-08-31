import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createRuntimeClient, isRenderTimeoutError, isRuntimeTerminatedError } from '@taucad/runtime/client';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import { summarizeGlb } from './glb-bounds';
import { cylinderSource, mainFile } from './replicad-cylinder';

const timeoutRenderDuration = 100;
const normalRenderDuration = 60_000;
const cooperativeFile = 'cooperative.delay';
const quarantinedFile = 'quarantined.delay';
const blockingFile = 'blocking.block';

type OwnedClient = { terminate(): void };

type BrowserCancellationHarnessProperties = {
  readonly createWorker: () => Worker;
};

const expectRenderTimeout = async (render: Promise<unknown>): Promise<void> => {
  try {
    await render;
  } catch (error) {
    if (isRenderTimeoutError(error)) {
      return;
    }
    throw error;
  }
  throw new Error('Render completed instead of timing out.');
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function BrowserCancellationHarness({ createWorker }: BrowserCancellationHarnessProperties): ReactElement {
  const clients = useRef(new Set<OwnedClient>());
  const mounted = useRef(true);
  const [cooperativeStatus, setCooperativeStatus] = useState('idle');
  const [cooperativeError, setCooperativeError] = useState<string>();
  const [cooperativeGeometry, setCooperativeGeometry] = useState<ReturnType<typeof summarizeGlb>>();
  const [hardStatus, setHardStatus] = useState('idle');
  const [hardError, setHardError] = useState<string>();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const client of clients.current) {
        client.terminate();
      }
      clients.current.clear();
    };
  }, []);

  const runCooperativeTimeout = async (): Promise<void> => {
    setCooperativeStatus('running');
    setCooperativeError(undefined);
    setCooperativeGeometry(undefined);
    const client = createRuntimeClient(
      createWebWorkerClientOptions({ createWorker, renderTimeout: timeoutRenderDuration }),
    );
    clients.current.add(client);

    try {
      await expectRenderTimeout(client.render({ source: { files: { [cooperativeFile]: 'delay' } } }));

      client.setRenderTimeout(normalRenderDuration);
      const classifiedSuccessor = await client.render({ source: { files: { [mainFile]: cylinderSource } } });
      if (classifiedSuccessor.superseded || !classifiedSuccessor.geometry.success) {
        throw new Error('Classified timeout successor did not publish geometry.');
      }

      client.setRenderTimeout(timeoutRenderDuration);
      await expectRenderTimeout(client.render({ source: { files: { [quarantinedFile]: 'delay' } } }));
      client.setRenderTimeout(normalRenderDuration);
      const queuedSuccessor = await client.render({ source: { files: { [mainFile]: cylinderSource } } });
      if (queuedSuccessor.superseded || !queuedSuccessor.geometry.success) {
        throw new Error('Queued timeout successor did not publish geometry.');
      }
      if (queuedSuccessor.geometry.data.format !== 'gltf') {
        throw new Error(`Queued timeout successor returned ${queuedSuccessor.geometry.data.format}, expected gltf.`);
      }
      const summary = summarizeGlb(new Uint8Array(queuedSuccessor.geometry.data.content));
      if (mounted.current) {
        setCooperativeGeometry(summary);
        setCooperativeStatus('runtime recovered after timeout');
      }
    } catch (error) {
      if (mounted.current) {
        setCooperativeError(errorMessage(error));
        setCooperativeStatus('error');
      }
    } finally {
      client.terminate();
      clients.current.delete(client);
    }
  };

  const runHardTimeout = async (): Promise<void> => {
    setHardStatus('running');
    setHardError(undefined);
    const client = createRuntimeClient(
      createWebWorkerClientOptions({ createWorker, renderTimeout: timeoutRenderDuration }),
    );
    clients.current.add(client);

    try {
      await expectRenderTimeout(client.render({ source: { files: { [blockingFile]: 'block' } } }));
      client.setRenderTimeout(normalRenderDuration);
      try {
        await client.render({ source: { files: { [mainFile]: cylinderSource } } });
        throw new Error('Blocked runtime accepted successor work instead of terminating.');
      } catch (error) {
        if (!isRuntimeTerminatedError(error) || error.causeKind !== 'render-timeout') {
          throw error;
        }
      }
      if (mounted.current) {
        setHardStatus('runtime terminated after timeout');
      }
    } catch (error) {
      if (mounted.current) {
        setHardError(errorMessage(error));
        setHardStatus('error');
      }
    } finally {
      client.terminate();
      clients.current.delete(client);
    }
  };

  return (
    <section aria-labelledby='browser-cancellation-heading'>
      <h2 id='browser-cancellation-heading'>Browser cancellation</h2>
      <button type='button' disabled={cooperativeStatus === 'running'} onClick={() => void runCooperativeTimeout()}>
        Run delayed render
      </button>
      <output role='status' aria-label='Cooperative timeout status'>
        {cooperativeStatus}
      </output>
      {cooperativeError ? (
        <p role='alert' aria-label='Cooperative timeout error'>
          {cooperativeError}
        </p>
      ) : null}
      {cooperativeGeometry ? (
        <dl>
          <dt>Successor mesh count</dt>
          <dd>
            <output aria-label='Cooperative successor mesh count'>{cooperativeGeometry.meshes}</output>
          </dd>
          <dt>Successor primitive count</dt>
          <dd>
            <output aria-label='Cooperative successor primitive count'>{cooperativeGeometry.primitives}</output>
          </dd>
          <dt>Successor width</dt>
          <dd>
            <output aria-label='Cooperative successor width'>{cooperativeGeometry.size[0]}</output>
          </dd>
          <dt>Successor height</dt>
          <dd>
            <output aria-label='Cooperative successor height'>{cooperativeGeometry.size[1]}</output>
          </dd>
          <dt>Successor depth</dt>
          <dd>
            <output aria-label='Cooperative successor depth'>{cooperativeGeometry.size[2]}</output>
          </dd>
        </dl>
      ) : null}

      <button type='button' disabled={hardStatus === 'running'} onClick={() => void runHardTimeout()}>
        Run blocking render
      </button>
      <output role='status' aria-label='Hard timeout status'>
        {hardStatus}
      </output>
      {hardError ? (
        <p role='alert' aria-label='Hard timeout error'>
          {hardError}
        </p>
      ) : null}
    </section>
  );
}
