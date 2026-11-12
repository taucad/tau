---
agent-plugin: minor
---

The `tau` skill's Kernels section is generated from Tau's kernel catalog and routing rules instead of written by hand. It names no default kernel: when the project has no model file, the agent chooses one by the rules (ownership, the kernels available in the plugin, an explicit request, the required output, input and process, then representation) and the use-case table, asks only when two rules conflict or the best fit is not available, and says which kernel it chose and why before modelling. OpenCascade is listed without a skill, and Zoo is left out, since the plugin has no path to it.
