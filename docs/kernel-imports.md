### Kernel imports in @jscadui: STL and AMF deep dive

This document explains how file imports work inside `@jscadui`, with a focus on STL and AMF, and outlines concrete steps to enable these imports in the app/kernel integration.

## High-level architecture
- **Worker-centric execution**: JSCAD code and format (de)serialization run in a Web Worker initialized via `initWorker(...)` from `@jscadui/worker`.
- **Pluggable import hooks**: Each app entry point provides an `importData` object to the worker. It has:
  - `isBinaryExt(ext): boolean` — used to choose text vs binary reader.
  - `deserialize(info, fileContent) => geometry` — delegates to `@jscad/io` deserializers.
- **Automatic File-to-geometry conversion**: In the worker’s `jscadMain`, any parameter that is a `File` is read, decoded based on `isBinaryExt`, then converted to geometry via `deserialize`, replacing the `File` before `main(params)` runs.
- **IO implementation**: `@jscad/io` is bundled into the worker (as `bundle.jscad_io.js`) and provides `deserializers` (import) and serializers (export).

## Where STL/AMF are wired
Both the `jscad-web` and `model-page` apps register an `importData` object that uses `@jscad/io.deserializers[ext]` and flags STL as binary:

```23:48:jscadui/apps/jscad-web/src_bundle/bundle.worker.js
const importData = {
  isBinaryExt: ext=>ext === 'stl',
  deserialize: ({url, filename, ext}, fileContent)=>{
    try {
      const jscad_io = require('./bundle.jscad_io.js', null, readFileWeb)
      let deserializer = jscad_io.deserializers[ext]

      if(deserializer) return deserializer({output:'geometry', filename}, fileContent)
      throw new Error('unsupported format in ' + url)
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}
```

`model-page` shows both import and export mappings, including AMF in the serializer map:

```1:25:jscadui/apps/model-page/src/bundle/bundle.worker.js
// ...
const serializerMap ={
  'stla': ['stlSerializer', {binary:false}],
  'stlb': ['stlSerializer', {binary:true}],
  'amf': ['amfSerializer', {}],
  'obj': ['objSerializer', {}],
  'x3d': ['x3dSerializer', {}],
  '3mf': ['m3fSerializer', {}],
  'json': ['jsonSerializer', {}],
  'svg': ['svgSerializer', {}],
}
```

and the same `importData` pattern:

```36:50:jscadui/apps/model-page/src/bundle/bundle.worker.js
const importData = {
  isBinaryExt: ext=>ext === 'stl',
  deserialize: ({url, filename, ext}, fileContent)=>{
    try {
      const jscad_io = require('./bundle.jscad_io.js', null, readFileWeb)
      let deserializer = jscad_io.deserializers[ext]

      if(deserializer) return deserializer({output:'geometry', filename}, fileContent)
      throw new Error('unsupportd format in '+url)
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}
```

The worker converts incoming `File` params to geometry before running `main`:

```110:144:jscadui/packages/worker/worker.js
export async function jscadMain({ params, skipLog } = {}) {
  params = {...params}
  for(let p in params){
    if(params[p] instanceof File && importData){
      const info = extractPathInfo(params[p].name)
      let content = await readFileFile(params[p],{bin: importData.isBinaryExt(info.ext)})
      params[p] = importData.deserialize(info, content)
    }
  }
  // ...
  solids = flatten(await main(params || {}))
  // ...
}
```

## Supported extensions and binary handling
- **STL**: Marked as binary via `isBinaryExt: ext => ext === 'stl'`. The deserializer is selected as `deserializers['stl']` and returns geometry for `output:'geometry'`.
- **AMF**: Handled by `deserializers['amf']` (AMF is XML/text; `isBinaryExt` default false means it’s read as text before deserialization).
- Other formats exposed in exports include `stla`, `stlb`, `obj`, `x3d`, `3mf`, `json`, `svg`. Import support depends on `@jscad/io.deserializers[ext]` presence in the bundle.

## Example usage in JSCAD scripts
Requiring STL/AMF inside a project script works with the virtual FS + `@jscadui/require`:

```1:23:jscadui/apps/jscad-web/examples/STLImport/index.js
// Load the STL files using require
const sculpture = require('./3d_sculpture-VernonBussler.stl')
const frog = require('./frog-OwenCollins.stl')
```

```12:17:jscadui/apps/jscad-web/examples/AMFImport/index.js
// Load the AMF files using require
const rook = require('./Rook.amf')
const main = () => rook
```

These work because the app’s worker environment understands how to resolve paths and invoke the correct `deserializer` for each extension.

## How file bytes reach the worker
- **Drag-and-drop and project analysis**: The FS layer (`@jscadui/fs-provider`) and the service worker (`bundle.fs-serviceworker.js`) populate a virtual filesystem that `@jscadui/require` reads from.
- **Parameters as File objects**: UI code can pass `File` objects directly to the worker; `jscadMain` replaces those with geometry using `importData`.

## Implementation steps for the app
Follow these steps to enable STL and AMF imports end-to-end:

1) Bundle IO and worker plumbing
- Ensure the worker entry initializes via `initWorker(transformcjs, exportData, importData)`.
- Make `bundle.jscad_io.js` available to the worker and resolvable by `require('./bundle.jscad_io.js', null, readFileWeb)`.

2) Define import hooks
- Provide an `importData` object to `initWorker`:
  - `isBinaryExt`: return `true` for `'stl'` (and keep default `false` for AMF).
  - `deserialize({ url, filename, ext }, fileContent)`: lookup `const d = jscad_io.deserializers[ext]`; if present, call `d({ output: 'geometry', filename }, fileContent)`, else throw a helpful error.

3) Wire parameter conversion
- Ensure the worker uses `jscadMain` that:
  - Detects `File` params.
  - Calls `readFileFile(file, { bin: importData.isBinaryExt(ext) })`.
  - Replaces the `File` with the geometry returned from `deserialize`.

4) Support require() and virtual FS
- Initialize the service worker FS and route file reads through `@jscadui/require`:
  - Register the FS service worker (e.g., `bundle.fs-serviceworker.js`).
  - On drop/upload, store files in the SW FS and analyze the project (see `@jscadui/fs-provider` helpers).
  - `require('./model.stl')` and `require('./model.amf')` will then resolve and go through the same deserialization path.

5) UI integration paths
- Option A: Accept drag-and-drop and put files into the SW FS; scripts can `require()` them.
- Option B: Accept files via UI and pass them as `File` objects in kernel params; the worker replaces them with geometry automatically.

6) Error handling and UX
- If `deserializers[ext]` is missing, surface a clear message: unsupported format and filename.
- Normalize extensions to lowercase before matching.
- For large STL files, prefer transferring `ArrayBuffer` to minimize copies.

7) Testing
- Validate with:
  - Binary STL (.stl) and multiple meshes.
  - AMF (.amf) with XML content.
  - Mixed flows: `require()` from script and direct `File` param ingestion.
- Confirm geometry appears in the viewer and export still works (e.g., stla/stlb/amf).

## Notes and considerations
- AMF import does not require binary reads; rely on text read path.
- The serializer map in `model-page` includes AMF and 3MF for export; import of 3MF depends on presence of a corresponding deserializer in the IO bundle.
- Keep worker error logs visible in the UI to diagnose unsupported formats or malformed files.

## Minimal checklist
- importData provided with STL marked as binary.
- `bundle.jscad_io.js` available and loaded via `require`.
- Worker `jscadMain` converts `File` params using `importData`.
- Virtual FS + `@jscadui/require` wired for `require('./file.stl')` and `require('./file.amf')`.
- UX tested with real STL and AMF files.

