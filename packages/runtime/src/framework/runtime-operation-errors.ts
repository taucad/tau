import type { KernelIssue } from '#types/runtime.types.js';

/** Cooperative cancellation raised inside a kernel's native call boundary. @internal */
export class RenderAbortedError extends Error {
  public constructor() {
    super('Render aborted by a superseding document operation');
    this.name = 'RenderAbortedError';
  }

  public get code(): 'RUNTIME_RENDER_ABORTED' {
    return 'RUNTIME_RENDER_ABORTED';
  }
}

/** Identify cooperative cancellation across worker realms. @internal */
export const isRenderAbortedError = (error: unknown): error is RenderAbortedError =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'RenderAbortedError' &&
  'code' in error &&
  error.code === 'RUNTIME_RENDER_ABORTED' &&
  'message' in error &&
  typeof error.message === 'string';

/** A document, view or export operation was explicitly cancelled. @public */
export class OperationAbortedError extends Error {
  public readonly phase: string | undefined;

  public constructor(phase?: string, message = 'Runtime operation aborted.') {
    super(message);
    this.name = 'OperationAbortedError';
    this.phase = phase;
  }

  public get code(): 'RUNTIME_OPERATION_ABORTED' {
    return 'RUNTIME_OPERATION_ABORTED';
  }
}

/** Realm-safe operation-abort guard. @public */
export const isOperationAbortedError = (error: unknown): error is OperationAbortedError =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'OperationAbortedError' &&
  'code' in error &&
  error.code === 'RUNTIME_OPERATION_ABORTED' &&
  'message' in error &&
  typeof error.message === 'string' &&
  'phase' in error &&
  (error.phase === undefined || typeof error.phase === 'string');

/** A document, view or export operation exceeded its deadline. @public */
export class OperationTimeoutError extends Error {
  public readonly phase: string;

  public constructor(phase: string, message: string) {
    super(message);
    this.name = 'OperationTimeoutError';
    this.phase = phase;
  }

  public get code(): 'RUNTIME_OPERATION_TIMEOUT' {
    return 'RUNTIME_OPERATION_TIMEOUT';
  }
}

/** Realm-safe operation-timeout guard. @public */
export const isOperationTimeoutError = (error: unknown): error is OperationTimeoutError =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'OperationTimeoutError' &&
  'code' in error &&
  error.code === 'RUNTIME_OPERATION_TIMEOUT' &&
  'message' in error &&
  typeof error.message === 'string' &&
  'phase' in error &&
  typeof error.phase === 'string';

/** Produce the operational issue for an expired render deadline. @internal */
export const renderTimeoutIssue = (renderTimeout?: number): KernelIssue => ({
  message: renderTimeout === undefined ? 'Render timed out.' : `Render timed out after ${renderTimeout} ms.`,
  code: 'OPERATION_TIMEOUT',
  type: 'runtime',
  severity: 'error',
});
