/**
 * Browser-safe site constants and path helpers.
 *
 * Kept apart from `static-paths.ts`, which reads the content tree through
 * `node:fs` and so cannot be imported from anything that ships to the client.
 */

/** Public origin of the standalone docs site; the single source for absolute URLs. */
export const siteOrigin = 'https://docs.tau.new';

export const socialCardImage = 'https://tau.new/android-chrome-512x512.png';

/** Static path of the prerendered raw markdown backing a documentation page. */
export const getRawMarkdownBackingPath = (documentPath: string): string => `/_llms${documentPath}.txt`;
