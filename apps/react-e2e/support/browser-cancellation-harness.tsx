import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  asKnownArtifact,
  createRuntimeClient,
  isOperationTimeoutError,
  isRuntimeTerminatedError,
} from '@taucad/runtime/client';
import type { RuntimeClient, RuntimeSource } from '@taucad/runtime/client';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import { summarizeGlb } from './glb-bounds';
import { cylinderSource, mainFile } from './replicad-cylinder';

const timeoutRenderDuration = 100;
const normalRenderDuration = 60_000;
const cooperativeFile = 'cooperative.delay';
const quarantinedFile = 'quarantined.quarantine';
const blockingFile = 'blocking.block';

type OwnedClient = { terminate(): void };

type BrowserCancellationHarnessProperties = {
  readonly createWorker: () => Worker;
};

const expectOperationTimeout = async (render: Promise<unknown>): Promise<void> => {
  try {
    await render;
  } catch (error) {
    if (isOperationTimeoutError(error)) {
      return;
    }
    throw error;
  }
  throw new Error('Render completed instead of timing out.');
};

const timeOutEvaluation = async (client: RuntimeClient, source: RuntimeSource): Promise<void> => {
  client.setOperationTimeout(normalRenderDuration);
  const description = await client.describe({ source });
  if (!description.success) {
    throw new Error(description.issues.map(({ message }) => message).join('; '));
  }
  client.setOperationTimeout(timeoutRenderDuration);
  const document = client.open({ source, watch: false });
  try {
    await expectOperationTimeout(document.evaluation());
  } finally {
    document.close();
  }
};

const projectCylinder = async (client: RuntimeClient) => {
  const document = client.open({ source: { files: { [mainFile]: cylinderSource } }, watch: false });
  try {
    return await document.view().rendering();
  } finally {
    document.close();
  }
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
      createWebWorkerClientOptions({ createWorker, operationTimeout: normalRenderDuration }),
    );
    clients.current.add(client);

    try {
      await timeOutEvaluation(client, { files: { [cooperativeFile]: 'delay' } });

      client.setOperationTimeout(normalRenderDuration);
      const classifiedSuccessor = await projectCylinder(client);
      if (classifiedSuccessor.superseded || !classifiedSuccessor.rendering.success) {
        throw new Error('Classified timeout successor did not publish geometry.');
      }

      client.setOperationTimeout(timeoutRenderDuration);
      await timeOutEvaluation(client, { files: { [quarantinedFile]: 'delay' } });
      client.setOperationTimeout(normalRenderDuration);
      const queuedSuccessor = await projectCylinder(client);
      if (queuedSuccessor.superseded || !queuedSuccessor.rendering.success) {
        throw new Error('Queued timeout successor did not publish geometry.');
      }
      const artifact = asKnownArtifact(queuedSuccessor.rendering.artifact);
      if (artifact?.mimeType !== 'model/gltf-binary') {
        throw new Error('Queued timeout successor did not return a GLB artifact.');
      }
      const summary = summarizeGlb(artifact.content);
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
      createWebWorkerClientOptions({ createWorker, operationTimeout: normalRenderDuration }),
    );
    clients.current.add(client);

    try {
      await timeOutEvaluation(client, { files: { [blockingFile]: 'block' } });
      client.setOperationTimeout(normalRenderDuration);
      try {
        await projectCylinder(client);
        throw new Error('Blocked runtime accepted successor work instead of terminating.');
      } catch (error) {
        if (!isRuntimeTerminatedError(error) || error.causeKind !== 'operation-timeout') {
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
      <button
        type='button'
        disabled={cooperativeStatus === 'running'}
        onClick={() => {
          void runCooperativeTimeout();
        }}
      >
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

      <button
        type='button'
        disabled={hardStatus === 'running'}
        onClick={() => {
          void runHardTimeout();
        }}
      >
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
