---
filesystem: minor
---

A changeset or batch write may carry a large-object source, `{ largeObject: oid, size }`, in place of bytes. A provider that declares the `largeObjectSources` capability materialises it from its large-object store; every other provider, and the mutation pipeline in front of one, refuses it with `EINVAL`. `NodeFsProvider` takes a `largeObjectStore` option and lands a source by cloning the stored object (`copyFile` with `COPYFILE_EXCL | COPYFILE_FICLONE`, falling back to a copy), syncing it, renaming it into place and syncing the directory, and verifies it with one hashed read-back. The applied receipt and the Project Index facts carry the source. `serveNodeFsProvider` takes `largeObjectStore(root)` and `NodeFsProviderClient` a `largeObjectSources` option; the Node fs wire protocol is now version 11.
