/**
 * Where the flake ledger's state is read and written (`ci-flake-ledger-state.ts`): `ledger.json` on the
 * `flake-ledger` branch, through the Git data API, or a local file for a replay.
 *
 * A write is one commit whose parent is the commit the state was read from, and the ref moves fast-forward only
 * (`force: false`), so a concurrent writer fails instead of overwriting. The first write creates the branch as an
 * orphan with a README saying who writes it.
 */
import { readFile, writeFile } from 'node:fs/promises';

import { GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { parseState, serializeState } from '#ci-flake-ledger-state.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';

/** The branch that holds the state; only `flake-ledger.yml` writes it. */
export const stateBranch = 'flake-ledger';
/** The state document's path on the state branch. */
export const statePath = 'ledger.json';

const readme = `# Flake ledger state

Written only by \`.github/workflows/flake-ledger.yml\` on \`main\` (\`scripts/src/ci-flake-ledger-ingest-cli.ts\`).
\`${statePath}\` is the per-test history of the flake ledger: executions, failures, flake events, variants, first and
last seen, built from the \`test-outcomes-*\` artifacts of merge-queue and \`main\` runs of \`ci.yml\`. Each commit is
one ingestion; its parent is the state it read. The schema is \`LedgerState\` in
\`scripts/src/ci-flake-ledger-state.ts\`. Do not edit or push this branch by hand: change the code on \`main\`.
`;

export type StateStore = {
  readonly read: () => Promise<LedgerState | undefined>;
  readonly write: (state: LedgerState, message: string) => Promise<string>;
};

/** The state on a branch, through the Git data API. */
export const branchStore = (github: Client, branch: string): StateStore => {
  let parent: string | undefined;
  return {
    async read() {
      try {
        const ref = await github.get<{ object: { sha: string } }>(
          `/repos/${github.repository}/git/ref/heads/${branch}`,
        );
        parent = ref.object.sha;
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) {
          return undefined;
        }
        throw error;
      }
      const text = await github.getText(
        `/repos/${github.repository}/contents/${statePath}?ref=${parent}`,
        'application/vnd.github.raw+json',
      );
      return parseState(text);
    },
    async write(state, message) {
      const repo = `/repos/${github.repository}`;
      // A blob's encoding defaults to UTF-8.
      const blob = await github.send<{ sha: string }>('POST', `${repo}/git/blobs`, { content: serializeState(state) });
      const files = [{ path: statePath, mode: '100644', type: 'blob', sha: blob.sha }];
      let baseTree: string | undefined;
      if (parent) {
        const parentCommit = await github.get<{ tree: { sha: string } }>(`${repo}/git/commits/${parent}`);
        baseTree = parentCommit.tree.sha;
      } else {
        const readmeBlob = await github.send<{ sha: string }>('POST', `${repo}/git/blobs`, { content: readme });
        files.push({ path: 'README.md', mode: '100644', type: 'blob', sha: readmeBlob.sha });
      }
      const tree = await github.send<{ sha: string }>('POST', `${repo}/git/trees`, {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- the Git data API's field name
        ...(baseTree ? { base_tree: baseTree } : {}),
        tree: files,
      });
      const commit = await github.send<{ sha: string }>('POST', `${repo}/git/commits`, {
        message,
        tree: tree.sha,
        parents: parent ? [parent] : [],
      });
      await (parent
        ? github.send('PATCH', `${repo}/git/refs/heads/${branch}`, {
            sha: commit.sha,
            force: false,
          })
        : github.send('POST', `${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha }));
      parent = commit.sha;
      return commit.sha;
    },
  };
};

/** The state in a local file, for a replay. */
export const fileStore = (path: string): StateStore => ({
  async read() {
    try {
      return parseState(await readFile(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  },
  async write(state) {
    await writeFile(path, serializeState(state));
    return path;
  },
});
