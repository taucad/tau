# @taucad/cli

CLI for `@taucad/runtime`.

## Export

Export a CAD source file to a target format:

```bash
taucad export model.ts --ext=glb
taucad export model.ts --ext=stl --export-options='{"binary":true}'
taucad export model.ts --ext=webp --export-options='{"width":1024,"height":576}'
taucad export model.ts --ext=glb --content='{"includeEdges":true}'
```

`--params`, `--export-options`, and `--content` accept JSON objects. Export-option and content keys depend on the route selected for the input source and target extension; unsupported keys and values are reported by the runtime.
