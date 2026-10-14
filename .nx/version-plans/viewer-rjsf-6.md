---
viewer: minor
---

The parameter form runs on `@rjsf/core`, `@rjsf/utils` and `@rjsf/validator-ajv8` 6.11, which publish ES modules, so every `@taucad/viewer/parameters/*` entry now loads in plain Node as well as in a bundler. `@rjsf/validator-ajv8` becomes a runtime dependency because `@rjsf/core` 6 imports it from its entry point without declaring it. A consumer that renders `templates`, `widgets` or `rjsfFields` in its own `Form` needs RJSF 6, and `templates` is now typed as the partial set RJSF merges over its defaults. The `rjsfValidator` builds its error schema from each error's quoted path, so a key containing `.`, `[`, `]` or no characters at all is addressed correctly, and it passes that error schema to a custom validator as RJSF 6 does. A root-level parameter with an empty name keeps its own path, so editing it no longer replaces the other parameters.
