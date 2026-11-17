# @taucad/api-git-core

API git storage core: the repository store, the storage worker, routing, admission and forwarding

## UI to API version skew

The UI and the API release independently, so production pairs this API with an older UI. `src/version-skew/released-ui-writer.test.ts` pushes every commit and version tag the last released UI writes through the `pre-receive` hook this package writes, and fails when the hook would refuse one (tau #2016). The objects in `released-ui-writer.json` come from that release's own writer:

```bash
node apps/libs/api-git-core/scripts/pin-released-ui-writer.ts           # pin the newest ui@ tag
node apps/libs/api-git-core/scripts/pin-released-ui-writer.ts --check   # exit 1 when a newer ui@ tag exists
```

Re-pin after a `ui@` release reaches production. When the suite fails, keep reading the pinned shape for one more release, or release the UI that writes the new shape first; re-pinning to a UI production does not serve yet hides the refusal rather than preventing it.
