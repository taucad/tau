---
agent-plugin: minor
mcp: minor
host: minor
workbench-panes: minor
---

Add to chat in the agent plugin viewer accumulates and says where each part goes. On a host that takes model context, parts added one after another stay together for the shown model: each update carries all of them, as text and as `structuredContent.references`, because the host keeps only the page's last context, and the notice counts them ("Added to chat (2)", or "Already in chat"). A host that takes only messages gets Send to chat, which sends the new part at once. The loopback page, and a frame host that declares neither route, read Copy reference and copy the part's `@cad[<file>#<component>]` text. The card's action and the part menu share these labels, and a new model starts an empty set.

On every host the page reports the added parts through `app_sync`, and `view_state` prints `Added to chat: <label> (<componentId>), …` with `view.references` in its structured result, so the agent can act on "the part I added" without a paste. The `view_state` and `show_model` `select` descriptions say the component id is the part after `#` in a `@cad[...]` reference.

`@taucad/mcp` adds `TauViewerViewState.references`, `TauViewerSyncResult.accepts` and `tauViewerAcceptedViewFields`: `app_sync` answers list the optional view fields the server takes, and the page sends one only after a server listed it, so a newer page never has its sync rejected by an older `tau`. `@taucad/host` answers every sync with that list. `@taucad/workbench-panes` adds `ModelComponentHostActions.addToChatLabel`, the part menu's chat item label ("Add to chat" when absent).
