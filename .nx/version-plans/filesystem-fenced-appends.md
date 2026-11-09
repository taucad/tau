---
filesystem: minor
---

`@taucad/filesystem` fences record-log appends (charter D23). An `append` changeset entry may carry `fence: { expectedLength, token? }`, checked under the changeset's exclusive token for the path with a metadata-only stat: it fails with `EAPPENDSTALE` (`expectedLength`, `actualLength`) when another writer appended first, and with `EFENCED` (`token`, `highest`) when its token is lower than one this authority already applied to the path. An applied append's receipt names the provider's durability class (`durability`). `applyChangesetToProvider` refuses a fenced append, since a bare provider holds no lock to keep the fence true. `AppendFence` and `AppendDurability` are exported.
