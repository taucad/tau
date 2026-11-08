import { convertLegacyProjectManifestBytes, parseProjectManifestBytes } from '@taucad/types';
import type { ProjectManifestParseResult } from '@taucad/types';
import { largeObjectThresholdBytes } from '@taucad/revisions';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { ENV } from '#environment.config.js';
import { githubConnections } from '#lib/github-connections.js';
import { githubNoreplyAuthor } from '#lib/github-project-binding.js';
import { getRevisionSessionUser } from '#lib/revision-actor.js';
import type { LinkedImportRequest } from '#machines/import-linked.js';

/* The largest worktree a linked import materializes; the worker's own bound for every answer but the pack. */
const maximumMaterializedBytes = 256 * 1024 * 1024;

/** Read a declaration for a new Git import; legacy identity never becomes the new local binding. */
export const readLinkedGithubManifest = (bytes: Uint8Array<ArrayBuffer>): ProjectManifestParseResult => {
  const parsed = parseProjectManifestBytes(bytes);
  if (parsed.success) {
    return parsed;
  }
  const converted = convertLegacyProjectManifestBytes(bytes);
  return converted.success ? { success: true, data: converted.data.manifest } : parsed;
};

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

const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

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
  const actorId = getRevisionSessionUser()?.id ?? `github:${String(selection.connection.subject)}`;
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
        actorId,
        actor: { kind: 'user', id: actorId, ...author },
        trigger: 'save',
        createdAt: Date.now(),
      },
      summary: { generated: 'Set up this repository as a Tau project' },
    },
  };
  return { request, generation: credential.generation };
}
