/**
 * Git-lfs's filter keys, as `git lfs install --local --skip-repo` writes them, read from Git's own listing of a
 * store's config.
 *
 * That command sets five keys and nothing else, but it is one `git-lfs` process and the eight to thirteen `git`
 * processes it starts. On a host where starting git-lfs takes seconds that is the whole of a store's open (L4 runs
 * 44058328613 and 44062657747: "Native Git stopped lfs: deadline"). Git reads and writes the same keys itself.
 *
 * @internal
 */

/** The keys and values git-lfs 3 writes, by the names `git config --get-regexp` lists them under. */
export const largeObjectFilterKeys: ReadonlyMap<string, string> = new Map([
  ['lfs.repositoryformatversion', '0'],
  ['filter.lfs.process', 'git-lfs filter-process'],
  ['filter.lfs.required', 'true'],
  ['filter.lfs.clean', 'git-lfs clean -- %f'],
  ['filter.lfs.smudge', 'git-lfs smudge -- %f'],
]);

/** What `git config --local --get-regexp` matches of them: {@link largeObjectFilterKeys}' names, and any other `filter.lfs` key. */
export const largeObjectFilterPattern = String.raw`^(lfs\.repositoryformatversion|filter\.lfs\.)`;

/**
 * The keys a store lacks, from Git's listing of what it holds.
 *
 * @internal
 * @param listing - `git config --local --get-regexp` output for {@link largeObjectFilterPattern}: one `key value`
 *   line per value, empty when none matched.
 * @returns The keys to write with their values (none when the store holds them all), or `undefined` when a key it
 *   holds has another value or more than one, which only git-lfs answers for.
 */
export const missingLargeObjectFilters = (listing: string): ReadonlyArray<readonly [string, string]> | undefined => {
  const held = new Map<string, string[]>();
  for (const line of listing.split(/\r?\n/u)) {
    if (line !== '') {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      held.set(key, [...(held.get(key) ?? []), space === -1 ? '' : line.slice(space + 1)]);
    }
  }
  for (const [key, values] of held) {
    if (values.length !== 1 || values[0] !== largeObjectFilterKeys.get(key)) {
      return undefined;
    }
  }
  return [...largeObjectFilterKeys].filter(([key]) => !held.has(key));
};
