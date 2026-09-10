# libcascade — decrementExceptionRefcount

1 top-level symbols. Signatures are verbatim typescript.

// Decrement the reference count of a `WebAssembly.Exception`, freeing it when count reaches zero
declare function decrementExceptionRefcount(ex: WebAssembly.Exception): void;
// ex: The exception whose refcount to decrement
