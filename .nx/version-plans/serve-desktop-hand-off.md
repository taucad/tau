---
host: minor
cli: minor
---

`tau open --desktop` hands a served folder to Tau Desktop: the daemon serves agents only, admits `app://tau`, and opens `tau://host/<loopback origin>?code=<code>` with a single-use code that expires after a minute. `tau open --ui-origin=<origin>` does the same for the Tau UI on a website such as `https://tau.new`, with the code in the link's fragment, and `tau serve --hand-off=desktop|<origin>` is the same hand-off without the launcher. The daemon mints codes for its token holder at `/.well-known/tau-host/hand-off` (`handOffMintPath`), a listed origin redeems one at `/.well-known/tau-host/session` (`handOffSessionPath`) for a session bound to that origin, and the session admits that origin's `/agent` upgrade when offered as the `tau-session.<session>` subprotocol beside `tau-agent`.
