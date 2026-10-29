import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useLoaderData } from 'react-router';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { randomUuid } from '@taucad/utils/id';
import { Button } from '@taucad/ui/components/button';
import { ENV } from '#environment.config.js';
import { PageHeader } from '#components/layout/page-header.js';
import { FloatingPanel, FloatingPanelContent } from '#components/ui/floating-panel.js';
import { readApiRequestId, recordApiRequestId } from '#lib/api-request-id.js';
import { reportUiError, startErrorReporting } from '#lib/error-reporting.js';
import { isObservabilityHarnessEnabled } from '#lib/observability-harness-context.js';
import {
  startObservabilityMemoryPressure,
  triggerObservabilityWorkerError,
  triggerObservabilityKernelTermination,
} from '#lib/observability-harness-triggers.js';

export const meta: MetaFunction = () => [{ title: 'Observability harness · Tau' }];

export const loader = ({ request }: LoaderFunctionArgs): { trigger: string | undefined; hasDsn: boolean } => {
  if (!isObservabilityHarnessEnabled()) {
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Router turns thrown responses into HTTP statuses.
    throw new Response('Not found', { status: 404 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get('trigger') === 'ssr-loader') {
    throw new Error('Observability harness SSR loader error');
  }
  return { trigger: url.searchParams.get('trigger') ?? undefined, hasDsn: Boolean(ENV.SENTRY_DSN) };
};

const triggers = [
  ['uncaught', 'Uncaught error'],
  ['rejection', 'Unhandled rejection'],
  ['boundary', 'FloatingPanel boundary'],
  ['hydration', 'Hydration mismatch'],
  ['worker', 'Worker error'],
  ['kernel-termination', 'Kernel worker termination'],
  ['ssr-loader', 'SSR loader error'],
  ['revision', 'Revision failure'],
  ['api-failure', 'API failure'],
  ['direct', 'Direct-path send'],
  ['memory-pressure', 'Memory pressure'],
] as const;

/**
 * The API path the harness calls to fail (SB13, A12). Any failed answer records its `request-id` on the reported
 * error; the `tau-api` side of A12 needs the staging API to answer this path with a reported server error.
 */
const observabilityApiFailurePath = '/v1/__debug/observability/failure';

/** Call the API, and report the failure the way an API client does: the error carries the response's request id. */
const triggerObservabilityApiFailure = async (status: (message: string) => void): Promise<void> => {
  const response = await fetch(`${ENV.TAU_API_URL.replace(/\/$/u, '')}${observabilityApiFailurePath}`, {
    credentials: 'omit',
  });
  if (response.ok) {
    status('The API answered without failing; nothing was reported.');
    return;
  }
  const requestId = readApiRequestId(response);
  await reportUiError(
    recordApiRequestId(new Error(`Observability harness API failure (HTTP ${String(response.status)})`), response),
  );
  status(`API failure reported (HTTP ${String(response.status)}, request id ${requestId ?? 'not readable'}).`);
};

const BoundaryFailure = (): JSX.Element => {
  throw new Error('Observability harness FloatingPanel boundary error');
};

const navigateToTrigger = (trigger: string): void => {
  const url = new URL(globalThis.location.href);
  url.searchParams.set('trigger', trigger);
  globalThis.location.assign(url);
};

/** Exercise the browser restore owner on a disposable in-memory project, never a user's filesystem. */
const triggerObservabilityRevisionFailure = async (status: (message: string) => void): Promise<void> => {
  const { getRevisionClient } = await import('#hooks/use-revision-status.js');
  const worker = new Worker(new URL('../../lib/observability-harness-revision.worker.ts', import.meta.url), {
    type: 'module',
  });
  const projectId = `observability-${randomUuid()}`;
  const client = getRevisionClient({ projectId, worker });
  const failed = Promise.withResolvers<void>();
  const unsubscribe = client.subscribeToasts((toast) => {
    if (toast.type === 'error') {
      status(`Revision failure observed: ${toast.subject}`);
      failed.resolve();
    }
  });
  const deadline = globalThis.setTimeout(() => {
    failed.reject(new Error('Revision restore did not report a failure within 15 seconds.'));
    client.close();
  }, 15_000);
  try {
    client.open();
    // The root exists before the restore command; this read never fetches a remote.
    const restore = async (): Promise<void> => {
      await client.log();
      client.send({ command: 'restore', revisionId: '0000000000000000000000000000000000000000' });
    };
    await Promise.all([restore(), failed.promise]);
  } finally {
    globalThis.clearTimeout(deadline);
    unsubscribe();
    client.close();
    worker.terminate();
  }
};

export default function ObservabilityHarness(): JSX.Element {
  const { trigger, hasDsn } = useLoaderData<typeof loader>();
  const [boundary, setBoundary] = useState(false);
  const [status, setStatus] = useState('Ready. Each control triggers one failure; delivery is verified separately.');
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const started = useRef(false);
  const run = useCallback(async (selected: string): Promise<void> => {
    if (!isObservabilityHarnessEnabled()) {
      return;
    }
    cleanup.current?.();
    cleanup.current = undefined;
    setStatus(`Triggering ${selected}.`);
    if (selected === 'memory-pressure') {
      cleanup.current = startObservabilityMemoryPressure(setStatus);
      return;
    }
    await startErrorReporting();
    switch (selected) {
      case 'uncaught': {
        globalThis.setTimeout(() => {
          throw new Error('Observability harness uncaught error');
        }, 0);
        break;
      }
      case 'rejection': {
        // Deliberately leave this rejection unhandled so the installed global handler owns it.
        void Promise.reject(new Error('Observability harness unhandled rejection'));
        break;
      }
      case 'boundary': {
        setBoundary(true);
        break;
      }
      case 'worker': {
        cleanup.current = triggerObservabilityWorkerError(setStatus);
        break;
      }
      case 'kernel-termination': {
        await triggerObservabilityKernelTermination(setStatus);
        break;
      }
      case 'revision': {
        await triggerObservabilityRevisionFailure(setStatus);
        break;
      }
      case 'api-failure': {
        await triggerObservabilityApiFailure(setStatus);
        break;
      }
      case 'direct': {
        await reportUiError(new Error('Observability harness direct-path error'));
        setStatus('Direct-path report attempted with SDK loading disabled.');
        break;
      }
      default: {
        break;
      }
    }
  }, []);
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    // Memory pressure always needs a click: retaining its query after a kill must not create a kill loop.
    if (trigger !== undefined && !['hydration', 'ssr-loader', 'memory-pressure'].includes(trigger)) {
      const triggerOnce = async (): Promise<void> => {
        try {
          await run(trigger);
        } catch (error) {
          setStatus(`Trigger finished with an error: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      // async-iife: bootstrap -- one query-selected failure per document mount.
      void triggerOnce();
    }
  }, [run, trigger]);
  useEffect(
    () => () => {
      cleanup.current?.();
    },
    [],
  );
  return (
    <div className='container mx-auto space-y-4 px-4 pt-5 pb-8'>
      <PageHeader title='Observability harness' />
      <p>Staging failure controls. Memory pressure can kill this tab; use a disposable session.</p>
      {!hasDsn && <p role='alert'>Sentry is not configured. Triggers run, but Sentry delivery cannot be verified.</p>}
      <div className='flex flex-wrap gap-2'>
        {triggers.map(([value, label]) => (
          <Button
            key={value}
            variant='outline'
            onClick={() => {
              if (value === 'memory-pressure') {
                void run(value);
              } else {
                navigateToTrigger(value);
              }
            }}
          >
            {label}
          </Button>
        ))}
        <Button
          variant='outline'
          onClick={() => {
            cleanup.current?.();
            cleanup.current = undefined;
            setStatus('Stopped. Memory allocations released.');
          }}
        >
          Stop memory pressure
        </Button>
      </div>
      <p role='status'>{status}</p>
      {boundary && (
        <FloatingPanel>
          <FloatingPanelContent>
            <BoundaryFailure />
          </FloatingPanelContent>
        </FloatingPanel>
      )}
    </div>
  );
}
