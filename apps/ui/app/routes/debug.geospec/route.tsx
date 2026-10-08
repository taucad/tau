import { useEffect, useMemo, useRef, useState } from 'react';
import type { Artifact } from '@taucad/runtime';
import { Button } from '@taucad/ui/components/button';
import { ModelViewer } from '#components/model-viewer.js';
import { pairedCaseVerdict } from '#routes/debug.geospec/paired-result.js';
import { ENV } from '#environment.config.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import {
  GeoSpecPerformanceService,
  availableMtPermits,
  catalogCasesForFixture,
  casesForFixture,
  loadFixtureBytes,
  loadPreview,
  mtExecution,
  runInput,
} from '#services/geospec-performance.js';
import type { PerformanceLabSelectionCase } from '#services/geospec-performance.js';
/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source import; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug route consumes the private benchmark catalog without adding a public API.
import {
  classifyPerformanceLabDifference,
  performanceLabFixtures,
} from '../../../../../packages/geospec-engine-native/bench/performance-lab.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only private fixture metadata.
import type { LabFixture } from '../../../../../packages/geospec-engine-native/bench/performance-lab.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only private benchmark result contract.
import type {
  PerformanceLabRunInput,
  PerformanceLabRunResult,
  PerformanceLabWasmExecution,
} from '../../../../../packages/geospec-engine/experiments/performance-lab/performance-lab-runner.js';
/* oxlint-enable no-restricted-imports */

const engines = ['combined-st', 'combined-mt', 'native-desktop'] as const;
const label = {
  'combined-st': 'Combined WASM ST',
  'combined-mt': 'Combined WASM MT',
  'native-desktop': 'Desktop native',
};
type Engine = (typeof engines)[number];
type WasmMode = 'st' | 'mt' | 'compare';
const stExecution: PerformanceLabWasmExecution = { variant: 'st' };
type Cell = {
  result: PerformanceLabRunResult;
  uiWall: number;
  requestedCache: PerformanceLabRunInput['cache'];
  run: number;
  engineOrder: readonly Engine[];
};
const key = (fixtureId: string, engine: Engine, mt?: Extract<PerformanceLabWasmExecution, { variant: 'mt' }>): string =>
  engine === 'combined-mt'
    ? `${fixtureId}/${engine}/${mt?.permits ?? ''}/${mt?.receipt ?? ''}`
    : `${fixtureId}/${engine}`;
const duration = (value: number | undefined): string => (value === undefined ? '—' : `${value.toFixed(1)} ms`);
const spread = (values: readonly number[]): string => {
  if (values.length === 0) {
    return '—';
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle];
  return `${duration(median)} median (${duration(sorted[0])}–${duration(sorted.at(-1))})`;
};
const nativeAvailable = (): boolean => Boolean(desktopBridge()?.geoSpecPerformance);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const runnableFixtures = performanceLabFixtures.filter(({ id }) => casesForFixture(id).length > 0);

function GeoSpecLab(): React.JSX.Element {
  const [fixtureId, setFixtureId] = useState(runnableFixtures[0]?.id ?? '');
  const [repeats, setRepeats] = useState(1);
  const [cache, setCache] = useState<PerformanceLabRunInput['cache']>('cold');
  const [wasmMode, setWasmMode] = useState<WasmMode>('st');
  const mtPermits = availableMtPermits();
  const [permits, setPermits] = useState(mtPermits[0] ?? 1);
  const [mounted, setMounted] = useState(false);
  const mt = mounted ? mtExecution(permits) : undefined;
  const [verifiedMtReceipt, setVerifiedMtReceipt] = useState<string>();
  const mtReady = mt !== undefined && verifiedMtReceipt === mt.receipt;
  const [mtStatus, setMtStatus] = useState('No qualified MT assets in this build.');
  const [includeScale, setIncludeScale] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof loadPreview>>>();
  const previewArtifact = useMemo<Artifact | undefined>(
    () => preview && { mimeType: 'model/gltf-binary', content: preview.content },
    [preview],
  );
  const [previewStatus, setPreviewStatus] = useState('No preview available for this fixture.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string>();
  const [cells, setCells] = useState<Record<string, Cell[]>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const service = useRef<GeoSpecPerformanceService | undefined>(undefined);
  const runSequence = useRef(0);
  const fixture = runnableFixtures.find(({ id }) => id === fixtureId) ?? runnableFixtures[0];
  const cases = useMemo(() => casesForFixture(fixtureId), [fixtureId]);
  const desktop = nativeAvailable();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mt) {
      setVerifiedMtReceipt(undefined);
      setMtStatus('No qualified MT assets in this build.');
      return;
    }
    let active = true;
    setVerifiedMtReceipt(undefined);
    setMtStatus('Checking MT receipt…');
    const check = async (): Promise<void> => {
      try {
        const response = await fetch(mt.receipt);
        if (!response.ok) {
          throw new Error(`MT receipt unavailable: HTTP ${response.status}.`);
        }
        const receipt: unknown = await response.json();
        if (
          !record(receipt) ||
          receipt['schema'] !== 'geospec-mixed-mt-assets-v1' ||
          receipt['permits'] !== mt.permits
        ) {
          throw new Error('Served MT receipt does not match the selected permit budget.');
        }
        if (active) {
          setVerifiedMtReceipt(mt.receipt);
          setMtStatus(`Qualified MT receipt available · ${mt.permits} permits.`);
        }
      } catch (error) {
        if (active) {
          setMtStatus(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, [mt?.receipt, mt?.permits]);

  useEffect(() => {
    service.current = new GeoSpecPerformanceService();
    return () => {
      service.current?.close();
      service.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (!fixture) {
      return;
    }
    let active = true;
    setPreview(undefined);
    setPreviewStatus('Loading preview…');
    const updatePreview = async (): Promise<void> => {
      try {
        const geometry = await loadPreview(fixture);
        if (!active) {
          return;
        }
        setPreview(geometry);
        setPreviewStatus(
          geometry ? '' : (fixture.previewUnavailableReason ?? 'No pinned GLB preview for this source.'),
        );
      } catch (error) {
        if (active) {
          setPreviewStatus(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void updatePreview();
    return () => {
      active = false;
    };
  }, [fixture]);

  const run = async (
    selection: ReadonlyArray<{
      fixture: LabFixture;
      cases: readonly PerformanceLabSelectionCase[];
    }>,
  ): Promise<void> => {
    if (busy || !service.current) {
      return;
    }
    if (wasmMode !== 'st' && !mtReady) {
      setError(mtStatus);
      return;
    }
    setBusy(true);
    setError(undefined);
    const runNumber = runSequence.current++;
    const selectedCombined: Engine[] =
      wasmMode === 'compare' ? ['combined-st', 'combined-mt'] : [wasmMode === 'mt' ? 'combined-mt' : 'combined-st'];
    const available: Engine[] = [...selectedCombined, ...(desktop ? (['native-desktop'] as Engine[]) : [])];
    const offset = runNumber % available.length;
    const engineOrder =
      wasmMode === 'compare' ? available : [...available.slice(offset), ...available.slice(0, offset)];
    try {
      for (const item of selection) {
        // oxlint-disable-next-line no-await-in-loop -- Fixture cells are intentionally serialized to avoid benchmark contention.
        const bytes = await loadFixtureBytes(item.fixture);
        for (const engine of engineOrder) {
          setProgress(`${item.fixture.label} · ${label[engine]}`);
          const cellKey = key(item.fixture.id, engine, mt);
          setCellErrors((previous) => {
            const next = { ...previous };
            for (const current of item.cases) {
              delete next[`${cellKey}/${current.id}`];
            }
            return next;
          });
          const wallAt = performance.now();
          try {
            // oxlint-disable-next-line no-await-in-loop -- Measure only one engine cell at a time.
            if (engine === 'combined-mt' && !mt) {
              throw new Error('No qualified MT package assets are available for this permit budget.');
            }
            // oxlint-disable-next-line no-await-in-loop -- Comparison cells must run sequentially on identical bytes.
            const result = await service.current.run(
              runInput({
                engine: engine === 'combined-st' || engine === 'combined-mt' ? 'combined-wasm' : engine,
                fixture: item.fixture,
                bytes,
                cases: item.cases,
                repeats,
                cache,
                ...(engine === 'combined-st' ? { execution: stExecution } : {}),
                ...(engine === 'combined-mt' ? { execution: mt } : {}),
              }),
            );
            const uiWall = performance.now() - wallAt;
            setCells((previous) => ({
              ...previous,
              [cellKey]: [
                ...(previous[cellKey] ?? []),
                {
                  result,
                  uiWall,
                  requestedCache: cache,
                  run: runNumber + 1,
                  engineOrder,
                },
              ],
            }));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setCellErrors((previous) => ({
              ...previous,
              ...Object.fromEntries(item.cases.map((current) => [`${cellKey}/${current.id}`, message])),
            }));
            setError(`${item.fixture.label} · ${label[engine]}: ${message}`);
          }
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const download = (): void => {
    const bytes = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            fixtureCatalog: performanceLabFixtures,
            cells,
            cellErrors,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(bytes);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'geospec-performance-lab.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!fixture) {
    return <main className='p-6'>No performance lab fixtures are available.</main>;
  }
  return (
    <main className='min-h-screen bg-background p-4 text-foreground md:p-6'>
      <div className='mx-auto max-w-screen-2xl space-y-6'>
        <header className='space-y-1'>
          <p className='font-mono text-xs text-muted-foreground'>TAU / DEBUG / GEOSPEC</p>
          <h1 className='text-2xl font-semibold'>GeoSpec performance lab</h1>
          <p className='text-sm text-muted-foreground'>
            Actual engine results, one fixture admission per run. Preview loading is outside engine timings.
          </p>
        </header>
        <div className='flex flex-wrap items-end gap-3 border-b pb-4'>
          <label className='grid gap-1 text-sm'>
            Fixture
            <select
              className='h-9 rounded-md border bg-background px-2'
              value={fixtureId}
              disabled={busy}
              onChange={(event) => {
                setFixtureId(event.target.value);
              }}
            >
              {runnableFixtures.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className='grid gap-1 text-sm'>
            Repeats
            <input
              className='h-9 w-20 rounded-md border bg-background px-2'
              type='number'
              min={1}
              max={20}
              value={repeats}
              disabled={busy}
              onChange={(event) => {
                setRepeats(Math.max(1, Math.min(20, Number(event.target.value) || 1)));
              }}
            />
          </label>
          <label className='grid gap-1 text-sm'>
            Module condition
            <select
              className='h-9 rounded-md border bg-background px-2'
              value={cache}
              disabled={busy}
              onChange={(event) => {
                setCache(event.target.value as PerformanceLabRunInput['cache']);
              }}
            >
              <option value='cold'>Cold request</option>
              <option value='warm'>Reuse module</option>
            </select>
          </label>
          <label className='grid gap-1 text-sm'>
            Combined WASM
            <select
              className='h-9 rounded-md border bg-background px-2'
              value={wasmMode}
              disabled={busy}
              onChange={(event) => {
                setWasmMode(event.target.value as WasmMode);
              }}
            >
              <option value='st'>ST</option>
              <option value='mt' disabled={mtPermits.length === 0}>
                MT
              </option>
              <option value='compare' disabled={mtPermits.length === 0}>
                ST then MT
              </option>
            </select>
          </label>
          <label className='grid gap-1 text-sm'>
            MT permits (caller included)
            <select
              className='h-9 rounded-md border bg-background px-2'
              value={permits}
              disabled={busy || mtPermits.length === 0}
              onChange={(event) => {
                setPermits(Number(event.target.value));
              }}
            >
              {mtPermits.length === 0 ? (
                <option value={1}>Unavailable</option>
              ) : (
                mtPermits.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))
              )}
            </select>
          </label>
          <p className='text-xs text-muted-foreground' role='status'>
            {mtStatus}
          </p>
          <label className='flex h-9 items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={includeScale}
              disabled={busy}
              onChange={(event) => {
                setIncludeScale(event.target.checked);
              }}
            />
            Include scale fixtures in catalog
          </label>
          <Button
            disabled={busy || cases.length === 0 || (wasmMode !== 'st' && !mtReady)}
            onClick={async () => {
              await run([{ fixture, cases }]);
            }}
          >
            Run fixture
          </Button>
          <Button
            variant='outline'
            disabled={busy || (wasmMode !== 'st' && !mtReady)}
            onClick={async () => {
              await run(
                runnableFixtures
                  .map((entry) => ({
                    fixture: entry,
                    cases: catalogCasesForFixture(entry.id, includeScale),
                  }))
                  .filter((entry) => entry.cases.length > 0),
              );
            }}
          >
            Run catalog
          </Button>
          <Button variant='outline' disabled={busy || Object.keys(cells).length === 0} onClick={download}>
            Download raw JSON
          </Button>
        </div>
        <section className='grid gap-4 xl:grid-cols-4'>
          <div className='space-y-2 xl:col-span-1'>
            <h2 className='text-lg font-medium'>{fixture.label}</h2>
            <p className='font-mono text-xs break-all text-muted-foreground'>
              {fixture.format.toUpperCase()} · source unit {fixture.sourceUnit} · {fixture.bytes.toLocaleString()} bytes
              · {fixture.source.kind} · {fixture.source.path} · SHA-256 {fixture.sha256}
            </p>
            <div className='h-80 overflow-hidden rounded-md border bg-card'>
              {preview ? (
                <ModelViewer
                  artifact={previewArtifact}
                  artifactHash={preview.hash}
                  enablePan
                  enableZoom
                  graphicsOptions={{ enableGrid: true, enableAxes: true }}
                />
              ) : (
                <div
                  className='flex size-full items-center justify-center p-4 text-sm text-muted-foreground'
                  role='status'
                >
                  {previewStatus}
                </div>
              )}
            </div>
          </div>
          <div className='min-w-0 space-y-2 xl:col-span-3'>
            <h2 className='text-lg font-medium'>Matcher comparison</h2>
            <p className='text-xs text-muted-foreground'>
              Startup includes module import and eager initialization. Admission is shared by every selected matcher; UI
              wall includes worker transport.
            </p>
            <div className='overflow-x-auto rounded-md border'>
              <table className='w-full min-w-[52rem] border-collapse text-left text-sm'>
                <thead className='bg-muted/40'>
                  <tr>
                    <th scope='col' className='p-2'>
                      Matcher
                    </th>
                    {engines.map((engine) => (
                      <th scope='col' className='p-2' key={engine}>
                        {label[engine]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((entry) => (
                    <tr key={entry.id} className='border-t align-top'>
                      <th scope='row' className='p-2 font-normal'>
                        <div className='font-medium'>{'matcher' in entry ? entry.matcher : entry.capability}</div>
                        <div className='font-mono text-xs text-muted-foreground'>{entry.id}</div>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={busy}
                          onClick={async () => {
                            await run([{ fixture, cases: [entry] }]);
                          }}
                        >
                          Run matcher
                        </Button>
                      </th>
                      {engines.map((engine) => {
                        const cellKey = key(fixture.id, engine, mt);
                        const cell = cells[cellKey]?.findLast((candidate) =>
                          candidate.result.perCase.some((row) => row.caseId === entry.id),
                        );
                        const cellError = cellErrors[`${cellKey}/${entry.id}`];
                        const rows = cell?.result.perCase.filter((row) => row.caseId === entry.id) ?? [];
                        const latest = rows.at(-1);
                        const parity =
                          engine === 'combined-mt' && cell
                            ? pairedCaseVerdict(cell, cells[key(fixture.id, 'combined-st')], entry.id)
                            : undefined;
                        const catalogEngine =
                          engine === 'combined-st' || engine === 'combined-mt' ? 'combined-wasm' : engine;
                        const difference = latest
                          ? classifyPerformanceLabDifference({
                              engine: catalogEngine,
                              ...latest,
                            })
                          : undefined;
                        const hasUnexpectedMismatch = rows.some(
                          (row) =>
                            row.status !== 'unsupported' &&
                            row.expectedStatus !== 'unverified' &&
                            row.status !== row.expectedStatus &&
                            !classifyPerformanceLabDifference({
                              engine: catalogEngine,
                              ...row,
                            }),
                        );
                        return (
                          <td key={engine} className='p-2'>
                            {engine === 'native-desktop' && !desktop ? (
                              <span className='text-muted-foreground'>Unavailable in browser</span>
                            ) : engine === 'combined-mt' && !mt ? (
                              <span className='text-muted-foreground'>No qualified MT assets</span>
                            ) : cellError ? (
                              <span role='alert' className='text-feature'>
                                Error: {cellError}
                              </span>
                            ) : latest ? (
                              <>
                                <strong className={hasUnexpectedMismatch ? 'text-feature' : 'text-foreground'}>
                                  {[...new Set(rows.map(({ status }) => status))].join(' / ')}
                                </strong>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  {rows.length} sample
                                  {rows.length === 1 ? '' : 's'} · evaluate{' '}
                                  {spread(rows.map(({ evaluation }) => evaluation))}
                                </div>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  Expected {latest.expectedStatus}
                                  {latest.status === 'unsupported'
                                    ? ' · unsupported'
                                    : hasUnexpectedMismatch
                                      ? ' · unexpected mismatch'
                                      : ''}
                                </div>
                                {difference ? (
                                  <p className='text-xs text-muted-foreground'>{difference.reason}</p>
                                ) : null}
                                <div className='font-mono text-xs text-muted-foreground'>
                                  {cell?.result.execution
                                    ? `${cell.result.execution.variant.toUpperCase()}${cell.result.execution.variant === 'mt' ? ` · ${cell.result.execution.permits} permits` : ''} · `
                                    : ''}
                                  first {duration(cell?.result.timing.firstResult ?? undefined)} · startup{' '}
                                  {duration(cell?.result.timing.startup)} · admit{' '}
                                  {duration(cell?.result.timing.admission)} · engine{' '}
                                  {duration(cell?.result.timing.total)} · UI {duration(cell?.uiWall)}
                                </div>
                                {parity ? (
                                  <div className='font-mono text-xs text-muted-foreground'>
                                    ST/MT:{' '}
                                    {parity === 'same'
                                      ? 'same status and canonical result across repeats'
                                      : parity === 'different'
                                        ? 'different status or canonical result'
                                        : parity === 'unpaired'
                                          ? 'no paired ST result'
                                          : 'unsupported case; no parity verdict'}
                                  </div>
                                ) : null}
                                <div className='font-mono text-xs text-muted-foreground'>
                                  {cell?.result.backend} · {latest.numericProfile ?? 'profile unavailable'} · actual{' '}
                                  {cell?.result.cache} · requested {cell?.requestedCache}
                                </div>
                                {cell?.result.execution?.variant === 'mt' ? (
                                  <div className='font-mono text-xs break-all text-muted-foreground'>
                                    Receipt {cell.result.execution.receipt}
                                  </div>
                                ) : null}
                                {cell?.result.execution ? (
                                  <div className='font-mono text-xs text-muted-foreground'>
                                    Memory unavailable (no scoped cell measurement)
                                  </div>
                                ) : null}
                                {latest.diagnostics.length > 0 ? (
                                  <details className='mt-1'>
                                    <summary>Diagnostics</summary>
                                    <pre className='text-xs break-all whitespace-pre-wrap'>
                                      {JSON.stringify(latest.diagnostics, null, 2)}
                                    </pre>
                                  </details>
                                ) : null}
                              </>
                            ) : (
                              <span className='text-muted-foreground'>Not run</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <div aria-live='polite' role='status' className='text-sm'>
          {busy ? `Running ${progress}…` : ''}
        </div>
        {error ? (
          <p role='alert' className='text-sm text-feature'>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function GeoSpecDebugRoute(): React.JSX.Element {
  if (!ENV.TAU_DEBUG) {
    return <main className='p-6'>Not found</main>;
  }
  return <GeoSpecLab />;
}
