import { isSafeRelativePath } from '@taucad/utils/path';

export type ArtifactPathIssue = {
  readonly index: number;
  readonly name: string;
  readonly reason: 'unsafe-relative-path' | 'duplicate-path';
};

/** Validate ordered artifact names without copying or normalizing caller-owned files. */
export const validateArtifactPaths = (files: ReadonlyArray<{ readonly name: string }>): ArtifactPathIssue[] => {
  const issues: ArtifactPathIssue[] = [];
  const names = new Set<string>();
  for (const [index, { name }] of files.entries()) {
    if (!isSafeRelativePath(name)) {
      issues.push({ index, name, reason: 'unsafe-relative-path' });
    }
    if (names.has(name)) {
      issues.push({ index, name, reason: 'duplicate-path' });
    }
    names.add(name);
  }
  return issues;
};
