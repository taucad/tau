---
runtime: minor
---

Add optional `hashFiles(paths)` to `RuntimeFileSystemBase` and the kernel-facing `KernelFileSystem`: each path's lowercase hexadecimal SHA-256, or `'missing'` when absent, computed where the bytes live. Every filesystem bridge host (`createFileSystemBridgePort` and the bridge servers it shares code with) now answers it, digesting from its own reads, and says so in its hello. Before each request-scoped operation the kernel worker revalidates its retained files with one `hashFiles` call and no file bodies, where it used to read and hash every body itself. A 300-file closure over a bridge goes from 300 round trips to one. The rule is unchanged: bytes are hashed, never size or mtime, so a same-length rewrite is still caught. A host that does not advertise `hashFiles` keeps the old body-reading path, and the digests match the kernel's own, so cache keys do not change.
