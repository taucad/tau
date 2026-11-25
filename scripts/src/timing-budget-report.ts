/**
 * Post the timing-budget lane's results to the owner issues (CI decomposition ruling D-DC17, operator Q3 option B).
 *
 * `timing-budgets.yml` runs each spec of a `test:e2e:timing-budgets` target as its own job; each job uploads the
 * Vitest JSON report it wrote. This reads those reports and the plan's owner list (spec to issue, from the target's
 * `metadata.owners`) and keeps one comment per owner issue: the run, its commit and every one of that issue's specs
 * with its result. The comment carries {@link marker}, so a later run edits it in place instead of adding another.
 * A spec with no report (its job failed before Vitest wrote one, or ran out of time) reads "no result".
 *
 * Usage: node scripts/src/timing-budget-report.ts --reports <dir> [--summary <file>]
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY (`owner/name`), OWNERS (JSON array of {project, root, spec, issue}), RUN_URL,
 * HEAD_SHA.
 * Exit codes: 0 every owner issue was updated (whatever the specs' results: the spec jobs already fail the run); 1 a
 * GitHub API failure; 2 usage.
 */
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One timing-budget spec and the issue that owns it, as the plan job lists them. */
export type Owner = {
  readonly project: string;
  readonly root: string;
  readonly spec: string;
  readonly issue: number;
};

/** The parts of Vitest's JSON report this reads. */
export type VitestReport = {
  readonly testResults: ReadonlyArray<{
    readonly name: string;
    readonly status: string;
    readonly startTime?: number;
    readonly endTime?: number;
    readonly assertionResults: ReadonlyArray<{ readonly status: string }>;
  }>;
};

export type SpecResult = Owner & {
  readonly outcome: 'passed' | 'failed' | 'no result';
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly milliseconds?: number;
};

export type Run = { readonly url: string; readonly sha: string };

/** Identifies the lane's comment on an issue. */
export const marker = '<!-- tau:timing-budgets-lane -->';

/** Every `*.json` file under `directory` (one per downloaded artifact), parsed; a missing directory reads as none. */
export const readReports = async (directory: string): Promise<VitestReport[]> => {
  let entries: string[];
  try {
    entries = await readdir(directory, { recursive: true });
  } catch {
    return [];
  }
  const files = entries.filter((entry) => entry.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(join(directory, file), 'utf8')) as VitestReport),
  );
};

/** Each owner's spec, matched to its file in the reports by the path below its project's root. */
export const specResults = (owners: readonly Owner[], reports: readonly VitestReport[]): SpecResult[] =>
  owners.map((owner) => {
    const suffix = `/${owner.root}/${owner.spec}`;
    const file = reports.flatMap((report) => report.testResults).find(({ name }) => name.endsWith(suffix));
    if (!file) {
      return { ...owner, outcome: 'no result', passed: 0, failed: 0, skipped: 0 };
    }
    const count = (status: string): number => file.assertionResults.filter((test) => test.status === status).length;
    const failed = count('failed');
    return {
      ...owner,
      outcome: file.status === 'failed' || failed > 0 ? 'failed' : 'passed',
      passed: count('passed'),
      failed,
      skipped: file.assertionResults.length - count('passed') - failed,
      ...(file.startTime !== undefined && file.endTime !== undefined
        ? { milliseconds: file.endTime - file.startTime }
        : {}),
    };
  });

const minutes = (milliseconds: number | undefined): string =>
  milliseconds === undefined ? '' : `${(milliseconds / 60_000).toFixed(1)} min`;

/** The results as a Markdown table, one row per spec. */
export const resultTable = (results: readonly SpecResult[]): string =>
  [
    '| Spec | Result | Passed | Failed | Skipped | Time |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (result) =>
        `| \`${result.root}/${result.spec}\` | ${result.outcome} | ${result.passed} | ${result.failed} | ${result.skipped} | ${minutes(result.milliseconds)} |`,
    ),
  ].join('\n');

/** The comment one owner issue carries: its own specs' results from the newest finished run. */
export const commentBody = (results: readonly SpecResult[], run: Run): string => {
  const failing = results.filter((result) => result.outcome !== 'passed').length;
  return [
    marker,
    '### Timing-budget lane',
    '',
    `Latest \`main\` run: [${run.url.split('/').pop() ?? run.url}](${run.url}) on \`${run.sha.slice(0, 10)}\`. ${
      failing === 0
        ? 'Every spec of this issue passed.'
        : `${failing} of ${results.length} specs of this issue are not green.`
    }`,
    '',
    resultTable(results),
    '',
    'Non-gating (CI decomposition ruling D-DC17): `timing-budgets.yml` runs these on `main` pushes that affect `ui`, and a newer push cancels an older run. This comment is updated in place on each run. Once every spec is green the release gate will require the lane.',
  ].join('\n');
};

/** A GitHub REST call: method and path relative to the API root, with an optional JSON body. */
export type Request = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** Edit the issue's lane comment, or create it when the issue has none. */
export const upsertComment = async ({
  request,
  repository,
  issue,
  body,
}: {
  readonly request: Request;
  readonly repository: string;
  readonly issue: number;
  readonly body: string;
}): Promise<'updated' | 'created'> => {
  for (let page = 1; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Pages are read in order until the comment or the last page.
    const comments = (await request(
      'GET',
      `repos/${repository}/issues/${issue}/comments?per_page=100&page=${page}`,
    )) as ReadonlyArray<{ readonly id: number; readonly body?: string }>;
    const existing = comments.find((comment) => comment.body?.includes(marker));
    if (existing) {
      // oxlint-disable-next-line no-await-in-loop -- The loop ends here: one edit of the comment found.
      await request('PATCH', `repos/${repository}/issues/comments/${existing.id}`, { body });
      return 'updated';
    }
    if (comments.length < 100) {
      break;
    }
  }
  await request('POST', `repos/${repository}/issues/${issue}/comments`, { body });
  return 'created';
};

const githubRequest =
  (token: string): Request =>
  async (method, path, body) => {
    const response = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(`${method} ${path}: GitHub API ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  };

/** Report every owner issue's results; the summary gets every spec. */
export const report = async ({
  owners,
  reports,
  run,
  repository,
  request,
  log,
}: {
  readonly owners: readonly Owner[];
  readonly reports: readonly VitestReport[];
  readonly run: Run;
  readonly repository: string;
  readonly request: Request;
  readonly log: (line: string) => void;
}): Promise<SpecResult[]> => {
  const results = specResults(owners, reports);
  const issues = [...new Set(results.map((result) => result.issue))].sort((a, b) => a - b);
  const actions = await Promise.all(
    issues.map(async (issue) => {
      const own = results.filter((result) => result.issue === issue);
      const action = await upsertComment({ request, repository, issue, body: commentBody(own, run) });
      return `#${issue}: ${action} (${own.map((result) => `${result.spec} ${result.outcome}`).join(', ')})`;
    }),
  );
  for (const line of actions) {
    log(line);
  }
  return results;
};

const main = async (args: readonly string[]): Promise<number> => {
  let reportsDirectory: string | undefined;
  let summary: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--reports' && args[index + 1]) {
      reportsDirectory = args[++index];
    } else if (args[index] === '--summary' && args[index + 1]) {
      summary = args[++index];
    } else {
      console.error(`Unknown argument: ${args[index]}`);
      return 2;
    }
  }
  const {
    GITHUB_TOKEN: token,
    GITHUB_REPOSITORY: repository,
    OWNERS: owners,
    RUN_URL: url,
    HEAD_SHA: sha,
  } = process.env;
  if (!reportsDirectory || !token || !repository || !owners || !url || !sha) {
    console.error(
      'Usage: node scripts/src/timing-budget-report.ts --reports <dir> [--summary <file>] (env: GITHUB_TOKEN, GITHUB_REPOSITORY, OWNERS, RUN_URL, HEAD_SHA)',
    );
    return 2;
  }
  try {
    const results = await report({
      owners: JSON.parse(owners) as Owner[],
      reports: await readReports(reportsDirectory),
      run: { url, sha },
      repository,
      request: githubRequest(token),
      log: (line) => {
        console.log(line);
      },
    });
    if (summary) {
      await appendFile(summary, `## Timing budgets\n\n${resultTable(results)}\n`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
