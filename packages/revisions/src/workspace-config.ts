/**
 * The generated ignore file, derived from the path registry.
 *
 * The revision engine tracks whatever the ignore file does not exclude, so
 * derived content is excluded by a generated file rather than by hope
 * (I-DERIVED). What counts as derived is not restated here: it is every
 * {@link pathRegistry} row whose bytes are not versioned, so the ignore file
 * and the recorder's capture exclusions cannot drift — which is how
 * `.git/HEAD`, `.tau/artifacts/**` and `node_modules` once reached a captured
 * tree.
 *
 * The content is pure. Each adapter supplies its own writer, so the same bytes
 * land on a Node host and in the browser provider.
 */

import { pathRegistry } from '@taucad/filesystem/path-registry';

const unversioned = pathRegistry.filter((row) => !row.versioned);

/**
 * Paths never carried by a revision, as ignore patterns. The `.tau` entries are
 * anchored to the project root because that is the only place they are Tau's;
 * `node_modules` is unanchored because a nested one is derived too.
 *
 * @public
 */
export const generatedIgnoreEntries: readonly string[] = Object.freeze(
  unversioned.map((row) => `${row.anchored ? '/' : ''}${row.prefix}${row.directory ? '/' : ''}`),
);

/** Project-relative path of the generated ignore file. @public */
export const generatedIgnorePath = '.gitignore';

const markerStart = '# BEGIN Tau generated — derived content is never versioned';
const markerEnd = '# END Tau generated';

/**
 * Merge Tau's required ignore lines into any existing ignore file.
 *
 * Existing content is preserved: a hand-written ignore file keeps every line it
 * had, and re-running this is a no-op once the block is present.
 *
 * @param existing - Current ignore file content, or `undefined` when absent.
 * @param additional - Extra project-specific lines to include in the block.
 * @returns The full file content to write.
 * @public
 */
export const generatedIgnoreContent = (existing: string | undefined, additional: readonly string[] = []): string => {
  const required = [...generatedIgnoreEntries, ...additional];
  const previous = existing ?? '';
  const withoutBlock = previous.includes(markerStart)
    ? previous.slice(0, previous.indexOf(markerStart)) +
      previous.slice(previous.indexOf(markerEnd) + markerEnd.length).replace(/^\n/u, '')
    : previous;
  const head = withoutBlock === '' ? '' : withoutBlock.endsWith('\n') ? withoutBlock : `${withoutBlock}\n`;
  return `${head}${markerStart}\n${required.join('\n')}\n${markerEnd}\n`;
};
