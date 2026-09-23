import { useEffect, useMemo, useRef, useState } from 'react';
import type { Geometry } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { ModelViewer } from '#components/model-viewer.js';
import { ENV } from '#environment.config.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import {
  GeoSpecPerformanceService,
  catalogCasesForFixture,
  casesForFixture,
  loadFixtureBytes,
  loadPreview,
  runInput,
} from '#services/geospec-performance.js';
import type { PerformanceLabSelectionCase } from '#services/geospec-performance.js';
/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source import; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug route consumes the private benchmark catalog without adding a public API.
import { performanceLabFixtures } from '../../../../../packages/geospec-engine-native/bench/performance-lab.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only private fixture metadata.
import type { LabFixture } from '../../../../../packages/geospec-engine-native/bench/performance-lab.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only private benchmark result contract.
import type {
  PerformanceLabRunInput,
  PerformanceLabRunResult,
} from '../../../../../packages/geospec-engine-native/bench/performance-lab-runner.js';
/* oxlint-enable no-restricted-imports */

const engines = ['legacy-wasm', 'combined-wasm', 'native-desktop'] as const;
const label = {
  'legacy-wasm': 'Legacy WASM',
  'combined-wasm': 'Combined WASM',
  'native-desktop': 'Desktop native',
};
type Engine = (typeof engines)[number];
type Cell = {
  result: PerformanceLabRunResult;
  uiWall: number;
  requestedCache: PerformanceLabRunInput['cache'];
  run: number;
  engineOrder: readonly Engine[];
};
const key = (fixtureId: string, engine: Engine): string => `${fixtureId}/${engine}`;
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
const runnableFixtures = performanceLabFixtures.filter(({ id }) => casesForFixture(id).length > 0);

function GeoSpecLab(): React.JSX.Element {
  const [fixtureId, setFixtureId] = useState(runnableFixtures[0]?.id ?? '');
  const [repeats, setRepeats] = useState(1);
  const [cache, setCache] = useState<PerformanceLabRunInput['cache']>('cold');
  const [includeScale, setIncludeScale] = useState(false);
  const [preview, setPreview] = useState<Geometry>();
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
    setBusy(true);
    setError(undefined);
    const runNumber = runSequence.current++;
    const available = engines.filter((engine) => engine !== 'native-desktop' || desktop);
    const offset = runNumber % available.length;
    const engineOrder = [...available.slice(offset), ...available.slice(0, offset)];
    try {
      for (const item of selection) {
        // oxlint-disable-next-line no-await-in-loop -- Fixture cells are intentionally serialized to avoid benchmark contention.
        const bytes = await loadFixtureBytes(item.fixture);
        for (const engine of engineOrder) {
          setProgress(`${item.fixture.label} · ${label[engine]}`);
          const cellKey = key(item.fixture.id, engine);
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
            const result = await service.current.run(
              runInput({ engine, fixture: item.fixture, bytes, cases: item.cases, repeats, cache }),
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
            disabled={busy || cases.length === 0}
            onClick={async () => {
              await run([{ fixture, cases }]);
            }}
          >
            Run fixture
          </Button>
          <Button
            variant='outline'
            disabled={busy}
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
                  geometry={preview}
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
              Startup includes module import and eager initialization. Legacy kernels initialize lazily during admission
              or evaluation, so compare engine and UI totals across engines. Admission is shared by every selected
              matcher; UI wall includes worker transport.
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
                        const cell = cells[key(fixture.id, engine)]?.findLast((candidate) =>
                          candidate.result.perCase.some((row) => row.caseId === entry.id),
                        );
                        const cellError = cellErrors[`${key(fixture.id, engine)}/${entry.id}`];
                        const rows = cell?.result.perCase.filter((row) => row.caseId === entry.id) ?? [];
                        const latest = rows.at(-1);
                        return (
                          <td key={engine} className='p-2'>
                            {engine === 'native-desktop' && !desktop ? (
                              <span className='text-muted-foreground'>Unavailable in browser</span>
                            ) : cellError ? (
                              <span role='alert' className='text-destructive'>
                                Error: {cellError}
                              </span>
                            ) : latest ? (
                              <>
                                <strong className={latest.status === 'passed' ? 'text-foreground' : 'text-destructive'}>
                                  {[...new Set(rows.map(({ status }) => status))].join(' / ')}
                                </strong>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  {rows.length} sample{rows.length === 1 ? '' : 's'} · evaluate{' '}
                                  {spread(rows.map(({ evaluation }) => evaluation))}
                                </div>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  Expected {latest.expectedStatus}
                                  {latest.expectedStatus !== 'unverified' && latest.status !== latest.expectedStatus
                                    ? ' · mismatch'
                                    : ''}
                                </div>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  startup {duration(cell?.result.timing.startup)} · admit{' '}
                                  {duration(cell?.result.timing.admission)} · engine{' '}
                                  {duration(cell?.result.timing.total)} · UI {duration(cell?.uiWall)}
                                </div>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  {cell?.result.backend} · {latest.numericProfile ?? 'profile unavailable'} · actual{' '}
                                  {cell?.result.cache} · requested {cell?.requestedCache}
                                </div>
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
          <p role='alert' className='text-sm text-destructive'>
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
