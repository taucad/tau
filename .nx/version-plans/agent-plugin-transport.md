---
mcp: minor
host: minor
agent-plugin: minor
---

`app_read` takes optional `encodings` (`['gzip']`) and may answer with `encoding: 'gzip'`; `byteLength` stays the length of the raw range. `tau mcp` reads only the range asked for instead of the whole model, gzips a range when that saves at least a tenth, and refuses a range once the shown file's size, modification time or inode changed. The viewer page asks for gzip where the browser has `DecompressionStream`, decodes base64 with `Uint8Array.fromBase64` where available, and refuses a range whose length is not the one the server reported.
