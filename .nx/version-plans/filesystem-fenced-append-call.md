---
filesystem: minor
---

`@taucad/filesystem` serves a fenced record-log append as one call: a rooted view's `appendFileFenced(path, data, fence)`, which a composed view forwards mask-checked like `appendFile`. It rejects with `EAPPENDSTALE` or `EFENCED` and writes nothing when the fence does not hold.
