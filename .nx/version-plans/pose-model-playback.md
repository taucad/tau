---
host: minor
mcp: minor
agent-plugin: minor
---

Agents drive and read a moving assembly's motion (live-render LRP-7).

- `tau mcp` serves `pose_model { targetFile?, animation?: { id, action: 'play' | 'pause' | 'seek' | 'reset', time?, speed? }, coordinates? }`. The server evaluates the pose from the mechanism the shown GLB carries, with the solver the Kinematics pane runs, keeps each shown model's playback (a playing clip advances on the server clock), and answers the mechanism's joints and animation ids, the playback, every coordinate (drivers and coupled followers) and those at a limit. A named `targetFile` the viewer does not show is shown first; a model without a mechanism is refused with `NO_MECHANISM`, an unknown clip with `UNKNOWN_ANIMATION` and a coordinate that is not a driver with `UNKNOWN_COORDINATE`, each naming the valid ids.
- Each viewer page showing the model applies the command through `app_sync` (`TauViewerSyncResult.pose`, a `TauViewerPoseCommand`), and reports `mechanism`, `playback` and `coordinates` in its view once the server lists them under `accepts`; `view_state` prints a `Motion:` line.
- `screenshot` takes `pose: { animation: { id, time } } | { coordinates }` and captures the mechanism moved; its `message` lists every coordinate.
- `@taucad/mcp/viewer-protocol` gains `tauViewerToolName.poseModel`, `TauViewerPlayback`, `TauViewerPoseCommand`, `TauViewerPoseInput` and `TauViewerPoseResult`; `TauMcpViewer` gains an optional `pose`.
