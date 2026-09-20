import { completeReports } from '#bench/report-validation';
import type { SourceRewardInput } from '#bench/source-reward';
import type { WorkerState } from '#bench/worker-state';
import { measurementMembers } from '#bench/measurements';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  campaignExpectations,
  campaignGates,
  campaignIdentity,
  campaignInputGaps,
  campaignSchedule,
  campaignStatistics,
  reportPlantNs,
  validateCampaignObservation,
  validateMeasurementEvidence,
} from '#bench/campaign';
import type { CampaignObservation, ProductCampaign } from '#bench/campaign';
import { planBroadWorkload, readHashed, sha256 } from '#bench/lib';
import type { Artifact, BroadWorkloadPlan, ProductBenchmarkConfig, verifyBroadFixtures } from '#bench/lib';

type EnvironmentReceipt = {
  campaignId: string;
  exclusive: boolean;
  buildsRunning: boolean;
  frozenProducts: boolean;
  hostname: string;
  platform: string;
  architecture: string;
  node: string;
  validUntil: string;
  osPageCache: string;
};
type CampaignInvoke = (input: {
  routeName: string;
  workload: string;
  repeat: number;
  preparedPath: string;
  prepared?: BroadWorkloadPlan;
  deadlines?: { report: number; startup: number; cleanup: number };
  persistedCache?: { base: string; projectRoot: string };
  reservationExpiresAt?: number;
  sourceReward?: { input: SourceRewardInput; output: string };
  state?: WorkerState;
  prefillExpected?: unknown;
  members?: Array<{ id: string; workload: string; path: string; plan?: BroadWorkloadPlan }>;
  plant?: { metric: 'firstActionableReportNs' | 'suiteReportNs'; durationNs: number };
}) => Promise<CampaignObservation>;

const hashJournal = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) {
      throw new TypeError('Unexpected journal stream chunk.');
    }
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const verifyFreeze = async (artifacts: Artifact[]): Promise<void> => {
  for (const artifact of artifacts) {
    // oxlint-disable-next-line no-await-in-loop -- Hash large installed artifacts sequentially without retaining the closure in memory.
    await readHashed(artifact);
  }
};
const explicitlyEqual = (value: unknown, expected: boolean): boolean => value === expected;
const environmentMatches = (receipt: EnvironmentReceipt, id: string): boolean =>
  receipt.campaignId === id &&
  explicitlyEqual(receipt.exclusive, true) &&
  explicitlyEqual(receipt.buildsRunning, false) &&
  explicitlyEqual(receipt.frozenProducts, true) &&
  receipt.hostname === hostname() &&
  receipt.platform === process.platform &&
  receipt.architecture === process.arch &&
  receipt.node === process.version &&
  Date.parse(receipt.validUntil) > Date.now() &&
  typeof receipt.osPageCache === 'string' &&
  Boolean(receipt.osPageCache.trim());

const frozenInputGaps = (config: ProductBenchmarkConfig, campaign: ProductCampaign): string[] => {
  const gaps: string[] = [];
  const requiredHarness = [
    'run.ts',
    'lib.ts',
    'worker.ts',
    'campaign.ts',
    'campaign-run.ts',
    'campaign-analysis.py',
    'report-delay.ts',
    'measurements.ts',
    'process-rss.ts',
    'worker-state.ts',
    'report-validation.ts',
    'source-reward.ts',
    'cache-state.ts',
  ];
  for (const name of requiredHarness) {
    const path = fileURLToPath(new URL(name, import.meta.url));
    if (!campaign.freeze.some((artifact) => artifact.path === path)) {
      gaps.push(`freeze omits harness input ${name}`);
    }
  }
  if (!campaign.freeze.some(({ path }) => path === process.execPath)) {
    gaps.push('freeze omits current Node executable');
  }
  for (const item of campaign.cases) {
    for (const name of [item.baseline, item.candidate]) {
      const route = config.routes[name];
      if (route?.state !== 'ready') {
        continue;
      }
      for (const artifact of route.artifacts) {
        if (!campaign.freeze.some((frozen) => frozen.path === artifact.path && frozen.sha256 === artifact.sha256)) {
          gaps.push(`freeze omits ${name} artifact ${artifact.path}`);
        }
      }
    }
  }
  return [...new Set(gaps)];
};

const loadCampaignGates = async (campaign: ProductCampaign): Promise<Record<string, unknown>> => {
  const gates: Record<string, unknown> = {};
  for (const name of campaignGates) {
    const artifact = campaign.gates[name];
    if (artifact) {
      // oxlint-disable-next-line no-await-in-loop -- Read bound acceptance receipts before launch.
      const value = JSON.parse(Buffer.from(await readHashed(artifact)).toString()) as {
        campaignId: string;
        freezeDigest: string;
        decision: string;
      };
      gates[name] = {
        artifact,
        value,
        bound: value.campaignId === campaign.id && value.freezeDigest === campaignIdentity(campaign.freeze),
      };
    }
  }
  return gates;
};

/**
 * Execute only an explicit frozen schema-v2 campaign, using the existing runner's product invocation.
 * @internal
 * @returns After durable manifests/receipts; no implicit analysis or promotion.
 */
export const runProductCampaign = async ({
  config,
  campaign,
  configPath,
  outputPath,
  measure,
  broadFixtures,
  invoke,
}: {
  config: ProductBenchmarkConfig;
  campaign: ProductCampaign;
  configPath: string;
  outputPath: string;
  measure: boolean;
  broadFixtures: NonNullable<Awaited<ReturnType<typeof verifyBroadFixtures>>>;
  invoke: CampaignInvoke;
}): Promise<void> => {
  const gaps = campaignInputGaps(config, campaign);
  const schedule = campaignSchedule(campaign.cases);
  const statistics = campaignStatistics(campaign.cases);
  const configArtifact = { path: configPath, sha256: sha256(await readFile(configPath)) };
  const expected = await campaignExpectations(config, campaign);
  await verifyFreeze(campaign.freeze);
  if (campaign.analysis) {
    await readHashed(campaign.analysis.python);
  }
  gaps.push(...frozenInputGaps(config, campaign));
  const environment = JSON.parse(Buffer.from(await readHashed(campaign.environment)).toString()) as EnvironmentReceipt;
  if (!environmentMatches(environment, campaign.id)) {
    gaps.push('environment receipt does not admit this host/runtime/time/quiet frozen state');
  }
  const gates = await loadCampaignGates(campaign);
  const prepared = new Map<string, { path: string; plan?: BroadWorkloadPlan }>();
  await mkdir(dirname(outputPath), { recursive: true });
  // Reserve output first. Reusing a campaign path cannot append or overwrite data.
  await writeFile(
    outputPath,
    `${JSON.stringify({ schemaVersion: 2, campaignId: campaign.id, disposition: 'inconclusive', state: 'reserved' })}\n`,
    { flag: 'wx' },
  );
  const selected = new Set(
    campaign.cases.flatMap((item) => [
      item.workload,
      ...(item.priorWorkload ? [item.priorWorkload] : []),
      ...measurementMembers(config.workloads, item.workload).map((member) => member.workload),
    ]),
  );
  for (const workload of config.workloads.filter(({ id }) => selected.has(id))) {
    const plan = workload.kind === 'broad-fixture' ? planBroadWorkload(broadFixtures, workload.fixtureId) : undefined;
    const path = `${outputPath}.${workload.id}.input.json`;
    // oxlint-disable-next-line no-await-in-loop -- Workload preparation must precede all product timing.
    await writeFile(path, JSON.stringify(plan ?? null), { flag: 'wx' });
    prepared.set(workload.id, { path, plan });
  }
  for (const item of campaign.cases) {
    if (
      item.mode === 'persisted-warm' &&
      !prepared.get(item.workload)?.plan?.claims.some((claim) => claim.capability === 'analyzeMeshOverlap')
    ) {
      gaps.push(`${item.id}: selected workload does not demand the current A3 authenticated overlap cache family`);
    }
  }
  const manifest = {
    schemaVersion: 2,
    campaignId: campaign.id,
    config: configArtifact,
    campaign,
    statistics,
    schedule,
    environment,
    gates,
    source: config.source,
    routes: config.routes,
    workloads: config.workloads,
    broadFixtures,
    prepared: [...prepared].map(([workload, value]) => ({
      workload,
      path: value.path,
      sha256: campaignIdentity(value.plan ?? null),
    })),
    gaps,
    boundaries: {
      latency: 'parent public first/suite report receipt before ACK/cleanup/qualification',
      setup: 'cold includes spawn, module load, selected input admission; manifest/reset preflight excluded',
      plant:
        'trailing third arm after each alternating A/A pair, delay=max(8ms,0.25*that paired A report); no control data enters product pairs',
      warm: 'broad installed JS: initialized live engine then start ACK; resident/claim-edit: full public prefill on retained subject then start ACK; unavailable contracts remain explicit gaps',
      persisted:
        'A3 native only: unique private store per arm; separate full public prefill process, post-ACK flush and close/reap, then fresh measured process; positive writes/hits and verified producer equality required; mixed remains resident-only',
      rss: 'requires sampled parent+descendants through final reap; worker maxRSS is not substituted',
    },
  };
  const manifestPath = `${outputPath}.manifest.json`;
  const manifestBytes = `${JSON.stringify(manifest, undefined, 2)}\n`;
  await writeFile(manifestPath, manifestBytes, { flag: 'wx' });
  const journalPath = `${outputPath}.observations.jsonl`;
  await writeFile(journalPath, '', { flag: 'wx' });
  const invocationInputs = new Map(
    [...prepared].map(([workload, value]) => [
      workload,
      { path: value.path, sha256: campaignIdentity(value.plan ?? null) },
    ]),
  );
  const prefillExpected = new Map<string, unknown>();
  for (const item of campaign.cases) {
    for (const name of new Set([item.baseline, item.candidate])) {
      const artifact = item.prefillExpected?.[name];
      prefillExpected.set(
        `${item.id}/${name}`,
        // oxlint-disable-next-line no-await-in-loop -- Full prior-profile expectations are loaded serially before measurements.
        artifact ? JSON.parse(Buffer.from(await readHashed(artifact)).toString()) : expected.get(`${item.id}/${name}`),
      );
      const value = prefillExpected.get(`${item.id}/${name}`);
      if (value !== undefined) {
        assert.ok(
          completeReports(value, config.routes[name]?.backend ?? ''),
          'Prefill expectations require complete profile records.',
        );
      }
    }
  }
  const attemptsPath = `${outputPath}.attempts.jsonl`;
  await writeFile(attemptsPath, '', { flag: 'wx' });
  let failure: string | undefined;
  let count = 0;
  let allValid = true;
  const canMeasure = measure && gaps.length === 0;
  try {
    if (canMeasure) {
      for (const block of schedule) {
        const item = campaign.cases.find(({ id }) => id === block.caseId)!;
        const input = prepared.get(item.workload)!;
        const selection = measurementMembers(config.workloads, item.workload);
        const members =
          selection.length > 1
            ? selection.map((member) => ({ ...member, ...prepared.get(member.workload)! }))
            : undefined;
        const prior = item.priorWorkload ? prepared.get(item.priorWorkload)?.plan : undefined;
        if (item.mode === 'incremental-edit') {
          assert.ok(
            prior &&
              prior.subject.primary.sha256 === input.plan?.subject.primary.sha256 &&
              JSON.stringify(prior.subject.resources) === JSON.stringify(input.plan.subject.resources),
            'Claims-only edit requires identical admitted artifact bytes/resources.',
          );
          assert.notDeepEqual(prior.claims, input.plan.claims, 'Incremental claims must actually change.');
        }
        const paired = new Map<string, CampaignObservation>();
        const observations = block.order.map((arm) => ({
          arm,
          routeName: block.routes[arm],
          plant: undefined as { metric: 'firstActionableReportNs' | 'suiteReportNs'; durationNs: number } | undefined,
        }));
        // The plants execute after A is observed, so BA still uses this exact A.
        for (const metric of block.plants) {
          observations.push({ arm: 'B', routeName: block.routes.A, plant: { metric, durationNs: 0 } });
        }
        for (const row of observations) {
          assert.ok(
            environmentMatches(environment, campaign.id),
            'Environment reservation expired; campaign incomplete, never extended.',
          );
          // oxlint-disable-next-line no-await-in-loop -- Frozen bytes are checked outside each timed product invocation.
          await verifyFreeze([
            configArtifact,
            ...(item.sourceReward
              ? [
                  item.sourceReward.worker,
                  item.sourceReward.loader,
                  item.sourceReward.manifest,
                  ...item.sourceReward.files,
                ]
              : []),
            ...(item.priorWorkload ? [invocationInputs.get(item.priorWorkload)!] : []),
            invocationInputs.get(item.workload)!,
            ...selection.flatMap((member) => {
              const value = prepared.get(member.workload)!;
              return [
                invocationInputs.get(member.workload)!,
                ...(value.plan ? [value.plan.subject.primary, ...value.plan.subject.resources] : []),
              ];
            }),
          ]);
          if (row.plant) {
            row.plant.durationNs = reportPlantNs(paired.get('A')![row.plant.metric]!);
          }
          // oxlint-disable-next-line no-await-in-loop -- Q7 pairs and control arms execute serially on one reserved host.
          await appendFile(
            attemptsPath,
            `${JSON.stringify({ sequence: count, block, route: row.routeName, plant: row.plant, state: 'started' })}\n`,
          );
          let observation: CampaignObservation;
          try {
            // oxlint-disable-next-line no-await-in-loop -- Fixed pairs and calibration arms must execute serially.
            observation = await invoke({
              persistedCache:
                item.mode === 'persisted-warm' && item.persistedCache
                  ? {
                      base: resolve(item.persistedCache.parent, `${campaign.id}-${count}`),
                      projectRoot: item.persistedCache.projectRoot,
                    }
                  : undefined,
              reservationExpiresAt: Date.parse(environment.validUntil),
              deadlines: {
                report:
                  (item.sampleBudgetNs ?? { ordinary: 2e9, scale: 5e9, suite: 300e9, microcase: 0 }[item.class]) / 1e6,
                ...campaign.deadlines!,
              },
              routeName: row.routeName,
              workload: item.workload,
              repeat: block.pair,
              preparedPath: input.path,
              prepared: input.plan,
              members,
              state: {
                mode: item.mode === 'source-to-reward' ? 'cold-process' : item.mode,
                prior: item.priorWorkload ? prepared.get(item.priorWorkload)?.plan : undefined,
              },
              sourceReward: item.sourceReward
                ? { input: item.sourceReward, output: `${outputPath}.source-${count}` }
                : undefined,
              prefillExpected: prefillExpected.get(`${item.id}/${row.routeName}`),
              plant: row.plant,
            });
          } catch (error) {
            observation = {
              successful: false,
              firstActionableReportNs: null,
              suiteReportNs: null,
              suiteReports: null,
              qualification: { evaluationCompleted: false, expectedMatches: false, overlapVerified: false },
              result: { invocationError: String(error), cause: error instanceof Error ? error.cause : undefined },
            };
          }
          const valid =
            validateMeasurementEvidence(observation, item, config) &&
            validateCampaignObservation(
              observation,
              expected.get(`${item.id}/${row.routeName}`),
              config.routes[row.routeName]!.backend,
            );
          allValid &&= valid;
          if (!row.plant) {
            paired.set(row.arm, observation);
          }
          const record = {
            sequence: count++,
            block,
            arm: row.arm,
            route: row.routeName,
            plant: row.plant,
            valid,
            observation,
          };
          // Persist every observation before another invocation; incomplete campaigns remain recoverable, not resumable samples.
          // oxlint-disable-next-line no-await-in-loop -- Journal each completed product observation before continuing.
          await appendFile(journalPath, `${JSON.stringify(record)}\n`);
          // oxlint-disable-next-line no-await-in-loop -- Complete the durable attempt before another observation begins.
          await appendFile(attemptsPath, `${JSON.stringify({ sequence: record.sequence, state: 'settled', valid })}\n`);
          if (!valid) {
            throw new Error(`Unqualified observation ${record.sequence}; fixed campaign aborted without replacement.`);
          }
        }
      }
      await verifyFreeze([...campaign.freeze, configArtifact]);
    }
  } catch (error) {
    failure = String(error);
    allValid = false;
  }
  const receipt = {
    schemaVersion: 2,
    campaignId: campaign.id,
    disposition: 'inconclusive',
    state: failure ? 'controlled-abort' : canMeasure ? 'measured-awaiting-analysis' : 'planned-not-measured',
    failure,
    attempts: { path: attemptsPath, sha256: await hashJournal(attemptsPath) },
    manifest: { path: manifestPath, sha256: sha256(manifestBytes) },
    observations: { path: journalPath, sha256: await hashJournal(journalPath) },
    count,
    allValid: count > 0 ? allValid : null,
    gaps,
    performanceAccepted: false,
  };
  // Final receipt is a successor, preserving the output reservation and manifest.
  await writeFile(`${outputPath}.receipt.json`, `${JSON.stringify(receipt, undefined, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (measure && (gaps.length > 0 || !allValid)) {
    process.exitCode = 1;
  }
};
