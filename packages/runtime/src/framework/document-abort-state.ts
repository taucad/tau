/** Atomic document-operation abort state in the shared signal buffer. @internal */

const generationModulo = 1_073_741_824n;
const maxEvaluationSequence = 4_294_967_295;

/** Mint a unique sequence for the lifetime of one worker; wrapping could target old work. @internal */
export const nextDocumentAbortSequence = (current: number): number => {
  if (!Number.isSafeInteger(current) || current < 0 || current >= maxEvaluationSequence) {
    throw new RangeError('Document evaluation sequence exhausted.');
  }
  return current + 1;
};

const unsigned = (state: bigint): bigint => BigInt.asUintN(64, state);

/** One atomic word holds evaluation sequence, generation and reason. @internal */
export const documentAbortState = (sequence: number, generation: number, reason: number): bigint =>
  BigInt.asIntN(64, BigInt(sequence) * 4_294_967_296n + (BigInt(generation) % generationModulo) * 4n + BigInt(reason));

/** Current globally unique evaluation sequence, or zero between native operations. @internal */
export const documentAbortSequence = (state: bigint): number => Number(unsigned(state) / 4_294_967_296n);

/** Generation captured by a client progress notification. @internal */
export const documentAbortGeneration = (state: bigint): number => Number((unsigned(state) / 4n) % generationModulo);

/** Exact abort reason published with the ownership transition. @internal */
export const documentAbortReason = (state: bigint): number => Number(unsigned(state) % 4n);

/** View the document word only when the transport allocated its eight-byte buffer. @internal */
export const documentAbortView = (buffer: SharedArrayBuffer | undefined): BigInt64Array | undefined =>
  buffer && buffer.byteLength >= 8 ? new BigInt64Array(buffer, 0, 1) : undefined;

/** Publish a native operation after the preceding one has left the serial worker lane. @internal */
export const beginDocumentAbort = (view: BigInt64Array, sequence: number): bigint => {
  const generation = (documentAbortGeneration(Atomics.load(view, 0)) + 1) % Number(generationModulo);
  const state = documentAbortState(sequence, generation, 0);
  Atomics.store(view, 0, state);
  return state;
};

/** Invalidate a completed operation, including a concurrently signalled one. @internal */
export const endDocumentAbort = (view: BigInt64Array, sequence: number): void => {
  for (;;) {
    const current = Atomics.load(view, 0);
    if (documentAbortSequence(current) !== sequence) {
      return;
    }
    const next = documentAbortState(0, (documentAbortGeneration(current) + 1) % Number(generationModulo), 0);
    if (Atomics.compareExchange(view, 0, current, next) === current) {
      return;
    }
  }
};
