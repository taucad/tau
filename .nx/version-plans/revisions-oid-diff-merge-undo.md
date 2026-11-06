---
revisions: patch
---

Read and write a real merge, a decision landing and an undo by oid diff (D10), as restore, switch and pull already do. A merge reads only the paths that the merged branch changed since the merge base, from all three sides and with large objects left local. Every other path merges to ours and comes from the checkout. An undo merges only the paths its operation changed, and is written over the checkout the restore proves to be the head. A decision landing writes the checkout from the head to the minted decision by oid diff. The decision's own reads of the conflict are unchanged.
