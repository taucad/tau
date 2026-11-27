---
revisions: patch
---

A branch merge that lands now tells the checkout it wrote to re-read its head at once. Before, that checkout learned the new head only from the registry's re-read, so a cut asked in between (a project close straight after a merge) recorded over the replaced head, lost its compare-and-swap, and the close was refused with "Another writer moved this branch first".
