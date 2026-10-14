---
cli: patch
---

`tau tui` no longer drops a prompt whose enter arrives right after the prompt is drawn. On a busy machine that enter could reach the keyboard handler of the previous frame, which still held an empty prompt, so nothing was sent and no notice said so. The prompt, and the `q` and `c` letters that act only on an empty prompt, now read the latest text.
