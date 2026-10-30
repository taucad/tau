# @taucad/file-links

Signed download links for the Tau files service: HMAC-SHA256 link signing and verification on WebCrypto, shared by the API and the files Worker.

The API (`apps/api/app/storage/file-links.service.ts`) signs, and the `files.<zone>` Worker (`apps/files`) verifies. Both use this library, so the link format has one definition. The code uses only `globalThis.crypto.subtle`, so it runs unchanged in Node and in Cloudflare Workers. The link format, bindings and error codes are in the [files Worker README](../../apps/files/README.md) and the [files service blueprint](../../docs/research/files-service-blueprint.md) §3.

## Entrypoints

- `@taucad/file-links`
  - Path grammar and R2 keys: `fileLinkPath`, `parseFileLinkPath`, `fileLinkObjectKey`, `fileLinkLocationOfKey`.
  - Keys: `parseFileLinkSigningSecret`, `importFileLinkSigningKey`, `importFileLinkVerifyKey`, `fileLinkKeyId`.
  - Signing and verifying: `signFileLink`, `verifyFileLink`, `fileLinkMessage`.
- `@taucad/file-links/vectors`: the golden vectors (`src/vectors.json`), computed with Node's `createHmac` independently of this library. Tests only.

## Placement

This is a `libs/` project (`scope:shared`, `type:lib`) because two deployable apps share it, the API and the Worker, and it holds no application code. It cannot live in `apps/libs`, because the Worker is not a UI consumer and `apps/libs` is source-consumed private application code. It is not a public package.
