---
revisions: patch
---

A cold Tau Cloud connect asks for the remote's advertisement as the connect is written, beside the store's creation, its Start version and the remote's config write, and `validate` takes that listing instead of asking again; the connect-time fetch then takes it as before. The listing is used only for the destination it was asked for and by the connect that asked; a re-pointed, replaced or removed remote lists again, a failed listing is asked again by `validate`, and a remote with a credential to authorize (GitHub) is not asked early.
