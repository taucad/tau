/** Package-owned URL for the GeoSpec single-threaded OCCT artifact. @public */
export const openCascadeWasmUrl = import.meta.url.endsWith('.ts')
  ? new URL('../../native/opencascade/dist/geospec_opencascade_single.wasm', import.meta.url).href
  : new URL('opencascade/geospec_opencascade_single.wasm', import.meta.url).href;
