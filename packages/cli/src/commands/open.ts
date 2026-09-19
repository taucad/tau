/**
 * `tau open` — bring a project this machine has never held down from Tau Cloud
 * (W18 DEF-2, architecture `:453`, AC17/AC21).
 *
 * The terminal's half of the *From Tau Cloud* section in the project library,
 * and the same two machines behind it: `GET /v1/projects` says which projects
 * this account has, and `openProjectRevisions().openFromRemote()` connects the
 * `tau` remote and waits for W13's open pull to materialize the live checkout.
 * Nothing here checks anything out itself.
 *
 * Two things only a terminal has to be told, exactly as `tau publish` is told
 * them: which API (`TAU_API_URL`) and the session token (`TAU_API_TOKEN`). The
 * token authorizes the listing and the fetch; nothing is written under the
 * project — not into `.git/config`, not into a credential helper, not into the
 * remote URL (P40).
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { openProjectRevisions } from '@taucad/host';
import type { ProjectRevisionVerbs } from '@taucad/host';
import { defineCommand } from 'citty';

import { cliError, emit, exitCodes, writeStdout } from '#output.js';
import { requireGitToolchain } from '#commands/revisions.js';
import { requireApi } from '#commands/publish.js';

/** One project as `GET /v1/projects` answers it, as this command uses it. */
type CloudProject = Readonly<{ id: string; name: string }>;

/**
 * Whether one wire row is usable.
 *
 * Its own copy rather than a shared one (review R7): the browser has the same
 * three lines for the same wire, and two small copies are cheaper than a
 * dependency between `packages/cli` and `apps/ui`.
 *
 * @param value - One entry of the route's array.
 * @returns Whether it carries the two fields this command reads.
 */
const isCloudProject = (value: unknown): value is CloudProject =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Readonly<{ id?: unknown }>).id === 'string' &&
  typeof (value as Readonly<{ name?: unknown }>).name === 'string';

/**
 * Every project this account has on Tau Cloud.
 *
 * @param api - The API origin and the session token.
 * @returns The caller's projects, most recently changed first.
 * @throws CliError When Tau Cloud refused, in words a person can act on (A18).
 */
const listCloudProjects = async (
  api: Readonly<{ apiBaseUrl: string; apiToken: string }>,
): Promise<readonly CloudProject[]> => {
  const response = await fetch(`${api.apiBaseUrl.replace(/\/$/u, '')}/v1/projects`, {
    /* eslint-disable @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire. */
    headers: { Accept: 'application/json', Authorization: `Bearer ${api.apiToken}` },
    /* eslint-enable @typescript-eslint/naming-convention -- end wire header names. */
  });
  if (!response.ok) {
    throw cliError(
      response.status === 401 ? 'NO_API_TOKEN' : 'PROJECTS_UNAVAILABLE',
      response.status === 401
        ? 'Tau Cloud did not accept this token. Set TAU_API_TOKEN to a current session token.'
        : 'Tau Cloud could not list this account’s projects. Try again.',
      exitCodes.refused,
    );
  }
  const body: unknown = await response.json();
  return Array.isArray(body) ? body.filter((entry) => isCloudProject(entry)) : [];
};

/**
 * A directory name a person would recognise, from the name the project has.
 *
 * @param project - The project being opened.
 * @returns Its name as a directory, or its id when the name has nothing usable.
 */
const directoryNameOf = (project: CloudProject): string =>
  project.name
    .toLowerCase()
    .replaceAll(/[^\da-z]+/gu, '-')
    .replaceAll(/^-|-$/gu, '') || project.id;

/** `tau open [project]`. */
export const openCommand = defineCommand({
  meta: {
    name: 'open',
    description: 'Open one of this account’s Tau Cloud projects on this machine',
  },
  args: {
    project: {
      type: 'positional',
      description: 'Project to open (run `tau open` with no project to list them)',
      required: false,
    },
    into: {
      type: 'string',
      description: 'Directory to open it into (defaults to a new directory named after the project)',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Write one versioned JSON result record to stdout instead of plain lines',
      required: false,
    },
  },
  async run({ args }) {
    const api = requireApi();
    const projects = await listCloudProjects(api);

    if (args.project === undefined || args.project === '') {
      if (args.json) {
        await emit({ kind: 'projects', ok: true, projects });
        return;
      }
      if (projects.length === 0) {
        await writeStdout('This account has no projects on Tau Cloud yet.\n');
        return;
      }
      await writeStdout(projects.map((project) => `${project.id}  ${project.name}\n`).join(''));
      return;
    }

    const project = projects.find((candidate) => candidate.id === args.project);
    if (project === undefined) {
      throw cliError(
        'NO_SUCH_PROJECT',
        `This account has no project ${args.project} on Tau Cloud. Run \`tau open\` to list them.`,
        exitCodes.refused,
      );
    }

    /* The binaries first, so "git-lfs is not installed" never reaches a person
       as "this project could not be opened" (OQ-B8). */
    await requireGitToolchain();
    const workspaceRoot = resolve(args.into ?? directoryNameOf(project));
    /* An existing directory is only safe when it is empty: the open pull writes
       the remote's tree over this one, and a directory with work in it is not
       something a `tau open` may quietly overwrite. */
    const present = existsSync(workspaceRoot) ? await readdir(workspaceRoot) : [];
    if (present.length > 0) {
      throw cliError('DIRECTORY_NOT_EMPTY', `${workspaceRoot} is not empty.`, exitCodes.refused);
    }
    await mkdir(workspaceRoot, { recursive: true });

    const revisions: ProjectRevisionVerbs = openProjectRevisions({
      workspaceRoot,
      projectId: project.id,
      apiBaseUrl: api.apiBaseUrl,
      apiToken: api.apiToken,
    });
    try {
      const outcome = await revisions.openFromRemote();
      if (args.json) {
        await emit({
          kind: 'project',
          ok: outcome.status === 'opened',
          id: project.id,
          path: workspaceRoot,
          ...outcome,
        });
      }
      if (outcome.status === 'opened') {
        if (!args.json) {
          await writeStdout(`${workspaceRoot}\n`);
        }
        return;
      }
      throw cliError('OPEN_REFUSED', outcome.reason, exitCodes.refused);
    } finally {
      await revisions.close();
    }
  },
});
