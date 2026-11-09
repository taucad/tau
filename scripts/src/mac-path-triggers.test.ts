import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * A change to the shared setup action alone requests no macOS runner on a pull request (Wave 0M,
 * AF-3). The path-filtered workflows that run macOS legs on pull requests keep their own file and
 * their product paths; a `setup-nx` change is qualified on macOS by dispatching them on the branch.
 */

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.github/workflows');

type Workflow = { readonly on?: { readonly pull_request?: { readonly paths?: readonly string[] } } };

const paths = (file: string): readonly string[] =>
  (load(readFileSync(resolve(directory, file), 'utf8')) as Workflow).on?.pull_request?.paths ?? [];

/** The path-filtered workflows whose pull request runs request a macOS runner. */
const macPullRequestWorkflows = ['build123d-native.yml', 'desktop-packaging.yml'] as const;

describe('macOS pull request path triggers', () => {
  it.each(macPullRequestWorkflows)('should not start %s for a setup-nx change alone', (file) => {
    expect(paths(file)).not.toContain('.github/actions/setup-nx/**');
    expect(paths(file).some((path) => path.startsWith('.github/actions/'))).toBe(false);
    expect(paths(file)).toContain(`.github/workflows/${file}`);
  });

  it('should list every path-filtered workflow that names macOS and triggers on a setup-nx change', () => {
    // Desktop tooling also lists setup-nx, but requests macOS only on dispatch (its pull request legs
    // are Linux and Windows). A new workflow on this list is a macOS cost the AF-3 row must review.
    const listed = readdirSync(directory)
      .filter((file) => file.endsWith('.yml'))
      .filter((file) => paths(file).includes('.github/actions/setup-nx/**'))
      .filter((file) => /macos/u.test(readFileSync(resolve(directory, file), 'utf8')));
    expect(listed).toEqual(['desktop-tooling.yml']);
  });
});
