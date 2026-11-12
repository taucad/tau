---
taucad-ui: patch
---

`ComboBoxResponsive` with sub-views now lists a search's best match first, so Enter picks it. cmdk does not reorder grouped items, so the first group in layout order used to take the highlight: in the kernel selector, typing "jscad" and pressing Enter picked OpenCascade, whose keywords match loosely, over JSCAD. Groups and their items are ordered by cmdk's own score; ties keep layout order.
