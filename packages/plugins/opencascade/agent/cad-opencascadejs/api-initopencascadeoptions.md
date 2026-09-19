# libcascade — InitOpenCascadeOptions

1 top-level symbols. Signatures are verbatim typescript.

InitOpenCascadeOptions: {
  locateFile?: (path: string, scriptDirectory: string) => string;
  wasmBinary?: ArrayBuffer | Uint8Array;
  wasmMemory?: WebAssembly.Memory;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}
