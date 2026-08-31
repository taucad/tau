import { base64url } from 'jose';
import { shareArtifactLimits } from '#artifact.js';
import { shareReferenceMaxCharacters } from '#locator.js';
import { ShareError } from '#provider.js';

/** Repository-backed provider identifiers supported by canonical share locators. @public */
export type RepositoryProviderId = 'github' | 'gitlab' | 'bitbucket';

/** Rename-safe GitHub repository target with a verified routing hint. @public */
export type GitHubRepoTargetV1 = {
  readonly v: 1;
  readonly repositoryId: number;
  readonly fullName: string;
  readonly commit: string;
  readonly root: string;
};

/** Rename-safe GitLab project target. @public */
export type GitLabRepoTargetV1 = {
  readonly v: 1;
  readonly projectId: number;
  readonly commit: string;
  readonly root: string;
};

/** Rename-safe Bitbucket Cloud repository target. @public */
export type BitbucketRepoTargetV1 = {
  readonly v: 1;
  readonly workspaceUuid: string;
  readonly repositoryUuid: string;
  readonly commit: string;
  readonly root: string;
};

/** Provider-specific immutable repository target union. @public */
export type RepositoryTargetV1 = GitHubRepoTargetV1 | GitLabRepoTargetV1 | BitbucketRepoTargetV1;

const commitPattern = /^[0-9a-f]{40}$/u;
const githubFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const bitbucketUuidPattern = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/u;

const fail = (): never => {
  throw new ShareError('SHARE_LOCATOR_INVALID', 'The repository share target is malformed.');
};

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isRoot = (root: unknown): root is string =>
  typeof root === 'string' &&
  new TextEncoder().encode(root).byteLength <= shareArtifactLimits.maxPathBytes &&
  root.normalize('NFC') === root &&
  !root.startsWith('/') &&
  !root.endsWith('/') &&
  !root.includes('\\') &&
  !root.includes('\0') &&
  !/%(?:2f|5c)/iu.test(root) &&
  [...root].every((character) => {
    const code = character.codePointAt(0);
    return code !== undefined && code > 31 && code !== 127;
  }) &&
  (root.length === 0 || root.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'));

const isCommit = (commit: unknown): commit is string => typeof commit === 'string' && commitPattern.test(commit);

const assertTarget = (providerId: RepositoryProviderId, input: unknown): RepositoryTargetV1 => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail();
  }
  const value = input as Record<string, unknown>;
  if (value['v'] !== 1 || !isCommit(value['commit']) || !isRoot(value['root'])) {
    return fail();
  }
  switch (providerId) {
    case 'github': {
      if (
        !hasExactKeys(value, ['v', 'repositoryId', 'fullName', 'commit', 'root']) ||
        !Number.isSafeInteger(value['repositoryId']) ||
        (value['repositoryId'] as number) <= 0 ||
        typeof value['fullName'] !== 'string' ||
        !githubFullNamePattern.test(value['fullName'])
      ) {
        return fail();
      }
      return value as GitHubRepoTargetV1;
    }
    case 'gitlab': {
      if (
        !hasExactKeys(value, ['v', 'projectId', 'commit', 'root']) ||
        !Number.isSafeInteger(value['projectId']) ||
        (value['projectId'] as number) <= 0
      ) {
        return fail();
      }
      return value as GitLabRepoTargetV1;
    }
    case 'bitbucket': {
      if (
        !hasExactKeys(value, ['v', 'workspaceUuid', 'repositoryUuid', 'commit', 'root']) ||
        typeof value['workspaceUuid'] !== 'string' ||
        !bitbucketUuidPattern.test(value['workspaceUuid']) ||
        typeof value['repositoryUuid'] !== 'string' ||
        !bitbucketUuidPattern.test(value['repositoryUuid'])
      ) {
        return fail();
      }
      return value as BitbucketRepoTargetV1;
    }
  }
};

const canonicalTarget = (providerId: RepositoryProviderId, target: RepositoryTargetV1): RepositoryTargetV1 => {
  switch (providerId) {
    case 'github': {
      const value = target as GitHubRepoTargetV1;
      return {
        v: 1,
        repositoryId: value.repositoryId,
        fullName: value.fullName,
        commit: value.commit,
        root: value.root,
      };
    }
    case 'gitlab': {
      const value = target as GitLabRepoTargetV1;
      return { v: 1, projectId: value.projectId, commit: value.commit, root: value.root };
    }
    case 'bitbucket': {
      const value = target as BitbucketRepoTargetV1;
      return {
        v: 1,
        workspaceUuid: value.workspaceUuid,
        repositoryUuid: value.repositoryUuid,
        commit: value.commit,
        root: value.root,
      };
    }
  }
};

/** Encode a validated immutable target as canonical unpadded base64url. @public */
export const formatRepositoryTarget = (providerId: RepositoryProviderId, target: RepositoryTargetV1): string => {
  const validated = assertTarget(providerId, target);
  const encoded = base64url.encode(new TextEncoder().encode(JSON.stringify(canonicalTarget(providerId, validated))));
  if (encoded.length > shareReferenceMaxCharacters) {
    return fail();
  }
  return encoded;
};

/** Decode a provider-qualified target and reject noncanonical or unknown fields. @public */
export const parseRepositoryTarget = (providerId: RepositoryProviderId, reference: string): RepositoryTargetV1 => {
  if (reference.length === 0 || reference.length > shareReferenceMaxCharacters) {
    return fail();
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64url.decode(reference)));
  } catch {
    return fail();
  }
  const target = assertTarget(providerId, input);
  if (formatRepositoryTarget(providerId, target) !== reference) {
    return fail();
  }
  return target;
};
