---
cli: minor
---

`tau serve` and `tau open` serve the Tau UI without `--ui`: the CLI pins one UI layer by digest, downloads it into the payload store once, verifies it and serves it from there. `--no-ui` serves agents only, and when the layer cannot be prepared the daemon serves agents and says why; `tau open` refuses with `UI_NOT_AVAILABLE`. Until a UI release publishes the first layer the pin is a placeholder and no download is attempted.
