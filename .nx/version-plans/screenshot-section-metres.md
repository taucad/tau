---
host: minor
mcp: minor
---

`screenshot`'s `section` takes its offset in metres in `tau:root`, as `arrange_workbench` writes its cuts, in Tau and over `tau mcp`: `section: { plane: 'xy', offset: 0.006 }` cuts 6 mm above the origin. Before, it took millimetres (`offsetMm`) while `arrange_workbench` wrote the same cut in metres. The result `message` and a section's render error state the cut in metres, for example "Section xy: kept z ≤ 0.006 m; the cut face is capped."

Deprecated: `section.offsetMm`, kept for one release and removed in 0.1.0-beta.8. It still reads as a deprecated alias of `offset`, never beside it: `{ plane: 'xy', offsetMm: 6 }` captures exactly what `{ plane: 'xy', offset: 0.006 }` captures. To migrate, send `offset` with the millimetre value divided by 1000. A section that gives both, or neither, is refused as invalid input. Parsed input now carries `offset` only, so a consumer of `tauMcpToolDefinitions` that reads `section.offsetMm` after parsing must read `offset`, in metres.
