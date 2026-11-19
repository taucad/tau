/**
 * `tau publish` — name this project's head and publish it to the project's
 * cloud link (S32, S42, A21; stable cloud link blueprint).
 *
 * The same machine the Share pane drives, reached from a terminal: the verb
 * is `openProjectRevisions().publish`, which sends `publish` then `confirm` to
 * the revision root's `publish` child. Nothing here decides anything the pane
 * does not — no second manifest, no second upload path, no second failure copy.
 * The link shows the project's own name and description from `tau.json`, and a
 * version nobody names is named by the host (`Shared Nov 19`).
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
import { requireGitToolchain } from '#commands/history.js';

/** The draft the host's `publish` verb takes. */
type PublishDraft = Parameters<ProjectRevisionVerbs['publish']>[0];

/** What the project's own `tau.json` says: its name, its description and the file a viewer opens with. */
type ProjectManifestFields = Readonly<{
  name: string | undefined;
  description: string | undefined;
  entryPath: unknown;
}>;

const textField = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Reads `tau.json`. Without `--entry` it is required, for the file a viewer opens with; with `--entry` it only adds a
 * name and a description, so a project without one publishes under its directory's name. Only an absent `tau.json`
 * is passed over: one that exists but cannot be read may hold the project's identity, which the host then refuses
 * to guess, so it is refused here in the same words as a missing one.
 *
 * @param workspaceRoot - The project directory.
 * @param hasEntry - Whether `--entry` named the file a viewer opens with.
 * @returns What `tau.json` says, or nothing when `--entry` was given and there is no `tau.json`.
 * @throws CliError When `tau.json` is needed and absent, or exists and cannot be read.
 */
const readProjectManifest = async (workspaceRoot: string, hasEntry: boolean): Promise<ProjectManifestFields> => {
  const manifestPath = join(workspaceRoot, 'tau.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Readonly<{
      name?: unknown;
      description?: unknown;
      assets?: Readonly<{ main?: Readonly<{ entryPath?: unknown }> }>;
    }>;
    return {
      name: textField(manifest.name),
      description: textField(manifest.description),
      entryPath: manifest.assets?.main?.entryPath,
    };
  } catch (error) {
    if (hasEntry && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { name: undefined, description: undefined, entryPath: undefined };
    }
    throw cliError(
      'NO_PROJECT_MANIFEST',
      `${manifestPath} could not be read. A published project carries the tau.json Tau writes for it.`,
      exitCodes.refused,
    );
  }
};

/** The file a viewer opens with: `--entry`, else the one `tau.json` names. */
const entryPathOf = (workspaceRoot: string, entry: string | undefined, manifest: ProjectManifestFields): string => {
  if (entry !== undefined && entry !== '') {
    return entry;
  }
  if (typeof manifest.entryPath !== 'string' || manifest.entryPath === '') {
    throw cliError(
      'NO_ENTRY_PATH',
      `${join(workspaceRoot, 'tau.json')} does not say which file this project opens with. Open it in Tau once, or pass --entry.`,
      exitCodes.refused,
    );
  }
  return manifest.entryPath;
};

/** Who can open the link: `--public`, `--private`, or the link's own setting (a first publish is private). */
const visibilityOf = (args: Readonly<{ public?: boolean; private?: boolean }>): Pick<PublishDraft, 'visibility'> => {
  if (args.public === true && args.private === true) {
    throw cliError('CONFLICTING_VISIBILITY', 'Pass --public or --private, not both.', exitCodes.usage);
  }
  if (args.public === true) {
    return { visibility: 'public' };
  }
  return args.private === true ? { visibility: 'private' } : {};
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

/** `tau publish [name] [--public|--private]`. */
export const publishCommand = defineCommand({
  meta: {
    name: 'publish',
    description: 'Publish this project to its cloud link and print the link',
  },
  args: {
    name: {
      type: 'positional',
      description:
        'Name for the version this publishes, such as "Ready for print" (defaults to the version the head already is, or "Shared <date>")',
      required: false,
    },
    project: {
      type: 'string',
      description: 'Project directory (defaults to the current directory)',
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
      description: 'Let anyone with the link open it',
      required: false,
    },
    private: {
      type: 'boolean',
      description:
        'Let only people you invite open it (needs the Pro plan). Without either flag the link keeps its setting; a first publish is private',
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
    const visibility = visibilityOf(args);
    const manifest = await readProjectManifest(workspaceRoot, args.entry !== undefined && args.entry !== '');
    const entryPath = entryPathOf(workspaceRoot, args.entry, manifest);
    const name = args.name?.trim() ?? '';
    const revisions: ProjectRevisionVerbs = await openProjectRevisions({ workspaceRoot, apiBaseUrl, apiToken });
    try {
      const outcome = await revisions.publish({
        /* An empty name is the host's to fill: it has the locale (`Shared Nov 19`). */
        tag: name,
        ...(name === '' ? { isAutoNamed: true } : {}),
        projectName: manifest.name ?? basename(workspaceRoot),
        ...(manifest.description === undefined ? {} : { description: manifest.description }),
        entryPath,
        ...visibility,
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
