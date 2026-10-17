/**
 * Write the consumer parity table (charter D33, W22, gate T16): one row per consumer of native dependency
 * resolution, each passing only when every oracle it names last passed.
 *
 * It runs no suite. Each oracle is a job in a workflow that already runs it, and this script reads that job's latest
 * conclusion through the GitHub REST API: in this run for the nightly's own jobs (falling back to the latest nightly
 * on `main` when this run skipped them, such as under `only: packaged`), on `main` for the push workflows, and the
 * latest run on any ref for the path-filtered pull-request workflows. A consumer whose oracle runs in no workflow is a
 * failing row, not an omission.
 *
 * Usage: node scripts/src/consumer-parity-summary.ts [--summary <file>] [--detail <consumer>=<text>]…
 *   --summary <file>             Append the Markdown table (for `$GITHUB_STEP_SUMMARY`).
 *   --detail <consumer>=<text>   Extra evidence for one consumer's row, such as the desktop suite's test counts.
 * Environment: GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_TOKEN (actions: read); GITHUB_SERVER_URL and
 *   GITHUB_API_URL default to github.com.
 * Exit codes: 0 every consumer passes; 1 a consumer fails or has no oracle; 2 usage or an API failure.
 */
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Where an oracle's latest result is read. */
export type OracleScope =
  /** This nightly run, or the latest nightly run on `main` that ran the job. */
  | 'this-run'
  /** The latest run on `main` that ran the job. */
  | 'main'
  /** The latest run on any ref that ran the job: path-filtered pull-request workflows have no `main` runs. */
  | 'any';

/** One oracle: jobs of one workflow, or a named gap. */
export type Oracle =
  | {
      readonly kind: 'job';
      /** The workflow file name under `.github/workflows`. */
      readonly workflow: string;
      /** The job name, or the prefix every matching job name starts with (a matrix). */
      readonly job: string;
      readonly match: 'exact' | 'prefix';
      readonly scope: OracleScope;
      /** Only runs of this trigger, for a workflow whose other runs mostly skip the job (a label-gated pull request). */
      readonly event?: string;
      /** What the job proves for this consumer. */
      readonly proves: string;
    }
  | {
      readonly kind: 'missing';
      /** The oracle the charter names that no workflow runs. */
      readonly proves: string;
    };

/** One consumer row of the W22 table. */
export type Consumer = { readonly name: string; readonly oracles: readonly Oracle[] };

const nightly = 'e2e-nightly.yml';

/** The shards of `ci.yml` that run every affected `test` target, `cli:test` and `host:test` among them. */
const ciTests = (proves: string): Oracle => ({
  kind: 'job',
  workflow: 'ci.yml',
  job: 'Affected (test-',
  match: 'prefix',
  scope: 'main',
  proves,
});

const nativeDarwin = (proves: string): Oracle => ({
  kind: 'job',
  workflow: 'native-darwin.yml',
  job: 'Native kernels on darwin-arm64',
  match: 'exact',
  scope: 'main',
  proves,
});

/** The consumers charter W22 and success criterion 13 list, in the charter's order. */
export const consumers: readonly Consumer[] = [
  {
    name: 'Browser / UI',
    oracles: [
      {
        kind: 'job',
        workflow: nightly,
        job: 'Browser end-to-end (ui-e2e test:e2e)',
        match: 'exact',
        scope: 'this-run',
        proves: '`ui-e2e:test:e2e`, kernel WASM laziness',
      },
      {
        kind: 'job',
        workflow: 'ui-asset-integrity.yml',
        job: 'WASM integrity (',
        match: 'prefix',
        scope: 'any',
        proves: 'WASM `integrity` under `require-corp`',
      },
    ],
  },
  {
    name: 'Packaged desktop',
    oracles: [
      {
        kind: 'job',
        workflow: nightly,
        job: 'Packaged desktop end-to-end (darwin-arm64)',
        match: 'exact',
        scope: 'this-run',
        proves: '`desktop-e2e:test:e2e:packaged` on macos-26',
      },
    ],
  },
  {
    name: 'MCP under Claude Code',
    oracles: [
      ciTests('`mcp.integration.test.ts` with `CLAUDE_PROJECT_DIR` and the Claude Code client shape'),
      nativeDarwin('`tau mcp` tier 4b: real Build123d and PicoGK, warm-store G1 under locked'),
    ],
  },
  {
    name: 'MCP under Codex',
    oracles: [
      ciTests('`mcp.integration.test.ts` with Codex `_meta` folders and the Codex client shapes'),
      nativeDarwin('`tau mcp` tier 4b, started as Codex starts it (no project variable)'),
    ],
  },
  {
    name: 'CLI binary',
    oracles: [
      ciTests('`cli-scenarios.integration.test.ts` T1–T12, `check-pack-install` tests'),
      nativeDarwin('the built `tau` exports `main.cs` with no Tau variable set'),
      {
        kind: 'job',
        workflow: 'preview-packages.yml',
        job: 'Install the previews (',
        match: 'prefix',
        scope: 'main',
        event: 'workflow_dispatch',
        proves: '`check-pack-install.ts` against the pkg.pr.new previews',
      },
    ],
  },
  {
    name: 'Daemon (`tau serve`)',
    oracles: [
      ciTests('`serve.integration.test.ts`, `runtime-child-supervisor.test.ts`'),
      nativeDarwin('`tau serve` tier 4b: `.py` and `.cs` evaluate after preparation'),
    ],
  },
  {
    name: 'Docker host image',
    oracles: [
      {
        kind: 'job',
        workflow: 'host-image.yml',
        job: 'Host image with a baked store under --network none',
        match: 'exact',
        scope: 'any',
        proves: 'baked seed, `--network none`, `--verify --offline`',
      },
    ],
  },
  {
    name: 'Agent plugins',
    oracles: [
      {
        kind: 'job',
        workflow: nightly,
        job: 'Browser end-to-end (agent-plugin test:e2e)',
        match: 'exact',
        scope: 'this-run',
        proves: '`agent-plugin:test:e2e`, the viewer page against a real `tau mcp`',
      },
      { kind: 'missing', proves: '`pnpm plugin:dev doctor --smoke` against a pkg.pr.new preview' },
    ],
  },
  {
    name: 'Client-hosted static host',
    oracles: [
      {
        kind: 'job',
        workflow: 'static-host-conformance.yml',
        job: 'Static host conformance (https://taucad-staging.netlify.app)',
        match: 'exact',
        scope: 'any',
        proves: 'isolation headers on the required host (staging); other hosts are recorded only (X-5)',
      },
    ],
  },
];

/** A workflow run, from the REST API's fields of the same names. */
export type WorkflowRun = {
  readonly id: number;
  readonly url: string;
  /** Absent for a run with no branch (the API's `null`). */
  readonly branch: string | undefined;
  readonly sha: string;
  readonly createdAt: string;
};

/** A job of a run, from the REST API. */
export type WorkflowJob = {
  readonly name: string;
  /** Absent while the job runs (the API's `null`). */
  readonly conclusion: string | undefined;
  readonly url: string;
};

/** Which runs of a workflow to read. */
export type RunFilter = { readonly branch?: string; readonly event?: string };

/** What the script reads from GitHub. */
export type ActionsReader = {
  /** Completed runs of a workflow, newest first. */
  readonly runs: (workflow: string, filter: RunFilter) => Promise<readonly WorkflowRun[]>;
  /** One run's jobs. */
  readonly jobs: (runId: number) => Promise<readonly WorkflowJob[]>;
  /** The current run, for `this-run` oracles. */
  readonly currentRun: () => Promise<WorkflowRun>;
};

/** One oracle's result. */
export type OracleResult = {
  readonly oracle: Oracle;
  readonly status: 'pass' | 'fail';
  /** Markdown evidence: job links and conclusions, the run and where it came from. */
  readonly evidence: string;
};

/** One consumer's row. */
export type ConsumerResult = {
  readonly consumer: Consumer;
  readonly status: 'pass' | 'fail';
  readonly oracles: readonly OracleResult[];
  readonly detail: string | undefined;
};

/** Conclusions that mean the job did not run its oracle, so an older run is consulted instead. */
const notRun = new Set(['skipped', 'cancelled']);

const matching = (oracle: Extract<Oracle, { kind: 'job' }>, jobs: readonly WorkflowJob[]): WorkflowJob[] =>
  jobs.filter(({ name }) => (oracle.match === 'exact' ? name === oracle.job : name.startsWith(oracle.job)));

const ran = (jobs: readonly WorkflowJob[]): boolean =>
  jobs.length > 0 && jobs.every(({ conclusion }) => conclusion !== undefined && !notRun.has(conclusion));

/** A run, and how the evidence names where it came from. */
type Source = { readonly run: WorkflowRun; readonly origin: string };

const describeRun = ({ run, origin }: Source): string =>
  `[run ${String(run.id)}](${run.url}) · ${run.createdAt.slice(0, 10)} · \`${run.branch ?? '?'}\` \`${run.sha.slice(0, 9)}\` · ${origin}`;

const judged = (oracle: Oracle, jobs: readonly WorkflowJob[], source: Source): OracleResult => {
  const status = jobs.every(({ conclusion }) => conclusion === 'success') ? 'pass' : 'fail';
  const links = jobs.map(({ name, conclusion, url }) => `[${name}](${url}): ${conclusion ?? 'running'}`);
  return { oracle, status, evidence: `${links.join(', ')} (${describeRun(source)})` };
};

/** How many completed runs to look back through for one that ran the job. */
const lookback = 20;

/**
 * Find the newest run of a workflow whose matching jobs ran, and judge them.
 * @param oracle - The job oracle.
 * @param reader - The GitHub reader.
 * @param where - The branch to limit to (any ref when absent), and how the evidence names where the run came from.
 * @returns The result, failing when no run in the lookback ran the job.
 */
const latest = async (
  oracle: Extract<Oracle, { kind: 'job' }>,
  reader: ActionsReader,
  where: { readonly branch?: string; readonly origin: string },
): Promise<OracleResult> => {
  const { branch, origin } = where;
  const runs = await reader.runs(oracle.workflow, {
    ...(branch === undefined ? {} : { branch }),
    ...(oracle.event === undefined ? {} : { event: oracle.event }),
  });
  for (const run of runs.slice(0, lookback)) {
    // oxlint-disable-next-line no-await-in-loop -- newest first, stopping at the first run that ran the job.
    const jobs = matching(oracle, await reader.jobs(run.id));
    if (ran(jobs)) {
      return judged(oracle, jobs, { run, origin });
    }
  }
  return {
    oracle,
    status: 'fail',
    evidence: `no completed ${oracle.event === undefined ? '' : `${oracle.event} `}run of \`${oracle.workflow}\`${branch === undefined ? '' : ` on \`${branch}\``} ran \`${oracle.job}\` in the last ${String(lookback)}`,
  };
};

/**
 * Read one oracle's latest result.
 * @param oracle - The oracle.
 * @param reader - The GitHub reader.
 * @returns Its result.
 */
export const resolveOracle = async (oracle: Oracle, reader: ActionsReader): Promise<OracleResult> => {
  if (oracle.kind === 'missing') {
    return { oracle, status: 'fail', evidence: 'no oracle: no workflow runs it' };
  }
  switch (oracle.scope) {
    case 'this-run': {
      const run = await reader.currentRun();
      const jobs = matching(oracle, await reader.jobs(run.id));
      return ran(jobs)
        ? judged(oracle, jobs, { run, origin: 'this run' })
        : latest(oracle, reader, { branch: 'main', origin: 'skipped in this run; latest nightly on `main`' });
    }
    case 'main': {
      return latest(oracle, reader, { branch: 'main', origin: 'latest on `main`' });
    }
    case 'any': {
      return latest(oracle, reader, { origin: 'latest on any ref (path-filtered workflow)' });
    }
  }
};

/**
 * Judge every consumer.
 * @param reader - The GitHub reader.
 * @param details - Extra evidence by consumer name.
 * @param table - The consumers, {@link consumers} by default.
 * @returns One result per consumer, in table order.
 */
export const consumerParity = async (
  reader: ActionsReader,
  details: ReadonlyMap<string, string> = new Map(),
  table: readonly Consumer[] = consumers,
): Promise<ConsumerResult[]> => {
  const results: ConsumerResult[] = [];
  for (const consumer of table) {
    const oracles: OracleResult[] = [];
    for (const oracle of consumer.oracles) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of API reads, kept sequential for the rate limit.
      oracles.push(await resolveOracle(oracle, reader));
    }
    results.push({
      consumer,
      status: oracles.every(({ status }) => status === 'pass') ? 'pass' : 'fail',
      oracles,
      detail: details.get(consumer.name),
    });
  }
  return results;
};

const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');

/**
 * The Markdown parity table: one line per consumer, then one line per oracle beneath it.
 * @param results - From {@link consumerParity}.
 * @returns The report.
 */
export const parityReport = (results: readonly ConsumerResult[]): string => {
  const passing = results.filter(({ status }) => status === 'pass').length;
  const lines = [
    '### Consumer parity (W22, D33)',
    '',
    `${String(passing)} of ${String(results.length)} consumers pass. A consumer passes only when every oracle it names last passed; a consumer without an oracle fails.`,
    '',
    '| Consumer | Result | Oracle | Evidence |',
    '| --- | --- | --- | --- |',
  ];
  for (const { consumer, status, oracles, detail } of results) {
    for (const [index, { oracle, status: oracleStatus, evidence }] of oracles.entries()) {
      const first = index === 0;
      lines.push(
        `| ${first ? `**${cell(consumer.name)}**` : ''} | ${first ? `**${status}**` : ''} | ${cell(oracle.proves)} | ${oracleStatus}: ${cell(evidence)}${first && detail !== undefined ? `; ${cell(detail)}` : ''} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
};

/** The REST API's run fields this script reads; `head_branch` may be JSON `null`. */
type RawRun = {
  readonly id: number;
  readonly html_url: string;
  readonly head_branch: unknown;
  readonly head_sha: string;
  readonly created_at: string;
};

/** The REST API's job fields this script reads; `conclusion` is JSON `null` while the job runs. */
type RawJob = { readonly name: string; readonly conclusion: unknown; readonly html_url: string };

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const toRun = (raw: RawRun): WorkflowRun => ({
  id: raw.id,
  url: raw.html_url,
  branch: optionalString(raw.head_branch),
  sha: raw.head_sha,
  createdAt: raw.created_at,
});

const toJob = (raw: RawJob): WorkflowJob => ({
  name: raw.name,
  conclusion: optionalString(raw.conclusion),
  url: raw.html_url,
});

/** A REST reader over `fetch`, authenticated with the workflow token. */
const restReader = (environment: NodeJS.ProcessEnv): ActionsReader => {
  const repository = environment['GITHUB_REPOSITORY'];
  const runId = environment['GITHUB_RUN_ID'];
  const token = environment['GITHUB_TOKEN'];
  if (!repository || !runId || !token) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_TOKEN are required.');
  }
  const api = environment['GITHUB_API_URL'] ?? 'https://api.github.com';
  const get = async (path: string): Promise<unknown> => {
    const response = await fetch(`${api}/repos/${repository}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw new Error(`GET ${path} answered ${String(response.status)}`);
    }
    return response.json();
  };
  const jobCache = new Map<number, readonly WorkflowJob[]>();
  return {
    runs: async (workflow, { branch, event }) => {
      const query = new URLSearchParams({ status: 'completed' });
      query.set('per_page', String(lookback));
      if (branch !== undefined) {
        query.set('branch', branch);
      }
      if (event !== undefined) {
        query.set('event', event);
      }
      const page = (await get(`/actions/workflows/${workflow}/runs?${query.toString()}`)) as {
        workflow_runs: RawRun[];
      };
      return page.workflow_runs.map((raw) => toRun(raw));
    },
    jobs: async (id) => {
      const cached = jobCache.get(id);
      if (cached !== undefined) {
        return cached;
      }
      const page = (await get(`/actions/runs/${String(id)}/jobs?per_page=100`)) as { jobs: RawJob[] };
      const jobs = page.jobs.map((raw) => toJob(raw));
      jobCache.set(id, jobs);
      return jobs;
    },
    currentRun: async () => toRun((await get(`/actions/runs/${runId}`)) as RawRun),
  };
};

const usage = 'Usage: node scripts/src/consumer-parity-summary.ts [--summary <file>] [--detail <consumer>=<text>]…';

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  let summary: string | undefined;
  const details = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    const separator = value?.indexOf('=') ?? -1;
    if (flag === '--summary' && value) {
      summary = value;
    } else if (flag === '--detail' && value !== undefined && separator > 0) {
      const text = value.slice(separator + 1).trim();
      if (text !== '') {
        details.set(value.slice(0, separator), text);
      }
    } else {
      console.error(usage);
      process.exitCode = 2;
      return;
    }
  }
  let results: ConsumerResult[];
  try {
    results = await consumerParity(restReader(process.env), details);
  } catch (error) {
    console.error(`consumer parity: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }
  const report = parityReport(results);
  console.log(report);
  if (summary !== undefined) {
    await appendFile(summary, report);
  }
  const failing = results.filter(({ status }) => status === 'fail');
  for (const { consumer } of failing) {
    console.log(`::error title=Consumer parity::${consumer.name} has a failing or missing oracle`);
  }
  process.exitCode = failing.length === 0 ? 0 : 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
