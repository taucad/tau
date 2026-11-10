---
revisions: minor
taucad-ui: minor
---

`readRevisionGraph` reads every branch's history in one walk and says which line each entry is drawn on: `main`'s first-parent chain, then each other branch's chain until it meets an entry a line already owns, then any side a merge brought in that no branch names, keyed by its newest entry. Chat records and conflict lines are never read as branches. Its rows are the `RevisionRow`s `readRevisionLog` returns, unnumbered, with `line` and `branch`.

`tokens.css` gains `--branch-1` to `--branch-4`, the History graph's lane colours: aliases of `--chart-1`, `--chart-4`, `--chart-5` and `--chart-3`, with `--color-branch-1` to `--color-branch-4` for Tailwind. Each keeps at least 3:1 against the pane in the light, dark, black and high-contrast themes.
