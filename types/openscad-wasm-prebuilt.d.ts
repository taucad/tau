declare module 'openscad-wasm-prebuilt' {
  const OpenSCAD: (opts?: Record<string, unknown>) => Promise<any>;
  export default OpenSCAD;
}