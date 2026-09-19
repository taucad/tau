import { createMemoryProvider } from '@taucad/filesystem/backend';
import { revisionId } from '@taucad/revisions/algorithms';
import {
  bootstrapRemoteRevisionStore,
  createGitRemoteTransport,
  createIsomorphicGitRevisionPort,
  createRevisionHttpClient,
  largeObjectThresholdBytes,
} from '@taucad/revisions';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { ENV } from '#environment.config.js';
import { githubConnections } from '#lib/github-connections.js';

export type LinkedGithubImport = Readonly<{
  files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
  generation: number;
}>;

type LinkedGithubImportOptions = Readonly<{
  selection: GithubRepositorySelection;
  targetBranch: string;
  manifest: Uint8Array<ArrayBuffer>;
  mainFile: string;
  signal?: AbortSignal;
}>;

const maximumPackBytes = 128 * 1024 * 1024;
const maximumMaterializedBytes = 256 * 1024 * 1024;
const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const readFiles = async (
  provider: Awaited<ReturnType<typeof createMemoryProvider>>,
  path = '',
): Promise<Record<string, { content: Uint8Array<ArrayBuffer> }>> => {
  const result: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  for (const entry of await provider.readdirEntries(path)) {
    const child = path === '' ? entry.name : `${path}/${entry.name}`;
    if (entry.kind === 'dir') {
      // oxlint-disable-next-line no-await-in-loop -- deterministic provider walk.
      Object.assign(result, await readFiles(provider, child));
    } else {
      // oxlint-disable-next-line no-await-in-loop -- deterministic provider walk.
      result[child] = { content: await provider.readFile(child) };
    }
  }
  return result;
};

/** Fetch the selected GitHub graph and package it with its exact worktree for manifest-last creation. */
export async function prepareLinkedGithubImport({
  selection,
  targetBranch,
  manifest,
  mainFile,
  signal,
}: LinkedGithubImportOptions): Promise<LinkedGithubImport> {
  const unsupportedLargeBlob = selection.files.find((file) => file.size >= largeObjectThresholdBytes);
  if (unsupportedLargeBlob !== undefined) {
    throw new Error(
      `${unsupportedLargeBlob.path} is a large ordinary Git blob. Track it with Git LFS before importing.`,
    );
  }
  const credential = await githubConnections.token(selection.connection.id);
  const remoteAuthorization = `Basic ${globalThis.btoa(`x-access-token:${credential.accessToken}`)}`;
  const provider = await createMemoryProvider();
  const held = {
    apiBaseUrl: ENV.TAU_API_URL,
    origin: 'https://github.com',
    repositoryUrl: selection.repository.cloneUrl,
    authorization: remoteAuthorization,
  } as const;
  const port = createIsomorphicGitRevisionPort({
    filesystem: provider,
    http: createRevisionHttpClient({
      credentials: 'include',
      maximumResponseBytes: (url) => (url.endsWith('/git-upload-pack') ? maximumPackBytes : maximumMaterializedBytes),
      ...createGitRemoteTransport(() => held),
    }),
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
  const result = await bootstrapRemoteRevisionStore({
    port,
    remote: {
      name: `github-${String(selection.repository.id)}`,
      url: selection.repository.cloneUrl,
      provider: 'github',
      repositoryId: String(selection.repository.id),
      fetchOnly: selection.repository.access !== 'write',
    },
    ...(selection.branch.head === undefined
      ? {}
      : { sourceRef: `refs/heads/${selection.branch.name}`, sourceHead: revisionId(selection.branch.head) }),
    targetBranch,
    author: {
      name: selection.connection.login,
      email: `${String(selection.connection.subject)}+${selection.connection.login}@users.noreply.github.com`,
    },
    maximumFiles: 100_000,
    maximumBytes: maximumMaterializedBytes,
    ...(setupFiles.length === 0
      ? {}
      : {
          setup: {
            files: setupFiles,
            provenance: {
              source: 'import',
              actorId: `github:${String(selection.connection.subject)}`,
              actor: {
                kind: 'user',
                id: `github:${String(selection.connection.subject)}`,
                name: selection.connection.login,
                email: `${String(selection.connection.subject)}+${selection.connection.login}@users.noreply.github.com`,
              },
              trigger: 'save',
              createdAt: Date.now(),
            },
            summary: { generated: 'Set up this repository as a Tau project' },
          },
        }),
    ...(signal === undefined ? {} : { signal }),
  });
  const files: LinkedGithubImport['files'] = await readFiles(provider);
  for (const entry of result.tree.entries()) {
    files[entry.path] = { content: entry.content, mode: entry.mode };
  }
  return { files, generation: credential.generation };
}
