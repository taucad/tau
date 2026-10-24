/**
 * `tau publish` — name this project's head and publish it (S32, S42, A21).
 *
 * The same machine the Publish dialog drives, reached from a terminal: the verb
 * is `openProjectRevisions().publish`, which sends `publish` then `confirm` to
 * the revision root's `publish` child. Nothing here decides anything the dialog
 * does not — no second manifest, no second upload path, no second failure copy.
 *
 * Two things only a terminal has to be told: which API to publish to
 * (`TAU_API_URL`) and the session token (`TAU_AUTH_TOKEN`). The token authorizes
 * both halves — the publication row's request, and the push itself, which
 * carries it as a per-spawn `http.extraHeader` to Tau's own origin and to no
 * other remote (P40). Nothing is written under the project: not into
 * `.git/config`, not into a credential helper, not into the remote URL.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { openProjectRevisions } from '@taucad/host';
import type { ProjectRevisionVerbs } from '@taucad/host';
import { defineCommand } from 'citty';

import { authApiOrigin, resolveAuthToken } from '#auth.js';
import { cliError, emit, exitCodes, writeStdout } from '#output.js';
import { requireGitToolchain } from '#commands/revisions.js';

/** What the project's own `tau.json` says a viewer opens with. */
const readEntryPath = async (workspaceRoot: string): Promise<string> => {
  const manifestPath = join(workspaceRoot, 'tau.json');
  let entryPath: unknown;
  try {
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    entryPath = (manifest as Readonly<{ assets?: Readonly<{ main?: Readonly<{ entryPath?: unknown }> }> }>).assets?.main
      ?.entryPath;
  } catch {
    throw cliError(
      'NO_PROJECT_MANIFEST',
      `${manifestPath} could not be read. A published project carries the tau.json Tau writes for it.`,
      exitCodes.refused,
    );
  }
  if (typeof entryPath !== 'string' || entryPath === '') {
    throw cliError(
      'NO_ENTRY_PATH',
      `${manifestPath} does not say which file this project opens with. Open it in Tau once, or pass --entry.`,
      exitCodes.refused,
    );
  }
  return entryPath;
};

/**
 * The API this leg reaches, refusing before anything is named.
 *
 * Shared with `tau clone` (W18 DEF-2): both verbs need the same two values and
 * refuse in the same words, and a second copy could drift from this one.
 *
 * @returns The API origin and the session token.
 * @throws CliError When either is unset.
 * @internal
 */
export const requireApi = async (): Promise<Readonly<{ apiBaseUrl: string; apiToken: string }>> => {
  const apiBaseUrl = authApiOrigin();
  const apiToken = await resolveAuthToken(apiBaseUrl);
  if (!apiToken) {
    throw cliError('NO_AUTH_TOKEN', 'Run tau auth login, or set TAU_AUTH_TOKEN for automation.', exitCodes.refused);
  }
  return { apiBaseUrl, apiToken };
};

/** `tau publish <version>`. */
export const publishCommand = defineCommand({
  meta: {
    name: 'publish',
    description: 'Publish a named version of this project to Tau Cloud and print its link',
  },
  args: {
    version: {
      type: 'positional',
      description: 'Name for this version, such as v1 (an existing name moves its link forward)',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project directory (defaults to the current directory)',
      required: false,
    },
    title: {
      type: 'string',
      description: 'Title viewers see (defaults to the project directory’s name)',
      required: false,
    },
    description: {
      type: 'string',
      description: 'One or two sentences viewers see under the title',
      required: false,
    },
    entry: {
      type: 'string',
      description: 'File a viewer opens with (defaults to the one tau.json names)',
      required: false,
    },
    note: {
      type: 'string',
      description: 'Why this version has a name; recorded on the version itself',
      required: false,
    },
    public: {
      type: 'boolean',
      description: 'Publish so anyone with the link can open it (default: only people you share it with)',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Write one versioned JSON result record to stdout instead of plain lines',
      required: false,
    },
  },
  async run({ args }) {
    const { apiBaseUrl, apiToken } = await requireApi();
    const workspaceRoot = resolve(args.project ?? process.cwd());
    await requireGitToolchain();
    if (!existsSync(workspaceRoot)) {
      throw cliError('NO_PROJECT', `${workspaceRoot} does not exist.`, exitCodes.refused);
    }
    const entryPath = args.entry === undefined || args.entry === '' ? await readEntryPath(workspaceRoot) : args.entry;
    const projectName = basename(workspaceRoot);
    const revisions: ProjectRevisionVerbs = await openProjectRevisions({ workspaceRoot, apiBaseUrl, apiToken });
    try {
      const outcome = await revisions.publish({
        tag: args.version,
        projectName,
        entryPath,
        visibility: args.public === true ? 'public' : 'private',
        title: args.title === undefined || args.title === '' ? projectName : args.title,
        ...(args.description === undefined || args.description === '' ? {} : { description: args.description }),
        ...(args.note === undefined || args.note === '' ? {} : { note: args.note }),
      });
      if (args.json) {
        await emit({ kind: 'publication', ok: outcome.status === 'published', ...outcome });
      }
      if (outcome.status === 'published') {
        if (!args.json) {
          await writeStdout(`${outcome.url}\n`);
        }
        return;
      }
      throw cliError('PUBLISH_REFUSED', outcome.reason, exitCodes.refused);
    } finally {
      await revisions.close();
    }
  },
});
