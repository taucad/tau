# Changelog

## 0.1.0-beta.0

- Added automatic `KHR_draco_mesh_compression` import and opt-in Draco output on all four GLB/glTF transcoder routes.
- Removed copied Draco assets; decoder and encoder WASM now load independently from `draco3dgltf` on demand.
