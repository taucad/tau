---
mcp: minor
host: minor
---

`evaluate_model` takes `options` for its default view, validated by the same schema as `screenshot`'s `options`, in Tau and over `tau mcp`. The kernel renders the default view with them, so the status, issues and `tessellation` report describe that rendering; omitting `options` evaluates exactly as before. Options the view refuses, and options for a model that offers no view, return `VALIDATION_ERROR`. `screenshot` and `export_model` now return `VALIDATION_ERROR` instead of `UNKNOWN` when the kernel refuses their options.
