/**
 * The page's parameters section (agent plugin UI blueprint W10, G22): the viewer's parameter form over the server's
 * `get_parameters` and `apply_parameter_operation`. An edit writes the entry's sidecar in the project, so Tau shows the
 * same value, and the page then shows the model again, rendered with it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { ParameterManifest } from '@taucad/parameters';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { Parameters } from '@taucad/viewer/parameters/parameters';
import type { HostBridge } from '#app/host-bridge.js';

/** What `get_parameters` answers, as far as the page reads it. */
type ParametersAnswer = Readonly<{
  status: 'resolved' | 'unresolved';
  manifest?: ParameterManifest;
  current?: Readonly<{
    identity: Readonly<{ manifestRevision: string }>;
    entry: Readonly<{
      activeGroup: string;
      groups: Readonly<Record<string, Readonly<{ values: Record<string, unknown> }>>>;
    }>;
  }>;
  diagnostics?: ReadonlyArray<Readonly<{ message: string }>>;
}>;

type Loaded =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unavailable'; message: string }>
  | Readonly<{
      kind: 'ready';
      manifest: ParameterManifest;
      revision: string;
      group: string;
      values: Record<string, unknown>;
    }>;

const units = { length: { displaySymbol: 'mm' } } as const;
const transientEdit = { kind: 'transient' } as const;

/** Milliseconds an edit waits for the next one before it is written. */
const writeDelay = 400;

/**
 * Read one entry's parameters.
 *
 * @param answer - What `get_parameters` returned.
 * @returns What the section shows.
 */
const loadedOf = (answer: unknown): Loaded => {
  const { status, manifest, current, diagnostics } = (answer ?? {}) as ParametersAnswer;
  if (status !== 'resolved' || manifest === undefined || current === undefined) {
    return { kind: 'unavailable', message: diagnostics?.[0]?.message ?? 'This model declares no parameters.' };
  }
  const group = current.entry.activeGroup;
  return {
    kind: 'ready',
    manifest,
    revision: current.identity.manifestRevision,
    group,
    values: { ...current.entry.groups[group]?.values },
  };
};

type ParametersSectionProps = Readonly<{
  bridge: HostBridge;
  /** The project file the shown model was rendered from. */
  sourceFile: string;
  /** Changes when the shown model does, so the section reads the parameters again. */
  modelKey: string;
  /** Show the model again once an edit is written. */
  onWritten: () => void;
}>;

/**
 * The form, or why there is none.
 *
 * @param props - The bridge, the shown file and what to do after a write.
 * @returns The section body.
 */
export function ParametersSection({
  bridge,
  sourceFile,
  modelKey,
  onWritten,
}: ParametersSectionProps): React.ReactNode {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [writeError, setWriteError] = useState<string | undefined>(undefined);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requests = useRef(0);

  useEffect(() => {
    const read = { isCurrent: true };
    // async-iife: bootstrap — the read answers whichever model is shown when it returns.
    void (async () => {
      try {
        const answer = await bridge.callTool('get_parameters', { targetFile: sourceFile });
        if (read.isCurrent) {
          setLoaded(loadedOf(answer));
        }
      } catch (error) {
        if (read.isCurrent) {
          setLoaded({ kind: 'unavailable', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
    return () => {
      read.isCurrent = false;
    };
  }, [bridge, sourceFile, modelKey]);

  useEffect(
    () => () => {
      clearTimeout(pending.current);
    },
    [],
  );

  const write = useCallback(
    (values: Record<string, unknown>) => {
      if (loaded.kind !== 'ready') {
        return;
      }
      setLoaded({ ...loaded, values });
      clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        requests.current += 1;
        const requestId = `page-${String(Date.now())}-${String(requests.current)}`;
        // async-iife: bootstrap — the timer has no caller; the section shows the outcome.
        void (async () => {
          try {
            const answer = (await bridge.callTool('apply_parameter_operation', {
              action: 'propose',
              targetFile: sourceFile,
              requestId,
              expected: { manifestRevision: loaded.revision },
              pressure: 'final',
              operation: { kind: 'replace-group-values', group: loaded.group, values },
            })) as { outcome?: { status?: string; message?: string } } | undefined;
            const outcome = answer?.outcome;
            if (outcome?.status === 'committed') {
              setWriteError(undefined);
              onWritten();
              return;
            }
            setWriteError(outcome?.message ?? `The edit was not written (${outcome?.status ?? 'no answer'}).`);
          } catch (error) {
            setWriteError(error instanceof Error ? error.message : String(error));
          }
        })();
      }, writeDelay);
    },
    [bridge, loaded, onWritten, sourceFile],
  );

  if (loaded.kind === 'loading') {
    return <p className='p-3 text-xs text-muted-foreground'>Reading parameters…</p>;
  }
  if (loaded.kind === 'unavailable') {
    return (
      <PanelEmptyState
        icon={SlidersHorizontal}
        title='No parameters'
        description={loaded.message}
        className='min-h-24'
      />
    );
  }
  const { manifest } = loaded;
  return (
    <div className='flex flex-col'>
      {writeError === undefined ? null : (
        <p role='alert' className='px-3 pt-2 text-xs text-destructive'>
          {writeError}
        </p>
      )}
      <Parameters
        parameters={loaded.values}
        defaultParameters={{ ...manifest.defaults }}
        jsonSchema={manifest.legacyProjection.status === 'usable' ? manifest.legacyProjection.schema : undefined}
        parameterManifest={manifest}
        parameterEdit={transientEdit}
        units={units}
        presentation='embedded'
        enableSearch={false}
        onParametersChange={write}
      />
    </div>
  );
}
