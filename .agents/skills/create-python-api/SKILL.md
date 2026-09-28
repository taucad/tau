---
name: create-python-api
description: Designs a Python API in a browser-viewable DX guide. Use for Python functions, classes, keyword options, protocols, exceptions, or agent-facing Python authoring; compose create-api for shared review.
---

# Python API design

Follow [create-api](../create-api/SKILL.md) and its [authoring contract](../create-api/authoring.md).

- Show import paths and complete runnable call sites. Prefer ordinary functions and keyword-only
  options where positional meaning is unclear; use standard typing and context managers when they
  describe actual ownership.
- Show a common case, repeated or composed use, and an invalid call. Describe exceptions by type,
  message, and recovery. Avoid a custom DSL when Python data or standard protocols suffice.
- Run sketches against the actual interpreter and package when available, plus the repository's
  existing type checker if one is configured. Until the common checker supports Python, mark browser
  sketches as source excerpts and link executable evidence in the artifact index.
