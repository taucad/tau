---
host: patch
---

Grok permission readback now works when the session folder sits on its own filesystem, such as a tmpfs `/tmp`. Git stops looking for a repository at that boundary and says "or any parent up to mount point" instead of "or any of the parent directories"; both now mean the folder is not in a repository, so the readback uses the folder's own scope instead of giving up.
