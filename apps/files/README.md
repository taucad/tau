# files

The `files.<zone>` Cloudflare Worker: it serves API-signed links to private LFS objects straight from R2, over HTTP/2 and HTTP/3. The design, threat model and rollout are in the [files service blueprint](../../docs/research/files-service-blueprint.md).

The API stays the authority. Its LFS batch endpoint checks access as before and then mints a short-lived HMAC link for each object. This Worker only checks the link and streams the bytes. It never writes the bucket, never buffers a body and never logs a URL.

## Routes

| Path                                          | Methods       | Answer                                                                            |
| --------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `/v1/lfs/<ownerId>/<projectId>/<oid>?n&x&k&s` | GET, HEAD     | Tenant object `tenants/<ownerId>/lfs/<projectId>/<oid>`                           |
| `/v1/lfs-legacy/<projectId>/<oid>?n&x&k&s`    | GET, HEAD     | Legacy object `blobs/git-lfs/<projectId>/lfs/objects/<oid[0:2]>/<oid[2:4]>/<oid>` |
| `/healthz`                                    | GET, HEAD     | `200 {"status":"ok","keys":<live key count>}`, unsigned                           |
| any                                           | OPTIONS       | `204` preflight: `GET, HEAD`; `Range, If-None-Match`; max age 7200                |
| any                                           | anything else | `405 {"code":"FILES_METHOD_NOT_ALLOWED"}`                                         |

No other bucket key has a path. Repository packs and publication manifests stay unreachable even with a valid signing key.

Objects are served only on the Worker's own custom domain (`FILES_AUDIENCE`). The same link on any other host, `*.workers.dev` included, gets `400 malformed`.

## Link contract

`@taucad/file-links` (`libs/file-links`) is the contract. The API signs with it and this Worker verifies with it.

- **Query.** `n` is the size in decimal, at most 104,857,600. `x` is the expiry in Unix seconds. `k` is the key id. `s` is the HMAC-SHA256 as canonical unpadded base64url, 43 characters. Exactly these four parameters must be present, each once. Nothing is percent-decoded.
- **Signed message.** UTF-8 of `tau-files-v1\n<audience>\nGET\n<path>\n<n>\n<x>\n<k>`. The audience is the files host, for example `files.taucad.dev`. HEAD is verified against the GET signature.
- **Validity.** A link is accepted while `now ≤ x + 30` and `x − now ≤ 960`.
- **Key id.** The format is `files-<generation>-<first 16 hex of sha256(key)>`, for example `files-1-5b3d1dc4d1ca41a6`. The key itself is 32 random bytes.
- **Golden vectors.** `libs/file-links/src/vectors.json` was computed with Node's `createHmac`, independently of the library. The library, the API signer and this Worker (source and bundle) all check against it.

## Bindings

tau-cloud's `cloudflare_workers_script` declares these:

| Binding                 | Type         | Value                                                                                                                                                  |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BUCKET`                | `r2_bucket`  | `tau-<env>-content-private`. Only `get` and `head` are called                                                                                          |
| `FILES_AUDIENCE`        | `plain_text` | `files.taucad.dev` (staging), `files.tau.new` (production)                                                                                             |
| `FILES_ALLOWED_ORIGINS` | `json`       | An array of exact origins, for example `["https://taucad.dev","https://taucad-staging.netlify.app","app://tau"]`. A plain-text JSON string is read too |
| `FILES_LINK_KIDS`       | `json`       | `{"<kid>": "FILES_LINK_KEY_G<n>"}`, one entry per live generation. A plain-text JSON string is read too                                                |
| `FILES_LINK_KEY_G<n>`   | `secret_key` | `format = "raw"`, `algorithm = {name = "HMAC", hash = "SHA-256"}`, `usages = ["verify"]`                                                               |

A kid that maps to anything other than a `FILES_LINK_KEY_G<n>` binding holding a `CryptoKey` is treated as unknown (`403 key`). During a rotation, list both generations.

There is no other key binding: no JSON key list and no fallback.

This repository sets no `compatibility_date` and no compatibility flags. tau-cloud pins the date on the script (`2026-10-01`). The Worker uses only WebCrypto (including `verify` on a `secret_key` binding), Request, Response, Headers and web streams, so it needs no flag.

## API settings

The API reads these (`apps/api/app/config/environment.config.ts`):

- `TAU_FILES_BASE_URL`: a bare origin, such as `https://files.taucad.dev`. Its host must equal the Worker's `FILES_AUDIENCE`.
- `TAU_FILES_LINK_SIGNING_KEY`: JSON `{"kid": "files-<g>-<16 hex>", "alg": "HS256", "keyBase64": "<32 bytes>"}`. The API refuses to boot if the kid does not hash to the key bytes.

With both set, LFS batch downloads for projects on Tau's default storage account get files links. With either unset, downloads stay presigned. Uploads are always presigned. To roll back, unset `TAU_FILES_BASE_URL` and redeploy. The private R2 CORS rule and the CSP origins stay in place for this.

## Responses

- **Served object.** `200` or `206`, `ETag: "<oid>"`, `Cache-Control: private, max-age=31536000, immutable, no-transform`, `Content-Type: application/octet-stream`, `Accept-Ranges: bytes` and `Content-Length`.
- **Range.** One `bytes=a-b`, `a-` or `-n` range is checked against the signed size before R2 is called. An unsatisfiable range gets `416` with `Content-Range: bytes */n`. Several ranges or an unparseable value get the whole object.
- **If-None-Match.** A match gets `304` without an R2 call.
- **CORS.** An allowed `Origin` is echoed with `Vary: Origin` and the `ETag, Content-Range, Accept-Ranges, X-Tau-Files-Error` exposed. Credentials are never allowed.

| Status | `X-Tau-Files-Error`           | Body `code`                                     |
| ------ | ----------------------------- | ----------------------------------------------- |
| 400    | `malformed`                   | `FILES_MALFORMED`                               |
| 403    | `expired`, `signature`, `key` | `FILES_EXPIRED`, `FILES_SIGNATURE`, `FILES_KEY` |
| 404    | `missing`                     | `FILES_MISSING`                                 |
| 405    | none                          | `FILES_METHOD_NOT_ALLOWED`                      |
| 416    | `range`                       | `FILES_RANGE_NOT_SATISFIABLE`                   |
| 502    | `size`                        | `FILES_SIZE_MISMATCH`                           |
| 503    | `storage`                     | `FILES_STORAGE_UNAVAILABLE`                     |

`expired` also covers a link valid for more than 960 seconds from now. No error body names a key, owner, project or path.

## Logs

The Worker writes one JSON line per request to `console.log`, which Workers Logs reads:

```json
{
  "event": "files.request",
  "method": "GET",
  "route": "lfs",
  "status": 206,
  "oid": "51af7b4f1336",
  "bytes": 10,
  "range": true,
  "colo": "AKL",
  "durationMilliseconds": 3
}
```

`error` is added on a refusal. The line never carries the URL, the query, the signature, the key id, the owner, the project or the full oid.

## Build and deploy

```bash
pnpm nx run files:bundle   # or files:build
```

This writes `apps/files/dist/files-worker.mjs`, its `.map` and `files-worker.mjs.sha256`, and prints the module's SHA-256. The build is deterministic:

- esbuild runs from the workspace root, so its path comments are repository-relative.
- The module is unminified and has no banner, timestamp or `sourceMappingURL`.
- The same Tau commit and lockfile give the same bytes on any machine.
- The build fails if the bundle contains `.put(`, `.delete(`, `.list(`, `createMultipartUpload` or `resumeMultipartUpload`, on any object (tau-cloud refuses the same substrings).

The module has only a default export, `{ fetch }`. workerd reads named exports as entrypoints, so the handler factory lives in `src/worker.ts`.

Deployment is Terraform only. tau-cloud commits the bundle as `bundles/files-worker-<tau-sha12>.mjs`, pins it with `content_sha256` and deploys it with `cloudflare_workers_script`. Nothing in this repository deploys the Worker. The project is tagged `deploy:cloudflare`, not `deploy:staging`, so CI never picks it up.

## Tests

```bash
pnpm nx test files
pnpm nx typecheck files
pnpm nx lint files
```

The tests run in plain Vitest on Node with a fake R2 binding (`src/testing/fake-bucket.ts`), not in the Workers runtime:

- The handler uses only WebCrypto, Request, Response, Headers and web streams, and Node 24 implements all of them.
- `@cloudflare/vitest-plugin` 1.4.x declares Vitest 4.1 support. It would add wrangler, miniflare and the workerd binary to the lockfile, though, and on the shared CI and agent machines that cost was not worth it for a ~300-line handler.
- `src/bundle.test.ts` imports the built module itself and serves a golden link through it.
- `src/no-bucket-writes.test.ts` scans this app's source, the link library's source and the bundle for bucket writes.

The bindings are typed locally (`src/environment.ts`), and the bucket type has only `get` and `head`, so a write does not compile. `@cloudflare/workers-types` is not used.

Run `files:e2e-staging` in the staging environment once the Worker is live (blueprint §10). It is not in this project yet.
