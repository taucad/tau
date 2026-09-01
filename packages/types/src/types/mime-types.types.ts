import type { mimeTypes } from '#constants/mime-types.constants.js';

/** Union of all file extensions that have a known MIME type in {@link mimeTypes}. */
export type FileExtension = keyof typeof mimeTypes;

/** Union of all MIME type strings defined in {@link mimeTypes}. */
export type MimeType = (typeof mimeTypes)[FileExtension];
