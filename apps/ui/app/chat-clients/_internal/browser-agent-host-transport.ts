import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

/** Carries an already-open projection watch to the AI SDK; the session actor owns host commands. */
export class BrowserPlacementChatTransport<Message extends UIMessage> implements ChatTransport<Message> {
  #armed: ReadableStream<UIMessageChunk> | undefined;

  /** Give the next SDK request only this projection watch; it never issues a host command. */
  public arm(stream: ReadableStream<UIMessageChunk>): void {
    if (this.#armed !== undefined) {
      throw new Error('A chat watch is already armed.');
    }
    this.#armed = stream;
  }

  /** Forget only this unconsumed watch when its stream actor detaches. */
  public disarm(stream: ReadableStream<UIMessageChunk>): void {
    if (this.#armed === stream) {
      this.#armed = undefined;
    }
  }

  public async sendMessages(
    _options: Parameters<ChatTransport<Message>['sendMessages']>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const stream = this.#armed;
    this.#armed = undefined;
    if (stream === undefined) {
      throw new Error('The chat transport was not armed with a run watch.');
    }
    return stream;
  }

  public async reconnectToStream(
    _options: Parameters<ChatTransport<Message>['reconnectToStream']>[0],
  ): ReturnType<ChatTransport<Message>['reconnectToStream']> {
    const stream = this.#armed;
    this.#armed = undefined;
    return stream ?? null;
  }
}
