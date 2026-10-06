// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCommandContext } from 'vitest/node';
import { mock } from 'vitest-mock-extended';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, CDPSession } from 'playwright';
import { transform } from 'esbuild';
// oxlint-disable-next-line no-restricted-imports -- Real Node worker fixture uses the same maintained origin as its target owner.
import { testBaseURL } from './base-url.ts';
// oxlint-disable-next-line no-restricted-imports -- Node regression executes the actual config-time CDP drain owner.
import { writeBrowserTraceStream } from './browser-trace-stream.ts';
/* oxlint-disable no-restricted-imports -- Real Node/CDP controls drive the existing config-time target/profile/diagnostics owners. */
import {
  uiOpenTarget,
  uiCloseTarget,
  uiCpuProfile,
  uiCaptureTargetDiagnostics,
  uiEvaluateTarget,
  uiScalePresentationProbe,
} from './browser-command.ts';
/* oxlint-enable no-restricted-imports */

let directory: string;
let tracePath: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-trace-stream-'));
  tracePath = join(directory, 'capture');
});

describe('warehouse failure CPU observation through actual Chromium', () => {
  let browser: Browser;
  let carrier: BrowserContext;
  let owned: BrowserContext;
  let context: BrowserCommandContext;
  let recording: CDPSession | undefined;
  let targetClosed = false;
  let closedTraceCleanupExpected = true;
  let pendingDiagnostics: Promise<unknown> | undefined;
  const artifactDirectory = (): string =>
    resolve('out/test-results/vitest-browser/apps/ui-e2e/test-output', context.sessionId);

  beforeAll(async () => {
    browser = await chromium.launch({
      channel: process.env['TAU_E2E_BROWSER_CHANNEL'] ?? 'chrome',
      headless: true,
      args: ['--enable-automation'],
    });
  });
  afterAll(async () => {
    await browser.close();
  });
  beforeEach(async () => {
    recording = undefined;
    pendingDiagnostics = undefined;
    targetClosed = false;
    closedTraceCleanupExpected = true;
    carrier = await browser.newContext();
    // Mock initialization recursively proxies object fields; attach the real cyclic browser context afterward.
    context = Object.assign(mock<BrowserCommandContext>(), {
      sessionId: basename(directory),
      testPath: resolve('apps/ui-e2e/src/parts-assemblies-scale.spec.ts'),
      provider: mock<BrowserCommandContext['provider']>({ name: 'playwright' }),
      context: carrier,
    });
    await uiOpenTarget(context);
    const targetContext = browser.contexts().find((candidate) => candidate !== carrier);
    if (targetContext === undefined) {
      throw new Error('Actual target owner did not create its Chromium context.');
    }
    owned = targetContext;
    const acquire = owned.newCDPSession.bind(owned);
    vi.spyOn(owned, 'newCDPSession').mockImplementation(async (page) => {
      recording = await acquire(page);
      return recording;
    });
  });
  afterEach(async () => {
    if (pendingDiagnostics !== undefined) {
      await Promise.allSettled([pendingDiagnostics]);
    }
    try {
      if (targetClosed && closedTraceCleanupExpected) {
        // This expectation still runs if an earlier assertion fails after the intentional actual close.
        const cleanup: unknown = uiCloseTarget(context);
        await expect(cleanup).rejects.toMatchObject({
          name: 'AggregateError',
          message: 'UI E2E target cleanup failed.',
        });
        await expect(cleanup).rejects.toHaveProperty('errors.length', 1);
        await expect(cleanup).rejects.toHaveProperty(
          'errors.0.message',
          expect.stringContaining('tracing.stop: Target page, context or browser has been closed'),
        );
      } else {
        await uiCloseTarget(context);
      }
    } finally {
      await carrier.close();
      await rm(artifactDirectory(), { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('should persist a recovery evaluation larger than the Vitest WebSocket limit without returning its body', async () => {
    const page = owned.pages().at(0);
    if (!page) {
      throw new Error('Actual preparation page is unavailable.');
    }
    const evidence = {
      identity: {
        root: 'checked-root',
        candidateSceneId: 'candidate-1',
        presentationRevision: 1,
        unitId: 'unit-1',
        poseRevision: 2,
        viewportActorSessionId: 'viewport-1',
        backend: 'webgl',
      },
      inventory: 'x'.repeat(100 * 1024 * 1024),
    };
    const receipt = await uiEvaluateTarget(
      context,
      `() => ({ identity: ${JSON.stringify(evidence.identity)}, inventory: 'x'.repeat(100 * 1024 * 1024) })`,
      undefined,
      undefined,
      's15-webgl-warehouse-recovery-before.json',
    );
    expect(receipt).toMatchObject({ identity: evidence.identity });
    if (typeof receipt !== 'object' || receipt === null || !('path' in receipt) || typeof receipt.path !== 'string') {
      throw new TypeError('Recovery artifact receipt has no path.');
    }
    const stored = await readFile(receipt.path);
    const original = Buffer.from(JSON.stringify(evidence, undefined, 2));
    expect(stored.byteLength).toBeGreaterThan(100 * 1024 * 1024);
    expect(stored.equals(original)).toBe(true);
    expect(receipt).toMatchObject({
      byteLength: stored.byteLength,
      sha256: createHash('sha256').update(stored).digest('hex'),
    });
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThan(1024);
    const reconstructed = JSON.parse(stored.toString('utf8')) as typeof evidence;
    expect(reconstructed.identity).toEqual(evidence.identity);
    expect(reconstructed.inventory).toHaveLength(evidence.inventory.length);
  }, 30_000);

  it('should preserve evaluation rejection and refuse an invalid recovery artifact name', async () => {
    const page = owned.pages().at(0);
    if (!page) {
      throw new Error('Actual preparation page is unavailable.');
    }
    const error = new Error('Current recovery subject retired.');
    vi.spyOn(page, 'evaluate').mockRejectedValueOnce(error);
    await expect(
      uiEvaluateTarget(context, '() => evidence', undefined, undefined, 's15-webgl-warehouse-recovery-before.json'),
    ).rejects.toBe(error);
    await expect(
      readFile(resolve(artifactDirectory(), 's15-webgl-warehouse-recovery-before.json')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(uiEvaluateTarget(context, '() => evidence', undefined, undefined, '../escape.json')).rejects.toThrow(
      'Invalid warehouse recovery artifact name.',
    );
  });

  type PreparationWorkerKind = 'current' | 'multiple' | 'foreign-name' | 'foreign-script';
  const prepareWorker = async (
    kind: PreparationWorkerKind = 'current',
    measureCount = 1,
    options: { reusePage?: boolean; filenameIndex?: 1 | 2; malformed?: boolean } = {},
  ) => {
    const page = owned.pages().at(0);
    if (page === undefined) {
      throw new Error('Actual preparation page is unavailable.');
    }
    const tracerSource = await readFile(
      new URL('../../../../packages/runtime/src/framework/runtime-tracer.ts', import.meta.url),
      'utf8',
    );
    const tracerModule = await transform(tracerSource, {
      loader: 'ts',
      format: 'iife',
      globalName: 'tracerImplementation',
      target: 'es2022',
      sourcefile: 'runtime-tracer.ts',
    });
    const attributes =
      options.malformed === true
        ? {
            retainedPresentCount: '2',
            retainedMissingCount: '1',
            observedBodyBytes: '42',
            bodyByteCoverageComplete: 'false',
          }
        : { retainedPresentCount: 2, retainedMissingCount: 1, observedBodyBytes: 42, bodyByteCoverageComplete: false };
    const script = `${tracerModule.code}
      const tracer = new tracerImplementation.RuntimeTracer();
      tracer.setDevtoolsTimelineEnabled(true);
      tracer.startSpan('kernel.render', { file: 'scale/part.ts' });
      for (let index = 0; index < ${measureCount}; index++) {
        const child = tracer.startSpan('kernel.compute', { entryPath: 'scale/part.ts', kernelId: 'jscad', ...${JSON.stringify(attributes)}, payload: 'PRIVATE_GEOMETRY', path: 'https://private.invalid/asset' });
        child.end();
      }
    `;
    const filename =
      kind === 'foreign-script'
        ? 'foreign-worker-Control1.js'
        : `runtime-debug.worker-Control${options.filenameIndex ?? 1}.js`;
    const scriptUrl = new URL(`/assets/${filename}`, testBaseURL).href;
    await owned.route(scriptUrl, async (route) => route.fulfill({ contentType: 'text/javascript', body: script }));
    await owned.route('**/__e2e/project-file-tree?**', async (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body>Actual dedicated producer control</body></html>',
      }),
    );
    if (options.reusePage !== true) {
      await page.goto(new URL('/__e2e/project-file-tree?main=scale-100k&prepare=1', testBaseURL).href);
    }
    const created = page.waitForEvent('worker');
    await page.evaluate(
      ({ url, name }) => {
        Reflect.set(globalThis, 'preparationWorker', new Worker(url, { name }));
      },
      { url: scriptUrl, name: kind === 'foreign-name' ? 'foreign-producer' : 'tau-ui-runtime-debug-worker' },
    );
    const worker = await created;
    // Real evaluate completion proves script execution, not merely a worker-created notification.
    expect(await worker.evaluate(() => performance.getEntriesByType('measure').length)).toBe(measureCount);
    if (kind === 'multiple') {
      const additional = page.waitForEvent('worker');
      await page.evaluate((url) => {
        void new Worker(url, { name: 'tau-ui-runtime-debug-worker' });
      }, scriptUrl);
      await additional;
    }
    return { page, worker, script };
  };

  it('should snapshot one actual preparation worker completed subtree once with exact source and privacy fences', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    const { worker, script } = await prepareWorker();
    const evaluate = vi.spyOn(worker, 'evaluate');
    const cdp = recording;
    if (cdp === undefined) {
      throw new Error('Actual preparation profile is unavailable.');
    }
    const commands = vi.spyOn(cdp, 'send');
    const detach = vi.spyOn(cdp, 'detach');
    await uiCaptureTargetDiagnostics(context);
    const path = join(artifactDirectory(), 'warehouse-preparation-worker-measures.json');
    const bytes = await readFile(path, 'utf8');
    const captured: unknown = JSON.parse(bytes);
    if (
      typeof captured !== 'object' ||
      captured === null ||
      !('status' in captured) ||
      captured.status !== 'OBSERVED'
    ) {
      throw new Error(`Actual producer snapshot unavailable: ${bytes}`);
    }
    expect(captured).toMatchObject({
      status: 'OBSERVED',
      workerName: 'tau-ui-runtime-debug-worker',
      completedMeasureCount: 1,
      truncated: false,
      measures: [
        {
          name: 'tau:kernel.compute:0:1',
          detail: { spanId: '1', parentSpanId: '0', entryPath: 'scale/part.ts', kernelId: 'jscad' },
        },
      ],
    });
    expect(captured).toHaveProperty('workerTargetId', expect.any(String));
    expect(captured).toHaveProperty('scriptSha256', createHash('sha256').update(script).digest('hex'));
    expect(bytes).not.toContain('PRIVATE_GEOMETRY');
    expect(bytes).not.toContain('https://private.invalid');
    expect(bytes).not.toContain('http://localhost');
    expect(bytes).not.toContain('tau:kernel.render');
    expect(evaluate).toHaveBeenCalledOnce();
    expect(commands.mock.calls.some(([method]) => method === 'Debugger.pause')).toBe(false);
    expect(commands.mock.calls.filter(([method]) => method === 'Profiler.stop')).toHaveLength(1);
    expect(detach).toHaveBeenCalledOnce();
    await uiCaptureTargetDiagnostics(context);
    expect(await readFile(path, 'utf8')).toBe(bytes);
    expect(evaluate).toHaveBeenCalledOnce();
    await expect(uiCpuProfile(context, 'stop', 'duplicate.cpuprofile')).rejects.toThrow('needs a recording');
  });

  it('should associate only the current producer after a captured producer retires on the same page', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    const retired = await prepareWorker();
    const closed = retired.worker.waitForEvent('close');
    await retired.page.evaluate(() => {
      const worker: unknown = Reflect.get(globalThis, 'preparationWorker');
      if (!(worker instanceof Worker)) {
        throw new Error('Actual fixture worker unavailable.');
      }
      worker.terminate();
    });
    await closed;
    const current = await prepareWorker('current', 1, { reusePage: true, filenameIndex: 2 });
    expect(current.page).toBe(retired.page);
    expect(owned.pages().at(0)?.workers()).toEqual([current.worker]);
    await uiCaptureTargetDiagnostics(context);
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    expect(captured).toMatchObject({
      status: 'OBSERVED',
      workerCounts: { captured: 2, live: 1 },
      workerName: 'tau-ui-runtime-debug-worker',
      completedMeasureCount: 1,
      scriptSha256: createHash('sha256').update(current.script).digest('hex'),
      scriptUrlSha256: createHash('sha256').update(current.worker.url()).digest('hex'),
    });
    expect(captured).toHaveProperty('workerTargetId', expect.any(String));
    expect(captured).toHaveProperty('parentFrameId', expect.any(String));
    expect(captured).toHaveProperty('browserContextId', expect.any(String));
  });

  it.each([false, true])('should retain only typed retained-body attributes malformed=%s', async (malformed) => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    await prepareWorker('current', 1, { malformed });
    await uiCaptureTargetDiagnostics(context);
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    expect(captured).toMatchObject({ status: 'OBSERVED', completedMeasureCount: 1, truncated: false });
    if (malformed) {
      for (const key of [
        'retainedPresentCount',
        'retainedMissingCount',
        'observedBodyBytes',
        'bodyByteCoverageComplete',
      ]) {
        expect(captured).not.toHaveProperty(`measures.0.detail.${key}`);
      }
    } else {
      expect(captured).toHaveProperty(
        'measures.0.detail',
        expect.objectContaining({
          retainedPresentCount: 2,
          retainedMissingCount: 1,
          observedBodyBytes: 42,
          bodyByteCoverageComplete: false,
        }),
      );
    }
  });

  it('should retire normal preparation without a worker failure snapshot', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    const { worker } = await prepareWorker();
    const evaluate = vi.spyOn(worker, 'evaluate');
    await uiCpuProfile(context, 'stop', 'normal-preparation.cpuprofile');
    await uiCaptureTargetDiagnostics(context);
    expect(evaluate).not.toHaveBeenCalled();
    await expect(
      readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should preserve the original failure and actual drain when the diagnostic artifact cannot be written', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    await prepareWorker();
    await mkdir(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), { recursive: true });
    const cdp = recording;
    if (cdp === undefined) {
      throw new Error('Actual preparation profile is unavailable.');
    }
    const commands = vi.spyOn(cdp, 'send');
    const original = new Error('Original preparation failure');
    try {
      throw original;
    } catch (error) {
      await uiCaptureTargetDiagnostics(context);
      expect(error).toBe(original);
    }
    expect(commands.mock.calls.filter(([method]) => method === 'Profiler.stop')).toHaveLength(1);
    await expect(uiCpuProfile(context, 'stop', 'duplicate.cpuprofile')).rejects.toThrow('needs a recording');
  });

  it('should report actual truncated completed measures without claiming a closed parent', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    await prepareWorker('current', 2001);
    await uiCaptureTargetDiagnostics(context);
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    if (
      typeof captured !== 'object' ||
      captured === null ||
      !('status' in captured) ||
      captured.status !== 'OBSERVED'
    ) {
      throw new Error(`Actual truncated producer snapshot unavailable: ${JSON.stringify(captured)}`);
    }
    expect(captured).toMatchObject({ status: 'OBSERVED', completedMeasureCount: 2001, truncated: true });
    expect(captured).toHaveProperty('measures.length', 2000);
  });

  it.each(['no-active', 'untagged', 'foreign-spec'])(
    'should omit producer acquisition for %s admission',
    async (kind) => {
      if (kind === 'foreign-spec') {
        context.testPath = resolve('apps/ui-e2e/src/parameters-pane.performance.spec.ts');
      }
      if (kind !== 'no-active') {
        await uiCpuProfile(context, 'start', kind === 'untagged' ? undefined : 's15-warehouse-preparation');
      }
      const { worker } = await prepareWorker();
      const evaluate = vi.spyOn(worker, 'evaluate');
      await uiCaptureTargetDiagnostics(context);
      expect(evaluate).not.toHaveBeenCalled();
      await expect(
        readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  const refusedWorkers: ReadonlyArray<{ kind: PreparationWorkerKind }> = [
    { kind: 'multiple' },
    { kind: 'foreign-name' },
    { kind: 'foreign-script' },
  ];
  it.each(refusedWorkers)('should deny a $kind producer without borrowing an association', async ({ kind }) => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    await prepareWorker(kind);
    pendingDiagnostics = Promise.resolve(uiCaptureTargetDiagnostics(context));
    await pendingDiagnostics;
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    expect(captured).toMatchObject({ status: 'UNAVAILABLE' });
    expect(captured).not.toHaveProperty('measures');
  });

  it('should refuse a later same-URL fetch rather than relabel the selected worker with its response bytes', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    const { page, worker } = await prepareWorker();
    const scriptUrl = worker.url();
    await owned.route(scriptUrl, async (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '/* later unrelated fetch */' }),
    );
    await page.evaluate(async (url) => {
      await fetch(url);
    }, scriptUrl);
    const evaluate = vi.spyOn(worker, 'evaluate');
    await uiCaptureTargetDiagnostics(context);
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    expect(captured).toMatchObject({ status: 'UNAVAILABLE', stage: 'delivered-script' });
    expect(captured).not.toHaveProperty('measures');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('should deny a retired worker while draining its actual page profile once', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    const { worker } = await prepareWorker();
    const closed = new Promise<void>((resolve) => {
      worker.once('close', () => {
        resolve();
      });
    });
    await worker.evaluate(() => {
      globalThis.close();
    });
    await closed;
    await uiCaptureTargetDiagnostics(context);
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    expect(captured).toMatchObject({ status: 'UNAVAILABLE' });
    await expect(uiCpuProfile(context, 'stop', 'duplicate.cpuprofile')).rejects.toThrow('needs a recording');
  });

  it('should handle real target close during a pending worker snapshot without fabricated records', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-preparation');
    const { page, worker } = await prepareWorker();
    // Prove this actual worker entered blocking JavaScript, then close the exact owner to release the pending protocol.
    const busyEntered = page.waitForEvent('console', (message) => message.text() === 'preparation-worker-busy');
    const busy = worker.evaluate(() => {
      console.log('preparation-worker-busy');
      for (;;) {
        /* The actual close below is this control's release. */
      }
    });
    const busyOutcome = (async (): Promise<{ status: 'resolved' } | { status: 'rejected'; error: unknown }> => {
      try {
        await busy;
        return { status: 'resolved' };
      } catch (error) {
        return { status: 'rejected', error };
      }
    })();
    await busyEntered;
    const evaluate: typeof worker.evaluate = worker.evaluate.bind(worker);
    const entered = Promise.withResolvers<void>();
    vi.spyOn(worker, 'evaluate').mockImplementation(async (expression, argument) => {
      entered.resolve();
      return evaluate(expression, argument);
    });
    const capture = uiCaptureTargetDiagnostics(context);
    const outcome = (async (): Promise<{ status: 'resolved' } | { status: 'rejected'; error: unknown }> => {
      try {
        await capture;
        return { status: 'resolved' };
      } catch (error) {
        return { status: 'rejected', error };
      }
    })();
    // An early unavailable gate is a real failure of this positive control, not an indefinitely awaited fake entry.
    const first = await Promise.race([entered.promise, outcome]);
    await owned.close();
    targetClosed = true;
    const settled = await outcome;
    // A capture that completed before close has already stopped tracing; no closed-trace cleanup error is owed.
    closedTraceCleanupExpected = settled.status === 'rejected';
    if (settled.status === 'rejected') {
      expect(settled.error).toHaveProperty('message', expect.stringMatching(/tracing\.stop:.*closed/iu));
    }
    const busySettled = await busyOutcome;
    expect(busySettled.status).toBe('rejected');
    const captured: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-preparation-worker-measures.json'), 'utf8'),
    );
    expect(captured).toMatchObject({ status: 'UNAVAILABLE' });
    expect(captured).not.toHaveProperty('measures');
    await expect(uiCpuProfile(context, 'stop', 'duplicate.cpuprofile')).rejects.toThrow('needs a recording');
    if (first !== undefined) {
      throw new Error(`Snapshot completed before entering the actual pending worker: ${JSON.stringify(captured)}`);
    }
  });

  it.each([
    'valid',
    'end',
    'read',
    'save',
    'missing-data-loss',
    'malformed-data-loss',
    'detach',
    'completion-deadline',
    'observed',
  ])(
    'preserves the failed scale trace and original error through owned cleanup %s',
    async (failure) => {
      const pendingError = new Error('Finite scale input probe timed out.');
      const acquire = vi.mocked(owned.newCDPSession).getMockImplementation();
      if (acquire === undefined) {
        throw new Error('Existing owned CDP acquisition is unavailable.');
      }
      const commands: string[] = [];
      let detachCount = 0;
      vi.mocked(owned.newCDPSession).mockImplementation(async (page) => {
        const cdp = await acquire(page);
        const send: CDPSession['send'] = cdp.send.bind(cdp);
        cdp.on('Tracing.tracingComplete', (value: unknown) => {
          if (typeof value === 'object' && value !== null) {
            if (failure === 'missing-data-loss') {
              Reflect.deleteProperty(value, 'dataLossOccurred');
            }
            if (failure === 'malformed-data-loss') {
              Reflect.set(value, 'dataLossOccurred', 'invalid');
            }
          }
        });
        const observedSend: CDPSession['send'] = async (method, parameters) => {
          commands.push(method);
          if (method === 'IO.read' && failure === 'read') {
            throw new Error('Trace read failure');
          }
          if (method === 'Tracing.end' && failure === 'completion-deadline') {
            throw new Error('Trace completion withheld');
          }
          if (method === 'Tracing.requestMemoryDump' && failure !== 'observed') {
            throw pendingError;
          }
          const result = await send(method, parameters);
          if (method === 'Tracing.end' && failure === 'end') {
            throw new Error('Trace end response failure');
          }
          return result;
        };
        vi.spyOn(cdp, 'send').mockImplementation(observedSend);
        const detach = cdp.detach.bind(cdp);
        vi.spyOn(cdp, 'detach').mockImplementation(async () => {
          detachCount += 1;
          await detach();
          if (failure === 'detach') {
            throw new Error('Detach response failure');
          }
        });
        return cdp;
      });
      if (failure === 'observed') {
        const page = owned.pages().at(0);
        if (page === undefined) {
          throw new Error('Existing owned page is unavailable.');
        }
        await page.setContent(
          '<div data-testid="cad-viewer-canvas-region"><canvas width="100" height="100"></canvas></div>',
        );
        const evaluate = page.evaluate.bind(page);
        const observedEvaluate = async <Result, Argument>(
          expression: Parameters<typeof page.evaluate<Result, Argument>>[0],
          argument: Argument,
        ): Promise<Result> => {
          if (
            typeof expression === 'function' &&
            expression.toString().includes('Finite scale input probe timed out.')
          ) {
            if (
              typeof argument !== 'object' ||
              argument === null ||
              !('readyMark' in argument) ||
              typeof argument.readyMark !== 'string'
            ) {
              throw new Error('Existing observation-ready mark unavailable.');
            }
            await evaluate((mark) => {
              performance.mark(mark);
            }, argument.readyMark);
            throw pendingError;
          }
          return evaluate(expression, argument);
        };
        vi.spyOn(page, 'evaluate').mockImplementation(observedEvaluate);
      }
      if (failure === 'save') {
        await mkdir(join(artifactDirectory(), 'failed-scale.probe.json'), { recursive: true });
      }
      await expect(uiScalePresentationProbe(context, 'failed-scale')).rejects.toBe(pendingError);
      if (failure === 'valid' || failure === 'end' || failure === 'detach' || failure === 'observed') {
        const bytes = await readFile(join(artifactDirectory(), 'failed-scale.trace.json'));
        expect(bytes.byteLength).toBeGreaterThan(0);
        const report: unknown = JSON.parse(
          await readFile(join(artifactDirectory(), 'failed-scale.probe.json'), 'utf8'),
        );
        expect(report).toMatchObject({
          status: 'failed-probe-only',
          traceBytes: bytes.byteLength,
          dataLossOccurred: false,
          finiteObservation: null,
          completedNativeInputCount: null,
          windows: null,
          presentationQualification: 'unqualified',
        });
      } else if (failure !== 'save') {
        await expect(readFile(join(artifactDirectory(), 'failed-scale.probe.json'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
      expect(commands.filter((method) => method === 'Tracing.end')).toHaveLength(1);
      expect(commands.filter((method) => method === 'IO.close')).toHaveLength(
        failure === 'completion-deadline' ? 0 : 1,
      );
      expect(detachCount).toBe(1);
    },
    12_000,
  );

  it('should capture a real paused point, resume, and drain once before renderer probes', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-startup', 'primary');
    const cdp = recording;
    if (cdp === undefined) {
      throw new Error('Actual profile owner did not acquire its CDP session.');
    }
    const send: CDPSession['send'] = cdp.send.bind(cdp);
    let statement: Promise<unknown> | undefined;
    // Keep every command real. The responsive control supplies the next JS statement only after pause is armed.
    const observedSend: CDPSession['send'] = async (method, parameters) => {
      const result = await send(method, parameters);
      if (method === 'Debugger.pause') {
        statement = send('Runtime.evaluate', { expression: 'void 0' });
      }
      return result;
    };
    const commands = vi.spyOn(cdp, 'send').mockImplementation(observedSend);
    const off = vi.spyOn(cdp, 'off');
    const detach = vi.spyOn(cdp, 'detach');
    await uiCaptureTargetDiagnostics(context);
    await statement;
    const methods = commands.mock.calls.map(([method]) => method);
    expect(methods).toEqual([
      'Debugger.enable',
      'Debugger.pause',
      'Debugger.resume',
      'Debugger.disable',
      'Profiler.stop',
    ]);
    expect(detach).toHaveBeenCalledOnce();
    expect(off).toHaveBeenCalledWith('Debugger.paused', expect.any(Function));
    expect(off).toHaveBeenCalledWith('close', expect.any(Function));
    const stopOrder = commands.mock.invocationCallOrder.at(4);
    if (stopOrder === undefined) {
      throw new Error('Actual profiler stop call order is missing.');
    }
    expect(Math.max(...off.mock.invocationCallOrder)).toBeLessThan(stopOrder);
    const paused: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-paused-stack.json'), 'utf8'),
    );
    if (paused === null || typeof paused !== 'object' || !('frames' in paused) || !Array.isArray(paused.frames)) {
      throw new Error('Actual pause did not produce its bounded frame derivative.');
    }
    expect(paused.frames.length).toBeGreaterThan(0);
    expect(paused.frames.length).toBeLessThanOrEqual(64);
    expect(paused).toMatchObject({ status: 'OBSERVED' });
    const frames: readonly unknown[] = paused.frames;
    for (const frame of frames) {
      if (frame === null || typeof frame !== 'object') {
        throw new TypeError('Paused frame derivative must be an object.');
      }
      expect(
        Object.keys(frame)
          .filter((key) => key !== 'columnNumber')
          .toSorted(),
      ).toEqual(['functionName', 'lineNumber', 'scriptId', 'urlSha256']);
      expect(frame).toHaveProperty('urlSha256', expect.stringMatching(/^[a-f0-9]{64}$/u));
    }
    const profile: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'startup-failure-primary.cpuprofile'), 'utf8'),
    );
    if (profile === null || typeof profile !== 'object' || !('nodes' in profile) || !Array.isArray(profile.nodes)) {
      throw new Error('Actual profiler stop did not return nodes.');
    }
    expect(profile.nodes.length).toBeGreaterThan(0);
    expect(await owned.pages()[0]?.evaluate(() => 42)).toBe(42);
    await expect(uiCpuProfile(context, 'stop', 'double-stop.cpuprofile')).rejects.toThrow('needs a recording');
  });

  it('should retire normal warehouse recording without enabling the debugger or draining twice', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-startup', 'primary');
    const cdp = recording;
    if (cdp === undefined) {
      throw new Error('Actual profile owner did not acquire its CDP session.');
    }
    const commands = vi.spyOn(cdp, 'send');
    await uiCpuProfile(context, 'stop', 'normal.cpuprofile');
    await uiCaptureTargetDiagnostics(context);
    expect(commands.mock.calls.map(([method]) => method)).toEqual(['Profiler.stop']);
    await expect(readFile(join(artifactDirectory(), 'warehouse-paused-stack.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('should acquire no diagnostic CDP when no profile is active', async () => {
    await uiCaptureTargetDiagnostics(context);
    expect(owned.newCDPSession).not.toHaveBeenCalled();
    await expect(readFile(join(artifactDirectory(), 'startup-failure-primary.cpuprofile'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each(['untagged', 'foreign-spec'])(
    'should drain %s profiles without warehouse debugger admission',
    async (kind) => {
      if (kind === 'foreign-spec') {
        context.testPath = resolve('apps/ui-e2e/src/parameters-pane.performance.spec.ts');
      }
      await uiCpuProfile(context, 'start', kind === 'untagged' ? undefined : 's15-warehouse-startup', 'primary');
      const cdp = recording;
      if (cdp === undefined) {
        throw new Error('Actual profile owner did not acquire its CDP session.');
      }
      const commands = vi.spyOn(cdp, 'send');
      await uiCaptureTargetDiagnostics(context);
      expect(commands.mock.calls.map(([method]) => method)).toEqual(['Profiler.stop']);
      await expect(readFile(join(artifactDirectory(), 'warehouse-paused-stack.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('should reject an actual session close without a fabricated pause or repeated drain', async () => {
    await uiCpuProfile(context, 'start', 's15-warehouse-startup', 'primary');
    const cdp = recording;
    if (cdp === undefined) {
      throw new Error('Actual profile owner did not acquire its CDP session.');
    }
    const send: CDPSession['send'] = cdp.send.bind(cdp);
    const observedSend: CDPSession['send'] = async (method, parameters) => {
      const result = await send(method, parameters);
      if (method === 'Debugger.enable') {
        await owned.close();
        targetClosed = true;
      }
      return result;
    };
    const commands = vi.spyOn(cdp, 'send').mockImplementation(observedSend);
    const off = vi.spyOn(cdp, 'off');
    await expect(uiCaptureTargetDiagnostics(context)).rejects.toThrow(/closed|stopped/iu);
    expect(commands.mock.calls.map(([method]) => method)).toEqual([
      'Debugger.enable',
      'Debugger.pause',
      'Debugger.resume',
      'Debugger.disable',
      'Profiler.stop',
    ]);
    expect(off).toHaveBeenCalledWith('Debugger.paused', expect.any(Function));
    expect(off).toHaveBeenCalledWith('close', expect.any(Function));
    await expect(readFile(join(artifactDirectory(), 'warehouse-paused-stack.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const unavailable: unknown = JSON.parse(
      await readFile(join(artifactDirectory(), 'warehouse-paused-stack-unavailable.json'), 'utf8'),
    );
    expect(unavailable).toMatchObject({ status: 'UNAVAILABLE' });
    expect(unavailable).toHaveProperty(
      'message',
      expect.stringContaining('Target page, context or browser has been closed'),
    );
    await expect(uiCpuProfile(context, 'stop', 'double-stop.cpuprofile')).rejects.toThrow('needs a recording');
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('browser trace stream', () => {
  it('preserves exact proto bytes across binary chunks and an empty binary EOF', async () => {
    const chunks = [Buffer.from([0, 255, 128]), Buffer.from([13]), Buffer.from([10, 0, 195, 169])];
    const remaining = [...chunks];
    const read = vi.fn(async () => {
      const bytes = remaining.shift();
      return { data: bytes?.toString('base64') ?? '', base64Encoded: true, eof: bytes === undefined };
    });
    expect(await writeBrowserTraceStream(read, tracePath, 'proto')).toBe(8);
    expect(await readFile(tracePath)).toEqual(Buffer.concat(chunks));
    expect(read).toHaveBeenCalledTimes(4);
  });

  it.each([false, undefined])('rejects proto binary flag %s even at empty EOF', async (base64Encoded) => {
    await expect(
      writeBrowserTraceStream(async () => ({ data: '', base64Encoded, eof: true }), tracePath, 'proto'),
    ).rejects.toThrow('requires a binary transport');
    expect(await readFile(tracePath)).toHaveLength(0);
  });

  it('caps decoded proto bytes before appending an oversized response', async () => {
    const data = Buffer.alloc(67_108_865).toString('base64');
    await expect(
      writeBrowserTraceStream(async () => ({ data, base64Encoded: true, eof: true }), tracePath, 'proto'),
    ).rejects.toThrow('64 MiB artifact cap');
    expect(await readFile(tracePath)).toHaveLength(0);
  });

  it('rejects a stream without EOF inside the existing finite read limit', async () => {
    const read = vi.fn(async () => ({ data: '', base64Encoded: true, eof: false }));
    await expect(writeBrowserTraceStream(read, tracePath, 'proto')).rejects.toThrow('finite stream limit');
    expect(read).toHaveBeenCalledTimes(1024);
  });

  it('keeps default JSON UTF8 bytes and rejects binary JSON responses', async () => {
    const data = '{"name":"é☃"}';
    expect(await writeBrowserTraceStream(async () => ({ data, eof: true }), tracePath)).toBe(Buffer.byteLength(data));
    expect(await readFile(tracePath)).toEqual(Buffer.from(data));
    await expect(
      writeBrowserTraceStream(async () => ({ data, base64Encoded: true, eof: true }), tracePath),
    ).rejects.toThrow('unexpectedly uses a binary transport');
    expect(await readFile(tracePath)).toHaveLength(0);
  });
});
