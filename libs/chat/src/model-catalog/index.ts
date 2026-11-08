/**
 * The model catalog wire schema: what `GET /v1/models` returns and the UI
 * renders. Exposed on its own subpath, not the package root, because its
 * provider and family enums are the catalog's (no `tau` entry) and would clash
 * with the chat-level `providerIdSchema` and `modelFamilySchema` exported
 * there.
 */
export * from '#model-catalog/model.schema.js';
export * from '#model-catalog/provider.schema.js';
