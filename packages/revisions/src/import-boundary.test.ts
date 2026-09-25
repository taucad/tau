/**
 * EQ6 / W10.6: the path policy reaches this package by injection, not by import.
 *
 * The mirror of `packages/filesystem`'s own `path-registry` rule (D6): the mask is
 * the mechanism and a project's reserved layout is data, so the classifier is
 * given to `createRevisionActors` and carried to every site that asks. One
 * module may name the default — it pairs the classifier with the rows the
 * generated ignore block is derived from, which is what keeps PP5 a property of
 * the pair rather than a coincidence.
 *
 * ponytail: a regex over comment-stripped source, the same shape L1's rule
 * uses. It reads text, so the rule is about what a reader sees the module
 * import; a stale allow-list entry fails as loudly as an unlisted violation.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceDirectory = new URL('.', import.meta.url).pathname;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

/** Code with `//` and block comments removed, so a JSDoc example is not a violation. */
const withoutComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/(^|[^:])\/\/.*$/gmu, '$1');

/**
 * The one module allowed to name Tau's own layout.
 *
 * It exports `tauRevisionPolicy`, the classifier-and-rows pair every default
 * reads, so moving the import here is what makes the rule below true of
 * everything else — including the two adapters, which write a Tau store and so
 * take the default rather than a policy of their own.
 */
const registryOwner = 'workspace-config.ts';

describe('@taucad/revisions path policy boundary', () => {
  const violations = sourceFiles(sourceDirectory)
    .map((file) => ({ file: file.slice(sourceDirectory.length), code: withoutComments(readFileSync(file, 'utf8')) }))
    .filter(({ file }) => !file.endsWith('.test.ts') && !file.endsWith('.test-d.ts') && !file.startsWith('test/'))
    .filter(({ file }) => file !== registryOwner)
    .filter(({ code }) => /['"][^'"]*path-registry[^'"]*['"]/u.test(code))
    .map(({ file }) => file)
    .sort();

  it('should import the path registry in exactly one module, which owns the default', () => {
    expect(violations).toEqual([]);
  });

  it('should prove the owner really does import it, so the rule is not vacuous', () => {
    const owner = withoutComments(readFileSync(join(sourceDirectory, registryOwner), 'utf8'));

    expect(/['"][^'"]*path-registry[^'"]*['"]/u.test(owner)).toBe(true);
  });
});
