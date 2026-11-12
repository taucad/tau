import {
  convertLegacyProjectManifestBytes,
  parseProjectManifestBytes,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/types';
import type { ProjectManifest, ProjectManifestParseResult } from '@taucad/types';
import { largeObjectThresholdBytes, startSummary, startTrigger } from '@taucad/revisions';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { ENV } from '#environment.config.js';
import { githubConnections } from '#lib/github-connections.js';
import { githubNoreplyAuthor } from '@taucad/ui-core/lib/github-project-binding';
import { getRevisionSessionUser } from '#lib/revision-actor.js';
import type { LinkedImportRequest } from '@taucad/ui-core/machines/import-linked';
import { declaresManifest } from '@taucad/project-workspace/utils/project-manifest-equivalence';

/* The largest worktree a linked import materializes; the worker's own bound for every answer but the pack. */
const maximumMaterializedBytes = 256 * 1024 * 1024;

const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

/** Read a declaration for a new Git import; legacy identity never becomes the new local binding. */
export const readLinkedGithubManifest = (bytes: Uint8Array<ArrayBuffer>): ProjectManifestParseResult => {
  const parsed = parseProjectManifestBytes(bytes);
  if (parsed.success) {
    return parsed;
  }
  const converted = convertLegacyProjectManifestBytes(bytes);
  return converted.success ? { success: true, data: converted.data.manifest } : parsed;
};

/**
 * The project a linked import creates: the repository's own declaration
 * where it has a readable one, with the review's main file and chat sync.
 *
 * @param input - The reviewed selection, the main file and whether chats sync.
 * @returns The project data the create journals.
 * @public
 */
export const linkedProjectData = ({
  selection,
  mainFile,
  syncChats,
}: Readonly<{
  selection: GithubRepositorySelection;
  mainFile: string;
  syncChats: boolean;
}>): Omit<ProjectManifest, '$schema'> => {
  const parsed = selection.manifest === undefined ? undefined : readLinkedGithubManifest(selection.manifest);
  const imported = parsed?.success === true ? parsed.data : undefined;
  return imported === undefined
    ? {
        name: selection.repository.fullName,
        description: selection.repository.description ?? `Imported from ${selection.repository.htmlUrl}`,
        tags: [],
        assets: { main: { entryPath: mainFile } },
        ...(syncChats ? {} : { syncChats: false }),
      }
    : {
        name: imported.name,
        description: imported.description,
        tags: imported.tags,
        assets: { ...imported.assets, main: { ...imported.assets.main, entryPath: mainFile } },
        ...(syncChats ? {} : { syncChats: false }),
        ...(imported.syncLargeExports === undefined ? {} : { syncLargeExports: imported.syncLargeExports }),
      };
};

/**
 * The `tau.json` a linked import's create commits, byte for byte, and so
 * what its setup revision must record for the project to open with nothing
 * to save: the repository's own bytes when they parse strictly and declare
 * the same project (indentation, key order, a trailing newline or a spelled
 * out default aside), so no setup revision rewrites them; otherwise the
 * canonical encoding of the project, which the setup revision writes.
 *
 * @param selection - The reviewed selection.
 * @param data - The project data, from {@link linkedProjectData}.
 * @returns The bytes, and whether the setup revision writes them.
 * @public
 */
export const linkedSetupManifest = (
  selection: Pick<GithubRepositorySelection, 'manifest'>,
  data: Omit<ProjectManifest, '$schema'>,
): Readonly<{ bytes: Uint8Array<ArrayBuffer>; changes: boolean }> =>
  selection.manifest !== undefined && declaresManifest(selection.manifest, data)
    ? { bytes: selection.manifest, changes: false }
    : { bytes: serializeProjectManifest(projectToManifest(data)), changes: true };

/** A linked import as the page hands it to the worker: the request, and the credential generation the binding records. */
export type LinkedGithubImport = Readonly<{
  request: LinkedImportRequest;
  generation: number;
}>;

type LinkedGithubImportOptions = Readonly<{
  selection: GithubRepositorySelection;
  targetBranch: string;
  manifest: Uint8Array<ArrayBuffer>;
  mainFile: string;
}>;

/**
 * The reviewed GitHub branch as a linked import request (charter D12, I6):
 * the remote, its pinned head, the setup the review chose, and a credential
 * minted for that repository alone. The file-manager worker fetches the graph
 * into the import's staging and stages its tree; the page holds none of it.
 *
 * @param options - The reviewed selection, the target branch, the manifest and the main file.
 * @returns The request and the credential's generation.
 * @public
 */
export async function prepareLinkedGithubImport({
  selection,
  targetBranch,
  manifest,
  mainFile,
}: LinkedGithubImportOptions): Promise<LinkedGithubImport> {
  const unsupportedLargeBlob = selection.files.find((file) => file.size >= largeObjectThresholdBytes);
  if (unsupportedLargeBlob !== undefined) {
    throw new Error(
      `${unsupportedLargeBlob.path} is a large ordinary Git blob. Track it with Git LFS before importing.`,
    );
  }
  const author = githubNoreplyAuthor(selection.connection.subject, selection.connection.login);
  /* B1, I1: the Tau person who linked it, and no stand-in. A GitHub connection
   * belongs to a signed-in account, so there is always one to name. */
  const person = getRevisionSessionUser();
  if (person === undefined) {
    throw new Error('Sign in to Tau to import a repository from GitHub.');
  }
  const credential = await githubConnections.token(selection.connection.id, {
    repositoryId: selection.repository.id,
    operation: 'read',
    purpose: 'import',
  });
  const setupFiles: Array<{
    path: string;
    content: Uint8Array<ArrayBuffer>;
    mode: '100644';
  }> = [];
  if (selection.manifest === undefined || !sameBytes(selection.manifest, manifest)) {
    setupFiles.push({ path: 'tau.json', content: manifest, mode: '100644' });
  }
  if (selection.branch.head === undefined) {
    setupFiles.push({ path: mainFile, content: new Uint8Array(new ArrayBuffer(0)), mode: '100644' });
  }
  const request: LinkedImportRequest = {
    name: selection.repository.fullName,
    apiBaseUrl: ENV.TAU_API_URL,
    origin: 'https://github.com',
    repositoryUrl: selection.repository.cloneUrl,
    authorization: `Basic ${globalThis.btoa(`x-access-token:${credential.accessToken}`)}`,
    remote: {
      name: `github-${String(selection.repository.id)}`,
      url: selection.repository.cloneUrl,
      provider: 'github',
      repositoryId: String(selection.repository.id),
      fetchOnly: selection.repository.access !== 'write',
    },
    ...(selection.branch.head === undefined
      ? {}
      : { sourceRef: `refs/heads/${selection.branch.name}`, sourceHead: selection.branch.head }),
    targetBranch,
    author,
    maximumFiles: 100_000,
    maximumBytes: maximumMaterializedBytes,
    /* Always offered: bootstrap also folds in the generated Git config and records
     * a setup revision only when the tree actually changes (D34). */
    setup: {
      files: setupFiles,
      provenance: {
        source: 'import',
        /* The Tau person who linked it, so History reads it as theirs (D33). */
        actor: { kind: 'user', id: person.id, ...author },
        /* The Start version, V1 (A6): History reads it as "imported from GitHub". */
        capture: startTrigger('github'),
        via: 'browser',
        createdAt: Date.now(),
      },
      summary: { generated: startSummary('github') },
    },
  };
  return { request, generation: credential.generation };
}
