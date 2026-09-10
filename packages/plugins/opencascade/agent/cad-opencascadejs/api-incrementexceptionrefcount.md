# libcascade — incrementExceptionRefcount

1 top-level symbols. Signatures are verbatim typescript.

// Increment the reference count of a `WebAssembly.Exception` to prevent premature disposal
declare function incrementExceptionRefcount(ex: WebAssembly.Exception): void;
// ex: The exception whose refcount to increment
