# libcascade — OCJS

1 top-level symbols. Signatures are verbatim typescript.

// libcascade runtime helpers for exception introspection
OCJS: declare class OCJS

// Extract the `Standard_Failure` data from a caught Emscripten exception pointer
static getStandard_FailureData(exceptionPtr: number): Standard_Failure;
// exceptionPtr: The raw exception pointer from the Emscripten catch block

// Whether this WASM build was compiled with exception handling enabled
static exceptionsEnabled(): boolean;

// Release the underlying C++ object to prevent memory leaks
delete(): void;

[Symbol.dispose](): void;
