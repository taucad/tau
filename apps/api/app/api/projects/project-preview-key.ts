/*
 * A catalog preview's place and size (DC1). Apart from its writer
 * (`project-preview-store.ts`) so tau-api, which only reads it, reaches no
 * write under `repos/`.
 */

/** A catalog image is bounded separately from optional generated exports. */
export const projectPreviewMaximumBytes = 256 * 1024;

/**
 * @param input - The project's owner and id.
 * @returns The preview's key in the private `tenants` namespace.
 */
export const projectPreviewKey = (input: { readonly ownerId: string; readonly projectId: string }): string =>
  `${input.ownerId}/repos/${input.projectId}/catalog-preview.webp`;
