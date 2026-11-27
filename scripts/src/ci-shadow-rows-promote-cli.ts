/**
 * Shadow-row promotion (FQ-13 of the CI flake quarantine blueprint, Brain `research/ci-flake-quarantine-blueprint.md`,
 * D5; the CI decomposition blueprint's Q1 ruling): for every shadow row whose count in the flake ledger's state has
 * reached the bar (`ci-shadow-rows.ts`, 100 consecutive passing runs), open a pull request that moves the suite from
 * its project's `test:e2e:shadow` to its `test:e2e:queue`, so it gates the merge queue.
 *
 * The pull request is a proposal: promotion changes the gate, so this never merges it or enables auto-merge. It is
 * one commit on `flake-ledger/promote-<project>-<target>`, based on the tip of `--base`, that edits one `project.json`;
 * its body holds the count and the runs it was counted over. A row whose branch already exists is left alone (an open
 * proposal, or one a human closed: delete the branch to propose it again), so a run of this CLI never opens a second
 * pull request for one row.
 *
 * `shadow-row-promotion.yml` opens it with a `tau-flake-bot` App token when the `flake-bot` environment holds the
 * App's secrets (`PULL_REQUEST_STARTS_CI=true`): its pull request starts CI. Otherwise it falls back to the workflow's
 * token, whose pull request starts no workflow, so the body asks the reviewer to close and reopen it, which runs CI
 * as the reviewer. When the repository does not let workflows open pull requests (HTTP 403), the branch is kept and
 * the summary names it for a human to open.
 *
 * Usage: node scripts/src/ci-shadow-rows-promote-cli.ts [--base main] [--state-branch flake-ledger]
 *          [--state-file <path>] [--root .] [--dry-run] [--summary <file>]
 * `--state-file` reads a local state; `--dry-run` writes nothing to GitHub and prints each edit.
 * Env: GITHUB_TOKEN (`contents: write` for the branch, `pull-requests: write` for the pull request),
 * PULL_REQUEST_STARTS_CI (`true` when GITHUB_TOKEN is the App's), GITHUB_REPOSITORY (default taucad/tau),
 * GITHUB_API_URL.
 * Exit codes: 0 nothing to promote, or every proposal opened or already open; 1 API failure; 2 usage.
 */
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { client, GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import {
  meetsShadowBar,
  promoteProjectJson,
  queueTarget,
  readShadowRegistry,
  renderShadowMarkdown,
  shadowBar,
  shadowRowKey,
  shadowTarget,
  streakFromHistory,
} from '#ci-shadow-rows.js';
import type { ShadowRow, ShadowRowState } from '#ci-shadow-rows.js';

/** The branch a row's proposal is pushed to. */
export const promotionBranch = (row: { readonly project: string; readonly target: string }): string =>
  `flake-ledger/promote-${`${row.project}-${row.target}`.replaceAll(/[^\w.-]+/gu, '-')}`;

/** The proposal's title: `test(<project>): Gate <target> in the merge queue`, within the 72 characters of the policy. */
export const promotionTitle = (row: { readonly project: string; readonly target: string }): string => {
  const title = `test(${row.project}): Gate ${row.target} in the merge queue`;
  return title.length <= 72 ? title : `test(${row.project}): Gate ${row.target}`;
};

/** The proposal's body: the count, the runs it was counted over, and what the reviewer has to do. */
export const promotionBody = (
  row: ShadowRow,
  state: ShadowRowState,
  options: {
    readonly repository: string;
    readonly server?: string;
    /** The token is `tau-flake-bot`'s, so the pull request starts CI by itself; otherwise the reviewer reruns it. */
    readonly startsCi?: boolean;
  },
): string => {
  const server = options.server ?? 'https://github.com';
  const counted = state.streak > 0 ? state.history.slice(-state.streak) : [];
  const retried = counted.filter((record) => record.retried > 0);
  return [
    `The shadow row \`${shadowRowKey(row)}\` passed ${state.streak} consecutive runs, the Q1 bar of ${shadowBar} (CI flake quarantine blueprint FQ-13). This moves \`${row.target}\` from \`${shadowTarget}\` to \`${queueTarget}\` in \`${row.projectFile}\`, so it gates the merge queue.`,
    '',
    `The flake ledger counted it (\`ledger.json\` on the \`${stateBranch}\` branch, \`shadowRows\`); ${state.runs} runs counted since ${state.firstSeen.slice(0, 10)}${state.lastFailure ? `, the last failure in run ${state.lastFailure.run} (${state.lastFailure.at.slice(0, 10)})` : ', none failed'}. ${retried.length > 0 ? `${retried.length} of the passing runs passed a test on its recorded retry (${retried.reduce((sum, record) => sum + record.retried, 0)} retried passes); each is a flake event in the ledger.` : 'No test passed on a retry in them.'}`,
    '',
    options.startsCi === true
      ? '**Promotion changes the gate, so this pull request is not merged automatically.** CI runs on it: review it, then enable auto-merge.'
      : '**Promotion changes the gate, so this pull request is not merged automatically.** It was opened with the workflow token, which starts no CI: close and reopen it to run CI, review, then enable auto-merge.',
    '',
    `<details><summary>The ${counted.length} runs counted</summary>`,
    '',
    '| Run | Attempt | Completed | Tests | Retried passes |',
    '| --- | ---: | --- | ---: | ---: |',
    ...counted.map(
      (record) =>
        `| [${record.run}](${server}/${options.repository}/actions/runs/${record.run}/attempts/${record.attempt}) | ${record.attempt} | ${record.at} | ${record.tests} | ${record.retried} |`,
    ),
    '',
    '</details>',
    '',
    'Opened by `.github/workflows/shadow-row-promotion.yml` (`scripts/src/ci-shadow-rows-promote-cli.ts`).',
    '',
  ].join('\n');
};

/** The rows whose count meets the bar, with their state; a state whose history does not agree is left out. */
export const readyRows = (
  rows: readonly ShadowRow[],
  states: Readonly<Record<string, ShadowRowState>> | undefined,
): Array<{ readonly row: ShadowRow; readonly state: ShadowRowState }> =>
  rows.flatMap((row) => {
    const state = states?.[shadowRowKey(row)];
    // The proposal lists the runs it counted, so it needs them all in the kept history.
    return state && meetsShadowBar(state) && streakFromHistory(state.history) >= shadowBar ? [{ row, state }] : [];
  });

const exists = async (github: Client, path: string): Promise<boolean> => {
  try {
    await github.get(path);
    return true;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return false;
    }
    throw error;
  }
};

type Outcome = { readonly key: string; readonly line: string };

const propose = async (
  github: Client,
  input: {
    readonly row: ShadowRow;
    readonly state: ShadowRowState;
    readonly base: string;
    readonly dryRun: boolean;
    readonly startsCi: boolean;
  },
): Promise<Outcome> => {
  const { row, state, base, dryRun, startsCi } = input;
  const repo = `/repos/${github.repository}`;
  const key = shadowRowKey(row);
  const branch = promotionBranch(row);
  if (await exists(github, `${repo}/git/ref/heads/${branch}`)) {
    return {
      key,
      line: `\`${key}\`: \`${branch}\` exists already (an open proposal, or a closed one: delete the branch to propose it again)`,
    };
  }
  const tip = await github.get<{ object: { sha: string } }>(`${repo}/git/ref/heads/${base}`);
  const text = await github.getText(
    `${repo}/contents/${row.projectFile}?ref=${tip.object.sha}`,
    'application/vnd.github.raw+json',
  );
  const edited = promoteProjectJson(text, row.target);
  const title = promotionTitle(row);
  const body = promotionBody(row, state, { repository: github.repository, startsCi });
  if (dryRun) {
    console.log(`--- ${row.projectFile} (${title})\n${edited}`);
    return { key, line: `\`${key}\`: would open "${title}" (dry run)` };
  }
  const commit = await github.get<{ tree: { sha: string } }>(`${repo}/git/commits/${tip.object.sha}`);
  const blob = await github.send<{ sha: string }>('POST', `${repo}/git/blobs`, { content: edited });
  const tree = await github.send<{ sha: string }>('POST', `${repo}/git/trees`, {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the Git data API's field name
    base_tree: commit.tree.sha,
    tree: [{ path: row.projectFile, mode: '100644', type: 'blob', sha: blob.sha }],
  });
  const created = await github.send<{ sha: string }>('POST', `${repo}/git/commits`, {
    message: `${title}\n\nThe shadow row ${key} passed ${state.streak} consecutive runs, the Q1 bar of ${shadowBar}, as the\nflake ledger counted them (FQ-13).`,
    tree: tree.sha,
    parents: [tip.object.sha],
  });
  await github.send('POST', `${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: created.sha });
  try {
    const pull = await github.send<{ number: number; html_url: string }>('POST', `${repo}/pulls`, {
      title,
      head: branch,
      base,
      body,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
      maintainer_can_modify: true,
    });
    return { key, line: `\`${key}\`: opened #${pull.number} (${pull.html_url})` };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 403) {
      console.log(`::warning::Workflows may not open pull requests here; open one from ${branch} by hand.`);
      return {
        key,
        line: `\`${key}\`: pushed \`${branch}\`; workflows may not open pull requests, so open it by hand`,
      };
    }
    throw error;
  }
};

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        base: { type: 'string', default: 'main' },
        'state-branch': { type: 'string', default: stateBranch },
        'state-file': { type: 'string', default: '' },
        root: { type: 'string', default: '.' },
        'dry-run': { type: 'boolean', default: false },
        summary: { type: 'string', default: process.env['GITHUB_STEP_SUMMARY'] ?? '' },
      },
    }));
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  const token = process.env['GITHUB_TOKEN'];
  if (!token || !/^[\w./-]+$/u.test(values.base)) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/ci-shadow-rows-promote-cli.ts [--base main] [--state-file <path>] [--dry-run]',
    );
    return 2;
  }
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests: 500 });
  const store = values['state-file']
    ? fileStore(resolve(values['state-file']))
    : branchStore(github, values['state-branch']);
  const registry = await readShadowRegistry(resolve(values.root));
  const state = await store.read();
  const lines: string[] = [];
  if (state) {
    for (const { row, state: rowState } of readyRows(registry.rows, state.shadowRows)) {
      // oxlint-disable-next-line no-await-in-loop -- one proposal at a time, in row order
      const outcome = await propose(github, {
        row,
        state: rowState,
        base: values.base,
        dryRun: values['dry-run'],
        startsCi: process.env['PULL_REQUEST_STARTS_CI'] === 'true',
      });
      lines.push(`- ${outcome.line}`);
    }
  }
  const markdown = [
    state ? renderShadowMarkdown(state, registry) : '## Shadow rows (FQ-13)\n\nThe flake ledger has no state yet.\n',
    lines.length > 0 ? ['### Promotions', '', ...lines, ''].join('\n') : 'No shadow row has met the bar.\n',
  ].join('\n');
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
