---
taucad-ui: minor
---

`@taucad/ui/utils/clipboard` exports `copyText`, which copies from inside a click without losing it: known text goes through `writeText` at once, and a promise of text goes into a pending `ClipboardItem` started inside the press, so work that finishes after the gesture (a publish, a rebuild) is still copied on Safari and iOS. It answers `{ text, isCopied }` and rejects only when the text itself fails. `CopyButton` now copies through it.
