---
picogk: minor
---

A desktop PicoGK build now offers the same authored STL and VDB exports a browser build does. The worker collects the geometry files the model wrote, in its own output directory rather than the directory holding that build's private artifacts, and reports each as a digested receipt the kernel serves as `authoredStl` or `authoredVdb`. A build that wrote none offers neither, so a payload published before this change keeps the exports it had.
