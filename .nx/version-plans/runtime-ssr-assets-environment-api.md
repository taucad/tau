---
runtime: patch
---

The runtime's server-asset Vite plugin also rewrites relative `new URL('./<file>', import.meta.url)` references when an app builds client and server from one shared config (Vite's Environment API, as React Router's `v8_viteEnvironmentApi` does), so the server bundle keeps finding its skill and API documents.
