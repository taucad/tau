# @taucad/api-git-core

API git storage core: the repository store, the storage worker, routing, admission and forwarding

## Client to API version skew

The UI, the desktop app and the API release independently, so production pairs this API with older clients. `src/version-skew/provenance-corpus.test.ts` pushes every commit and version tag in the provenance golden corpus through the `pre-receive` hook this package writes, and fails when the hook would refuse a commit or would misjudge a version tag (P8, tau #2016). The corpus lives with the module in `packages/revisions/src/provenance/corpus/`: hand-built cases, and each `ui@` and `desktop@` release's own writer output since version 2:

```bash
node packages/revisions/scripts/pin-writer-corpus.ts           # pin every release and the working tree
node packages/revisions/scripts/pin-writer-corpus.ts --check   # exit 1 when a release or the working tree is not pinned
```

Re-pin after every client release and with any change to a record writer. When the suite fails, keep reading the pinned shape, or release the client that writes the new shape first; dropping a pinned release that production still serves hides the refusal rather than preventing it.
