---
cadmpeg: minor
---

In a browser, `@taucad/cadmpeg` no longer bundles cadmpeg's WebAssembly engines. Pass `engines: { baseUrl, layout }` to the kernel (`kernels: { import: { engines } }`) and the transcoder: with `layout: 'digest'` each engine is fetched gzipped from `blobs/sha256/<hex>` and checked against `cadmpeg-ts/digests` before it runs; with `layout: 'package'` it is fetched from `<module>_bg.wasm` as installed. Only the engine for the opened format is fetched. Without `engines` a browser kernel reports `KERNEL_NOT_PREPARED`; a refused fetch reports `KERNEL_BINDING_FAILED` (or `TRANSCODER_EXECUTION_FAILED`) with `details.engineFailure` (`unreachable`, `status`, `redirect` or `integrity`). Node is unchanged. Requires `cadmpeg-ts` 0.1.0-beta.5.
