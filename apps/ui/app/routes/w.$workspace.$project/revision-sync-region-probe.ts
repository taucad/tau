import { createMemoryProvider } from '@taucad/filesystem/backend';
import { createGitRemoteTransport, createIsomorphicGitRevisionPort, createRevisionHttpClient } from '@taucad/revisions';
import type { GitRemoteCredential } from '@taucad/revisions';

/** The Git remote *Change backup* would point the project at. @public */
export type RemoteProbeTarget = Readonly<{
  url: string;
  /** The minted GitHub header, for a repository picked from a connected account. */
  authorization?: string;
  provider?: 'github';
  repositoryId?: string;
}>;

/* Only the control plane is written, so the identity is never recorded anywhere. */
const probeAuthor = { name: 'Tau', email: 'probe@tau.invalid' } as const;

/**
 * Ask a Git remote for its advertisement before it replaces the project's backup (R2).
 *
 * The connect path's own `validate` question — `listRemoteRefs`, no object
 * fetched — asked on a throwaway in-memory store, because the project's store
 * records the new remote (and drops the old one) before it validates. The
 * transport is the worker's: the API's git proxy, crediting only the origin and
 * repository the credential was minted for. The remote is named as
 * `writeRemote` names it, so a refusal reads in the same words the Sync row
 * would use for it (D94).
 *
 * @param target - The address and, for a picked GitHub repository, its credential.
 * @param apiBaseUrl - Origin the Tau API is reachable at.
 * @throws RevisionPortError carrying the remote's refusal, classified as a sync would classify it.
 * @public
 */
export async function probeRemote(target: RemoteProbeTarget, apiBaseUrl: string): Promise<void> {
  const repositoryId = target.provider === 'github' ? target.repositoryId : undefined;
  const held: GitRemoteCredential = {
    apiBaseUrl,
    origin: new URL(target.url).origin,
    ...(target.authorization === undefined ? {} : { repositoryUrl: target.url, authorization: target.authorization }),
  };
  const port = createIsomorphicGitRevisionPort({
    filesystem: await createMemoryProvider(),
    http: createRevisionHttpClient({ credentials: 'include', ...createGitRemoteTransport(() => held) }),
  });
  await port.init({ author: probeAuthor, createSetupFiles: false });
  const name = repositoryId === undefined ? 'origin' : `github-${repositoryId}`;
  await port.setRemote({
    name,
    url: target.url,
    ...(repositoryId === undefined ? {} : { provider: 'github', repositoryId }),
  });
  await port.listRemoteRefs(name);
}
