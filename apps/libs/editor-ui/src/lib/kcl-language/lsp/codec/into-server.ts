/**
 * IntoServer - Message queue for sending messages TO the LSP server (worker).
 * Extends Queue to provide async iteration and sends messages via postMessage.
 */

import { Queue } from '#lib/kcl-language/lsp/codec/queue.js';
import { lspWorkerEventType } from '#lib/kcl-language/lsp/kcl-lsp-types.js';

export class IntoServer
  extends Queue<Uint8Array<ArrayBuffer>>
  implements AsyncGenerator<Uint8Array<ArrayBuffer>, void, void>
{
  private readonly worker: Worker | undefined;
  private readonly workerType: string | undefined;

  public constructor(workerType?: string, worker?: Worker) {
    super();

    if (worker && workerType) {
      this.worker = worker;
      this.workerType = workerType;
    }
  }

  public override enqueue(item: Uint8Array<ArrayBuffer>): void {
    if (this.worker && this.workerType) {
      this.worker.postMessage({
        worker: this.workerType,
        eventType: lspWorkerEventType.call,
        eventData: item,
      });
    } else {
      super.enqueue(item);
    }
  }

  public async return(): Promise<IteratorResult<Uint8Array<ArrayBuffer>, void>> {
    this.close();
    return { done: true, value: undefined };
  }

  public async throw(): Promise<IteratorResult<Uint8Array<ArrayBuffer>, void>> {
    this.close();
    return { done: true, value: undefined };
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}
