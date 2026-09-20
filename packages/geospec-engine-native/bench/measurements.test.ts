import type { BroadFixtureDescriptor } from '#bench/broad-fixtures';
import assert from 'node:assert/strict';
import test from 'node:test';
import { measureMembers, measurementMembers } from '#bench/measurements';
import { OwnedProcessTree, parseProcessTable, startProcessRss } from '#bench/process-rss';

await test('should count independent completed admissions and stop before all ACK/cleanup work', async () => {
  let clock = 0;
  const events: string[] = [];
  const members = [
    { id: 'one', workload: 'box' },
    { id: 'two', workload: 'box' },
  ];
  const measured = await measureMembers({
    members,
    now: () => clock,
    launch: async ({ id }) => {
      events.push(`report:${id}`);
      clock += 20;
      let acknowledged = false;
      const completion = Promise.withResolvers<string>();
      return {
        reports: [{ status: 'failed', id }],
        completed: completion.promise,
        acknowledge: () => {
          if (acknowledged) {
            return;
          }
          acknowledged = true;
          events.push(`ack:${id}`);
          clock += 1000;
          completion.resolve(id);
        },
      };
    },
  });
  assert.deepEqual(events, ['report:one', 'report:two', 'ack:one', 'ack:two']);
  assert.equal(measured.suiteReportNs, 40);
  assert.equal(measured.completedSubjects, 2);
  assert.equal(measured.completedClaims, 2);
  assert.equal(measured.throughputPerSecond, 50_000_000);
  assert.deepEqual(
    measured.reports.map((report) => report['status']),
    ['failed', 'failed'],
  );
  assert.deepEqual(measured.members, ['one', 'two']);
});
await test('should require the whole frozen selected-suite inventory exactly once', () => {
  assert.deepEqual(
    measurementMembers(
      [
        { id: 'a', kind: 'common-tetrahedron-bounds' },
        { id: 'b', kind: 'm3-row', rowId: 'row' },
        {
          id: 'suite',
          kind: 'selected-suite',
          members: [
            { id: 'a1', workload: 'a' },
            { id: 'b1', workload: 'b' },
          ],
        },
      ],
      'suite',
    ).map((member) => member.workload),
    ['a', 'b'],
  );
});
await test('should sum parent and descendants, retain reparented identities, and observe final reap', async () => {
  const root = { pid: 1, parent: 0, rssBytes: 10, birth: 'root' };
  const child = { pid: 2, parent: 1, rssBytes: 20, birth: 'child' };
  const grandchild = { pid: 3, parent: 2, rssBytes: 40, birth: 'grandchild' };
  const tree = new OwnedProcessTree(1);
  assert.deepEqual(tree.observe([root, child, grandchild]), [root, child, grandchild]);
  assert.deepEqual(tree.observe([root, { ...grandchild, parent: 0 }]), [root, { ...grandchild, parent: 0 }]);
  assert.deepEqual(tree.observe([root]), [root]);
  const snapshots = [[root, child, grandchild], [root, { ...grandchild, parent: 0 }], [root]];
  const sampler = await startProcessRss({
    rootPid: 1,
    samplePeriod: 1,
    reapDeadline: 100,
    read: async () => snapshots.shift() ?? [root],
  });
  const result = await sampler.finish();
  assert.equal(result.complete, true);
  assert.equal(result.peakBytes, 70);
  assert.equal(result.samples.at(-1)?.rssBytes, 10);
  assert.deepEqual(parseProcessTable(' 4 1 123 Sun Sep 20 12:00:00 2026'), [
    { pid: 4, parent: 1, rssBytes: 125_952, birth: 'Sun Sep 20 12:00:00 2026' },
  ]);
});

await test('should preserve complete failed successor bytes at the timed first event', async () => {
  const { completeReports, firstReportMatches } = await import('#bench/report-validation');
  const { consumerReportRecord } = await import('#bench/lib');
  const bytes = new TextEncoder().encode('{"status":"failed"}');
  const report = consumerReportRecord({
    claimId: 'strict',
    status: 'failed',
    result: { status: 'failed' },
    canonicalClaim: bytes,
    canonicalPlan: bytes,
    canonicalResult: bytes,
  });
  assert.equal(completeReports([report], 'native'), true);
  assert.equal(firstReportMatches({ report, cleanupStarted: false }, [report], 'native'), true);
  assert.equal(completeReports([{ status: 'failed' }], 'legacy'), true);
  assert.equal(completeReports([{ status: 'failed' }], 'native'), false);
  assert.equal(firstReportMatches({ report: { status: 'failed' }, cleanupStarted: false }, [report], 'native'), false);
});

await test('should prefill through the public evaluator on the same retained subject before starting resident timing', async () => {
  const { prepareResident } = await import('#bench/worker-state');
  const subject: BroadFixtureDescriptor = {
    id: 'box',
    family: 'large-mesh',
    format: 'step',
    primary: { path: 'box.step', sha256: 'frozen', bytes: 1 },
    resources: [],
    analyticFacts: {},
    qualification: 'host-mocked',
  };
  const workload = {
    fixture: subject,
    subject,
    claims: [],
    authoredClaims: 1,
    unsupportedClaims: [],
    independentFacts: {},
  };
  const events: string[] = [];
  const reports = [{ status: 'failed' }];
  await prepareResident({
    state: { mode: 'resident-warm' },
    workload,
    evaluate: async (claims) => {
      assert.equal(claims, workload.claims);
      events.push('evaluate');
      return reports;
    },
    ready: (record) => {
      assert.equal(record['prefillReports'], reports);
      assert.equal(record['retainedSubject'], true);
      events.push('ready');
    },
  });
  assert.deepEqual(events, ['evaluate', 'ready']);
});

await test('should settle an ordinary synthetic public report and ACK before bounded cleanup/reap', async () => {
  const { invokeProductRoute } = await import('#bench/run');
  const { consumerReportRecord } = await import('#bench/lib');
  const bytes = new TextEncoder().encode('{"status":"failed"}');
  const report = consumerReportRecord({
    claimId: 'strict',
    status: 'failed',
    result: { status: 'failed' },
    canonicalClaim: bytes,
    canonicalPlan: bytes,
    canonicalResult: bytes,
  });
  const script = `import {readSync} from 'node:fs';const report=${JSON.stringify(report)};console.log(JSON.stringify({event:'first-report',report,cleanupStarted:false}));console.log(JSON.stringify({event:'suite-report',reports:[report],cleanupStarted:false}));const ack=Buffer.alloc(1);readSync(0,ack,0,1,null);console.log(JSON.stringify({event:'complete',result:{successful:ack[0]===10,firstReportAcknowledgedBeforeCleanup:ack[0]===10}}));`;
  const observation = await invokeProductRoute({
    route: {
      state: 'ready',
      consumer: 'standalone',
      backend: 'native',
      profile: 'synthetic-host-only',
      comparison: 'normal host protocol only; no product',
      artifacts: [],
      execution: {
        kind: 'event-command',
        executable: process.execPath,
        arguments: ['--input-type=module', '-e', script],
        cwd: process.cwd(),
      },
    },
    configPath: 'unused',
    routeName: 'synthetic',
    workload: 'one',
    repeat: 0,
    preparedPath: 'unused',
    deadlines: { report: 5000, startup: 5000, cleanup: 5000 },
  });
  assert.equal(observation.successful, true);
  assert.equal(observation.reaped, true);
  assert.deepEqual(observation.invocationErrors, []);
  assert.deepEqual(observation.suiteReports, [report]);
  assert.equal(observation.rawEvents?.length, 3);
});

await test('should preserve mocked finalized source bytes and provenance without launching a runtime', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { produceSourceReward } = await import('#bench/source-reward');
  const root = await mkdtemp(join(tmpdir(), 'geospec-source-host-'));
  const projectRoot = resolve('packages/geospec/host-tests/tau-project-c2/fixtures/baseline');
  const subject: BroadFixtureDescriptor = {
    id: 'box',
    family: 'large-mesh',
    format: 'step',
    primary: { path: 'reference.step', sha256: 'frozen-reference', bytes: 1 },
    resources: [],
    analyticFacts: {},
    qualification: 'host-mocked',
  };
  const bytes = new TextEncoder().encode('ISO-10303-21;\nHEADER;\n/* original header */\nENDSEC;\n');
  try {
    const produced = await produceSourceReward({
      input: {
        projectRoot,
        worker: { path: 'unused-no-worker-launched', sha256: 'unused' },
        loader: { path: 'unused-no-loader-launched', sha256: 'unused' },
        manifest: { path: join(projectRoot, 'tau.json'), sha256: 'read-only-existing-fixture' },
        files: [],
        cacheState: 'fresh-runtime-memory',
      },
      output: join(root, 'new-output'),
      workload: {
        fixture: subject,
        subject,
        claims: [],
        authoredClaims: 0,
        unsupportedClaims: [],
        independentFacts: {},
      },
      exportArtifact: async ({ descriptor }) => ({
        success: true,
        issues: [],
        data: {
          format: 'step',
          name: 'box.step',
          mimeType: 'application/step',
          bytes,
          frame: { coordinateSystem: 'z-up', lengthUnit: 'millimeter', sourceUnit: 'mm' },
          source: {
            manifestPath: 'tau.json',
            manifestBytes: new Uint8Array(),
            manifest: descriptor.manifest,
            projectEntryPath: 'main.ts',
            entryPath: 'main.ts',
            kernelId: 'replicad',
            files: [],
          },
          export: { options: {}, route: { kernelId: 'replicad', targetFormat: 'step', direct: true } },
        },
      }),
    });
    assert.deepEqual(Uint8Array.from(await readFile(produced.workload.subject.primary.path)), bytes);
    assert.equal(produced.receipt['rawHeadersPreserved'], true);
    assert.equal(produced.receipt['lifetimes'], 0, 'The mocked exporter creates no runtime or product process.');
  } finally {
    await rm(root, { recursive: true });
  }
});

await test('should require actual A3 publication and replay diagnostics from equal verified producers', async () => {
  const { cachePublicationPresent, cacheReplayMatches, closeMeasuredEngine } = await import('#bench/cache-state');
  const producer = { schema: 'geospec-producer-build-v2', verified: true, core: 'core', csg: 'csg', brep: 'brep' };
  const flush = {
    sealed: true,
    authenticationFailures: 0,
    ioFailures: 0,
    rejectedWrites: 0,
    reads: 1,
    misses: 1,
    writes: 1,
    hits: 0,
  };
  const prefill = { producer, flush };
  const replay = { producer, flush: { ...flush, misses: 0, writes: 0, hits: 1 } };
  assert.equal(cachePublicationPresent(prefill), true);
  assert.equal(cacheReplayMatches(prefill, replay), true);
  for (const counters of [
    { reads: 2, hits: 1, misses: 1, writes: 1 },
    { reads: 1, hits: 1, misses: 0, writes: 1 },
    { reads: 2, hits: 1, misses: 0, writes: 0 },
    { reads: 0, hits: 0, misses: 0, writes: 0 },
  ]) {
    assert.equal(
      cacheReplayMatches(prefill, { producer, flush: { ...flush, ...counters } }),
      false,
      JSON.stringify(counters),
    );
  }
  const previous = process.env['GEOSPEC_CAMPAIGN_CACHE'];
  process.env['GEOSPEC_CAMPAIGN_CACHE'] = JSON.stringify({
    root: '/host-mock-only/cache',
    projectRoot: '/host-mock-only/project',
  });
  const operations: string[] = [];
  const method = (): Uint8Array<ArrayBuffer> => new Uint8Array();
  const receipt: Record<string, unknown> = {};
  try {
    closeMeasuredEngine(
      {
        processRequest: method,
        ingestMesh: method,
        ingestSubject: method,
        subjectHandle: method,
        releaseSubject: method,
        canonicalPlan: method,
        evaluatePlan: method,
        cacheProducerIdentity: () => new TextEncoder().encode(JSON.stringify(producer)),
        flushCache: () => {
          operations.push('flush');
          return new TextEncoder().encode(JSON.stringify(flush));
        },
        close: () => {
          operations.push('close');
        },
      },
      receipt,
    );
    assert.deepEqual(operations, ['flush', 'close']);
    assert.deepEqual(receipt, prefill);
  } finally {
    if (previous === undefined) {
      delete process.env['GEOSPEC_CAMPAIGN_CACHE'];
    } else {
      process.env['GEOSPEC_CAMPAIGN_CACHE'] = previous;
    }
  }
});
