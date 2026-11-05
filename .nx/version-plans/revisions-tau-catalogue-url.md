---
revisions: minor
---

Add `tauCatalogueUrl`, which gives the hosted catalogue's URL for a project's own Tau Cloud repository and `undefined` for any other remote, so a host can hand the browser port a `catalogue` for its cold open. A port whose catalogue does not answer when an `upload-pack` answer passes the pack ceiling now reads that answer whole, as it did without a catalogue, rather than failing the fetch.
