import type { mimeTypes } from '#constants/mime-types.constants.js';

/** Union of all file extensions that have a known MIME type in {@link mimeTypes}.
 *
 * @public
 */
export type FileExtension = keyof typeof mimeTypes;

/** Union of all MIME type strings defined in {@link mimeTypes}.
 *
 * @public
 */
export type MimeType = (typeof mimeTypes)[FileExtension];

/** Known MIME types complete in editors; runtime artifacts may use other media types. @public */
export type MediaType = MimeType | (string & Record<never, never>);
