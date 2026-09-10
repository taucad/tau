# libcascade — getExceptionMessage

1 top-level symbols. Signatures are verbatim typescript.

// Extract the exception type and message from a caught `WebAssembly.Exception`
declare function getExceptionMessage(ex: WebAssembly.Exception): [type: string, message: string];
// ex: The caught `WebAssembly.Exception` object
