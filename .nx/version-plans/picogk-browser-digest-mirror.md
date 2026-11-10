---
picogk: minor
---

`@taucad/picogk`'s browser host loader admits a manifest served from a digest mirror: when the manifest URL is `<base>/blobs/sha256/<its own sha256>`, every runtime file and compiler reference is fetched from `<base>/blobs/sha256/<file sha256>` and verified before use, while runtime files keep their manifest-relative URL as the identity the generated .NET loader resolves. A mirror URL naming another digest or carrying a query is refused before any download. Any other manifest URL keeps resolving files beside the manifest, as before.
