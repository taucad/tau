/**
 * The contents of a file in memory: a Uint8Array (a Node Buffer is one), another view of an
 * ArrayBuffer (a DataView, a typed array) or an ArrayBuffer itself, as `await file.arrayBuffer()`
 * and `await (await fetch(url)).arrayBuffer()` give it.
 */
export type BytesLike = Uint8Array | ArrayBufferView | ArrayBuffer;
