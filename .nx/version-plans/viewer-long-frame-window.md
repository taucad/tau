---
viewer: patch
---

Long animation frames now leave the viewer as at most one `long-frame-burst` event per backend every 30 seconds, with the frame time summed over that window, instead of one event per batch the browser delivers. On software rendering nearly every frame is long, so a busy page sent one event per frame and spent a whole network's signed-out telemetry budget. Any frames still pending are sent when the observer stops or the backend changes.
